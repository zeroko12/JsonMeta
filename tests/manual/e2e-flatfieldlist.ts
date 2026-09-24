#!/usr/bin/env node
/**
 * Drive dev Electron with a temp entry that uses Electron's internal API.
 *
 * Trick: write a temp package.json + main entry, then run electron on
 * the directory containing package.json. Electron treats main as entry
 * and injects the real `electron` module bindings into require('electron').
 */

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { readFileSync } from 'node:fs'

const ELECTRON = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
const TMP_DIR = join(process.cwd(), 'tests', 'manual', '.e2e-tmp')
const TEST_FILE = 'D:/IonImplantationSystemData/Config/SystemConfig.json'

rmSync(TMP_DIR, { recursive: true, force: true })
mkdirSync(TMP_DIR, { recursive: true })

// package.json with main pointing at our entry
writeFileSync(join(TMP_DIR, 'package.json'), JSON.stringify({ name: 'e2e-tmp', main: 'main.cjs' }))

// entry script
writeFileSync(
  join(TMP_DIR, 'main.cjs'),
  `
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const PROJECT_ROOT = ${JSON.stringify(process.cwd())}
const TEST_FILE = ${JSON.stringify(TEST_FILE)}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
const log = []

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      preload: path.join(PROJECT_ROOT, 'out/preload/index.mjs'),
    },
  })
  win.loadFile(path.join(PROJECT_ROOT, 'out/renderer/index.html'))
  await new Promise((r) => win.webContents.once('did-finish-load', r))
  await sleep(500)

  const evalJs = (code) => win.webContents.executeJavaScript(code, true)

  async function step(name, fn) {
    try {
      const v = await fn()
      log.push({ name, ok: true, value: v })
    } catch (e) {
      log.push({ name, ok: false, error: String(e) })
    }
  }

  // Stub IPC
  await evalJs(\`
    (() => {
      window.api.file.pickDirectory = async () => ${JSON.stringify(TEST_FILE)};
      window.api.schema = { load: async () => ({}), loadDefault: async () => ({}), save: async () => ({ ok: true }) };
      window.api.process.detectMainProgram = async () => ({ running: false, pids: [] });
      window.api.file.listBackups = async () => [];
      window.api.file.onChange = () => () => {};
    })()
  \`)

  // 1. Login
  await step('login-input-visible', () => evalJs(\`!!document.querySelector('input[type=password]')\`))
  await evalJs(\`
    (() => {
      const i = document.querySelector('input[type=password]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, 'admin123'); i.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  \`)
  await evalJs(\`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('登录'))?.click()\`)
  await sleep(300)

  // 2. File picker
  await step('picker-visible', () => evalJs(\`!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('浏览'))\`))
  await evalJs(\`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('浏览')).click()\`)
  await sleep(800)

  // 3. Editor
  await step('editor-loaded', () => evalJs(\`!!document.querySelector('.flat-list')\`))
  await step('flat-field-groups', () => evalJs(\`document.querySelectorAll('.group').length\`))
  await step('flat-field-rows', () => evalJs(\`document.querySelectorAll('.field').length\`))
  await step('flat-field-first-name', () => evalJs(\`document.querySelector('.field .name')?.textContent\`))
  await step('flat-field-has-desc', () => evalJs(\`!!document.querySelector('.field .desc')?.textContent\`))
  await step('flat-field-has-input', () => evalJs(\`!!document.querySelector('.field input, .field select')\`))
  await step('flat-field-input-type', () => evalJs(\`(() => { const el = document.querySelector('.field input, .field select'); return el?.tagName + ':' + (el?.type ?? 'select') })()\`))

  // 4. Search
  await evalJs(\`
    (() => {
      const search = document.querySelector('input[placeholder*=搜索]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(search, 'DoorLock');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  \`)
  await sleep(300)
  await step('search-filtered-rows', () => evalJs(\`document.querySelectorAll('.field').length\`))
  await step('search-filtered-groups', () => evalJs(\`document.querySelectorAll('.group').length\`))
  await step('search-first-match', () => evalJs(\`document.querySelector('.field .name')?.textContent\`))

  // 5. Modify bool
  await evalJs(\`
    (() => {
      const rows = document.querySelectorAll('.field');
      for (const r of rows) {
        const name = r.querySelector('.name')?.textContent;
        if (name === 'IsFirstCtrlInvert') {
          const cb = r.querySelector('input[type=checkbox]');
          cb.click();
          return;
        }
      }
    })()
  \`)
  await sleep(300)
  await step('modified-row-visible', () => evalJs(\`!!document.querySelector('.field.modified')\`))

  fs.writeFileSync('D:/Temp/e2e-result.json', JSON.stringify(log, null, 2))
  app.exit(0)
})

app.on('window-all-closed', () => app.quit())
`,
)

// Launch electron on TMP_DIR (it picks up package.json → main.cjs)
console.log(`[e2e] electron entry dir: ${TMP_DIR}`)

const child = spawn(ELECTRON, [TMP_DIR], {
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    ELECTRON_RUN_AS_NODE: '0',
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
  console.log(`[e2e] electron exit code=${code}`)
  try {
    const log = JSON.parse(readFileSync('D:/Temp/e2e-result.json', 'utf8'))
    console.log('\n=== E2E STEPS ===')
    for (const step of log) {
      const v = step.ok
        ? JSON.stringify(step.value).slice(0, 80)
        : `ERR: ${step.error?.slice(0, 80) ?? ''}`
      console.log(`${step.ok ? '✓' : '✗'} ${step.name}: ${v}`)
    }
    const allOk = log.every((s) => s.ok)
    console.log(`\n${allOk ? '✓ E2E PASS' : '✗ E2E FAIL'}`)
    process.exit(allOk ? 0 : 1)
  } catch (e) {
    console.error('Could not read result:', e)
    process.exit(1)
  }
})
