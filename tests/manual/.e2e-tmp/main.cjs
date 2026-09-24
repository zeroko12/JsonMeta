
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const PROJECT_ROOT = "D:\\project\\配置文件管理工具"
const TEST_FILE = "D:/IonImplantationSystemData/Config/SystemConfig.json"

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
  await evalJs(`
    (() => {
      window.api.file.pickDirectory = async () => "D:/IonImplantationSystemData/Config/SystemConfig.json";
      window.api.schema = { load: async () => ({}), loadDefault: async () => ({}), save: async () => ({ ok: true }) };
      window.api.process.detectMainProgram = async () => ({ running: false, pids: [] });
      window.api.file.listBackups = async () => [];
      window.api.file.onChange = () => () => {};
    })()
  `)

  // 1. Login
  await step('login-input-visible', () => evalJs(`!!document.querySelector('input[type=password]')`))
  await evalJs(`
    (() => {
      const i = document.querySelector('input[type=password]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, 'admin123'); i.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
  await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(300)

  // 2. File picker
  await step('picker-visible', () => evalJs(`!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('浏览'))`))
  await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('浏览')).click()`)
  await sleep(800)

  // 3. Editor
  await step('editor-loaded', () => evalJs(`!!document.querySelector('.flat-list')`))
  await step('flat-field-groups', () => evalJs(`document.querySelectorAll('.group').length`))
  await step('flat-field-rows', () => evalJs(`document.querySelectorAll('.field').length`))
  await step('flat-field-first-name', () => evalJs(`document.querySelector('.field .name')?.textContent`))
  await step('flat-field-has-desc', () => evalJs(`!!document.querySelector('.field .desc')?.textContent`))
  await step('flat-field-has-input', () => evalJs(`!!document.querySelector('.field input, .field select')`))
  await step('flat-field-input-type', () => evalJs(`(() => { const el = document.querySelector('.field input, .field select'); return el?.tagName + ':' + (el?.type ?? 'select') })()`))

  // 4. Search
  await evalJs(`
    (() => {
      const search = document.querySelector('input[placeholder*=搜索]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(search, 'DoorLock');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `)
  await sleep(300)
  await step('search-filtered-rows', () => evalJs(`document.querySelectorAll('.field').length`))
  await step('search-filtered-groups', () => evalJs(`document.querySelectorAll('.group').length`))
  await step('search-first-match', () => evalJs(`document.querySelector('.field .name')?.textContent`))

  // 5. Modify bool
  await evalJs(`
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
  `)
  await sleep(300)
  await step('modified-row-visible', () => evalJs(`!!document.querySelector('.field.modified')`))

  fs.writeFileSync('D:/Temp/e2e-result.json', JSON.stringify(log, null, 2))
  app.exit(0)
})

app.on('window-all-closed', () => app.quit())
