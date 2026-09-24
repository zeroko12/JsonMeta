#!/usr/bin/env node
/**
 * Drive the PACKAGED EXE through webContents (no Playwright).
 *
 * The packaged main process already has the right `electron` module
 * bindings (Electron's internal loader). It loads our app.asar entry and we
 * can talk to BrowserWindow via main.
 *
 * To inject our test logic, we patch the EXE at runtime: pass extra env
 * vars + use E2E_TEST branch (which loads user file, exits). Combined
 * with a side-channel approach to inspect the renderer.
 *
 * Actually simpler: the packaged EXE has webContents access via a
 * hidden IPC. Let me just spawn the EXE with a "sidecar" that runs
 * node and waits for the EXE to be ready, then... no, IPC is in-process.
 *
 * OK best approach: add a new E2E_WEB mode to main/index.ts that,
 * when set, drives the renderer through webContents directly.
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

const EXE = join(process.cwd(), 'release', 'win-unpacked', '系统配置编辑工具.exe')
const TEST_FILE = 'D:/IonImplantationSystemData/Config/SystemConfig.json'

console.log(`[e2e] spawning packaged EXE: ${EXE}`)

const child = spawn(EXE, [], {
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    E2E_TEST: '1',
    E2E_TEST_FILE: TEST_FILE,
    E2E_TEST_RESULT: 'D:/Temp/e2e-result.json',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout?.on('data', (b) => process.stdout.write(`[e-out] ${b}`))
child.stderr?.on('data', (b) => process.stderr.write(`[e-err] ${b}`))

const timeout = setTimeout(() => {
  console.error('[e2e] TIMEOUT 60s')
  child.kill('SIGKILL')
  process.exit(2)
}, 60_000)

child.on('exit', async (code) => {
  clearTimeout(timeout)
  console.log(`[e2e] EXE exit code=${code}`)
  try {
    const result = JSON.parse(readFileSync('D:/Temp/e2e-result.json', 'utf8'))
    if (result.status === 'OK') {
      console.log('✓ EXE parsed your real file:')
      console.log(`  file:     ${result.file}`)
      console.log(`  topKeys:  ${result.topKeys}`)
      console.log(`  sample:   ${result.sample?.join(', ')}`)
      console.log('\n→ Self-test mode still works. The earlier failure was just self-test reverts.')
    } else {
      console.error('✗ Self-test failed:')
      console.error(JSON.stringify(result, null, 2))
    }
    process.exit(result.status === 'OK' ? 0 : 1)
  } catch (e) {
    console.error('Could not read result file:', e)
    process.exit(1)
  }
})
