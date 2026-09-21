#!/usr/bin/env node
/**
 * Real end-to-end test that bypasses Playwright's bad Electron flags.
 *
 * Spawns dev Electron with --inspect (still works in Electron 33) and
 * uses CDP via WebSocket to drive the renderer.
 */

import { spawn, ChildProcess } from 'node:child_process'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import WebSocket from 'ws'

const STUB_CONFIG = {
  SoftwareConfig: {
    EnableTermPower: { IsFirstCtrlInvert: false, IsSecondCtrlInvert: false },
  },
  IHCConfig: { DeviceName: '\\\\.\\MMIPAR0' },
  LoopMasterConfig: { Port1: 'COM1' },
  DoseControlConfig: { RemoteIPAddress: '192.168.1.16' },
  IonSourceControlConfig: {},
  PLCControlConfig: {},
  BokePumpSerialPortConfig: {},
  TemperatureControllerConfig: {},
  ChillerConfig: {},
  WarningSettingsConfig: {},
}

const ELECTRON_BIN = join('node_modules', 'electron', 'dist', 'electron.exe')
const DEBUG_PORT = 9222

let workDir: string

async function setup() {
  workDir = join(tmpdir(), `cdp-e2e-${Date.now()}`)
  await mkdir(workDir, { recursive: true })
  await writeFile(join(workDir, 'SystemConfig.json'), JSON.stringify(STUB_CONFIG, null, 2), 'utf8')
  console.log(`[cdp] workspace: ${workDir}`)
}

function startElectron(): ChildProcess {
  console.log(`[cdp] spawning electron with --inspect-brk=0 ...`)
  const proc = spawn(
    ELECTRON_BIN,
    ['.', '--inspect-brk=0', `--remote-debugging-port=${DEBUG_PORT}`],
    {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  proc.stdout?.on('data', (b) => process.stdout.write(`[electron] ${b}`))
  proc.stderr?.on('data', (b) => process.stderr.write(`[electron] ${b}`))
  proc.on('exit', (code, signal) => {
    console.log(`[cdp] electron exited: code=${code} signal=${signal}`)
  })
  return proc
}

async function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      await new Promise((resolve, reject) => {
        ws.once('open', () => {
          ws.close()
          resolve(undefined)
        })
        ws.once('error', reject)
      })
      console.log(`[cdp] devtools port ${port} is open`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`Timeout waiting for port ${port}`)
}

class CDPSession {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, (msg: unknown) => void>()
  private events: Array<{ method: string; params: unknown }> = []

  constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg)
        this.pending.delete(msg.id)
      } else if (msg.method) {
        this.events.push(msg)
      }
    })
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, (msg: { result?: unknown; error?: { message: string } }) => {
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async getDocument(): Promise<unknown> {
    return this.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
    })
  }
}

async function main() {
  await setup()

  // First, just try without --inspect-brk (might be enough)
  const electron = spawn(ELECTRON_BIN, ['.'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      E2E_DEBUG_PORT: String(DEBUG_PORT),
      ELECTRON_RUN_AS_NODE: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electron.stdout?.on('data', (b) => process.stdout.write(`[e-out] ${b}`))
  electron.stderr?.on('data', (b) => process.stderr.write(`[e-err] ${b}`))
  electron.on('exit', (code, signal) => {
    console.log(`[e-exit] code=${code} signal=${signal}`)
  })

  try {
    await waitForPort(DEBUG_PORT)
  } catch (err) {
    console.error('[cdp] devtools port did not open', err)
    electron.kill()
    process.exit(1)
  }

  const ws = new WebSocket(`ws://127.0.0.1:${DEBUG_PORT}/devtools/page/1`)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })

  const cdp = new CDPSession(ws)

  // Wait for login screen
  console.log('[cdp] waiting for password input ...')
  for (let i = 0; i < 30; i++) {
    const result = (await cdp.send('Runtime.evaluate', {
      expression: 'document.querySelector("input[type=password]") !== null',
      returnByValue: true,
    })) as { result: { value: boolean } }
    if (result.result.value) break
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('[cdp] login screen visible')

  // Type password
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const input = document.querySelector('input[type=password]');
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, 'admin123');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `,
  })
  await new Promise((r) => setTimeout(r, 200))

  // Click login
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('登录'));
        if (btn) btn.click();
      })()
    `,
  })
  console.log('[cdp] clicked login')

  // Wait for picker
  await new Promise((r) => setTimeout(r, 500))
  for (let i = 0; i < 30; i++) {
    const result = (await cdp.send('Runtime.evaluate', {
      expression: 'document.querySelector("button")?.textContent.includes("浏览")',
      returnByValue: true,
    })) as { result: { value: boolean } }
    if (result.result.value) break
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('[cdp] file picker visible')

  // Stub the pickDirectory and click browse
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        window.api.file.pickDirectory = async () => ${JSON.stringify(workDir)};
        const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('浏览'));
        if (btn) btn.click();
      })()
    `,
  })

  // Wait for topbar (loaded successfully)
  for (let i = 0; i < 60; i++) {
    const result = (await cdp.send('Runtime.evaluate', {
      expression: 'document.querySelector("header.topbar strong") !== null',
      returnByValue: true,
    })) as { result: { value: boolean } }
    if (result.result.value) break
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('[cdp] editor view loaded')

  // Verify tree
  const treeResult = (await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const keys = Array.from(document.querySelectorAll('.config-tree .node-row .key')).map(e => e.textContent);
        return JSON.stringify(keys);
      })()
    `,
    returnByValue: true,
  })) as { result: { value: string } }
  const keys = JSON.parse(treeResult.result.value) as string[]
  console.log('[cdp] tree keys:', keys.slice(0, 5).join(', '), '...')
  console.log('[cdp] total tree nodes:', keys.length)

  const hasSoftware = keys.includes('SoftwareConfig')
  const hasIHC = keys.includes('IHCConfig')

  if (!hasSoftware || !hasIHC) {
    console.error('[cdp] ✗ tree missing expected sub-configs')
    electron.kill()
    process.exit(1)
  }

  // Take screenshot via CDP
  const screenshot = (await cdp.send('Page.captureScreenshot', {
    format: 'png',
  })) as { data: string }
  const { writeFileSync } = await import('node:fs')
  writeFileSync('e2e-screenshot.png', Buffer.from(screenshot.data, 'base64'))
  console.log('[cdp] screenshot saved: e2e-screenshot.png')

  console.log('\n✓ E2E PASS — login + load + tree render all work')
  console.log('  - Tree shows SoftwareConfig:', hasSoftware)
  console.log('  - Tree shows IHCConfig:', hasIHC)
  console.log('  - Total nodes:', keys.length)

  electron.kill()
  ws.close()
  await new Promise((r) => setTimeout(r, 500))
  await rm(workDir, { recursive: true, force: true })
  process.exit(0)
}

main().catch(async (err) => {
  console.error('[cdp] FATAL', err)
  process.exit(1)
})
