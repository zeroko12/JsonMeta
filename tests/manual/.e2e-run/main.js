'use strict'
var __create = Object.create
var __defProp = Object.defineProperty
var __getOwnPropDesc = Object.getOwnPropertyDescriptor
var __getOwnPropNames = Object.getOwnPropertyNames
var __getProtoOf = Object.getPrototypeOf
var __hasOwnProp = Object.prototype.hasOwnProperty
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        })
  }
  return to
}
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, 'default', { value: mod, enumerable: true })
      : target,
    mod,
  )
)
const electron = require('electron')
const node_path = require('node:path')
const node_fs = require('node:fs')
const promises = require('node:fs/promises')
const chokidar = require('chokidar')
const HARDCODED_PASSWORD = 'admin123'
function checkPassword(input) {
  return input === HARDCODED_PASSWORD
}
const MAX_BACKUPS = 10
async function readJson(filePath) {
  let text = await promises.readFile(filePath, 'utf8')
  if (text.charCodeAt(0) === 65279) {
    text = text.slice(1)
  }
  return JSON.parse(text)
}
async function createBackup(target) {
  const dir = node_path.dirname(target)
  const base = node_path.basename(target, '.json')
  const stamp = formatTimestamp(/* @__PURE__ */ new Date())
  const bak = node_path.join(dir, `${base}.${stamp}.bak.json`)
  const text = await promises.readFile(target, 'utf8')
  await promises.writeFile(bak, text, 'utf8')
  await rotateBackups(target)
  return bak
}
function formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
async function listBackups(target) {
  const dir = node_path.dirname(target)
  const base = node_path.basename(target, '.json')
  let entries
  try {
    entries = await promises.readdir(dir)
  } catch {
    return []
  }
  const matched = entries.filter((n) => n.startsWith(`${base}.`) && n.endsWith('.bak.json'))
  const fullPaths = await Promise.all(
    matched.map(async (n) => {
      const full = node_path.join(dir, n)
      try {
        const s = await promises.stat(full)
        return { full, mtime: s.mtimeMs }
      } catch {
        return null
      }
    }),
  )
  return fullPaths
    .filter((x) => x !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.full)
}
async function rotateBackups(target, max = MAX_BACKUPS) {
  const list = await listBackups(target)
  if (list.length <= max) return 0
  const toDelete = list.slice(max)
  const { unlink } = await import('node:fs/promises')
  await Promise.all(toDelete.map((p) => unlink(p).catch(() => void 0)))
  return toDelete.length
}
async function restoreBackup(backupPath, targetPath) {
  try {
    const text = await promises.readFile(backupPath, 'utf8')
    await promises.mkdir(node_path.dirname(targetPath), { recursive: true })
    await promises.writeFile(targetPath, text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
async function hasMeaningfulChange(targetPath, newText) {
  try {
    const current = await promises.readFile(targetPath, 'utf8')
    return current !== newText
  } catch {
    return true
  }
}
async function resolveConfigPath(pickedDir) {
  const norm = pickedDir.replace(/[\\/]+$/, '')
  const candidates = [
    node_path.join(norm, 'SystemConfig.json'),
    node_path.join(norm, 'Config', 'SystemConfig.json'),
  ]
  for (const c of candidates) {
    try {
      await promises.stat(c)
      return c
    } catch {}
  }
  return null
}
async function saveJsonWithBackup(targetPath, data, options = {}) {
  try {
    const text = JSON.stringify(data, null, 2)
    const changed = await hasMeaningfulChange(targetPath, text)
    let backupPath
    if (changed && options.backup !== false) {
      try {
        backupPath = await createBackup(targetPath)
        await rotateBackups(targetPath, options.maxBackups ?? MAX_BACKUPS)
      } catch {
        backupPath = void 0
      }
    }
    await promises.mkdir(node_path.dirname(targetPath), { recursive: true })
    await promises.writeFile(targetPath, text, 'utf8')
    return { ok: true, backupPath, changed }
  } catch (err) {
    return { ok: false, changed: false, error: err.message }
  }
}
let currentWatcher = null
async function watchFile(path, cb) {
  await stopWatching()
  const watcher = chokidar.watch(path, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
  })
  watcher.on('change', (changedPath) => {
    cb({ type: 'change', path: changedPath })
  })
  watcher.on('add', (addedPath) => {
    cb({ type: 'add', path: addedPath })
  })
  watcher.on('unlink', (removedPath) => {
    cb({ type: 'unlink', path: removedPath })
  })
  currentWatcher = watcher
}
async function stopWatching() {
  if (currentWatcher) {
    await currentWatcher.close()
    currentWatcher = null
  }
}
async function loadSchema(schemaPath) {
  try {
    const text = await promises.readFile(schemaPath, 'utf8')
    return JSON.parse(text)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return emptySchema()
    }
    throw err
  }
}
async function saveSchema(schemaPath, schema) {
  await promises.mkdir(node_path.dirname(schemaPath), { recursive: true })
  const text = JSON.stringify(schema, null, 2)
  await promises.writeFile(schemaPath, text, 'utf8')
}
function emptySchema() {
  const meta = {
    version: 1,
    rootClass: '',
    generatedAt: /* @__PURE__ */ new Date().toISOString(),
    generatorVersion: '0.0.0',
  }
  return { _meta: meta }
}
const DEFAULT_PATTERNS = [/ion/i, /implant/i, /IonImplantationSystem/i]
let psListPromise = null
async function getPsList() {
  if (!psListPromise) {
    psListPromise = import('ps-list').then((m) => m.default)
  }
  return psListPromise
}
async function detectMainProgram(patterns = DEFAULT_PATTERNS) {
  const list = await getPsList()
  if (!list) return { running: false, pids: [], matchedNames: [] }
  const procs = await list()
  const matched = procs.filter((p) => patterns.some((rx) => rx.test(p.name)))
  return {
    running: matched.length > 0,
    pids: matched.map((p) => p.pid),
    matchedNames: matched.map((p) => p.name),
  }
}
electron.ipcMain.handle('auth:check', async (_event, password) => {
  return checkPassword(password)
})
electron.ipcMain.handle('file:pickDirectory', async (event) => {
  const win = electron.BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await electron.dialog.showOpenDialog(win, {
    title: '选择 SystemConfig.json 所在目录(或 DataRoot / Config 子目录)',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})
electron.ipcMain.handle('file:resolveConfigPath', async (_event, pickedDir) => {
  return resolveConfigPath(pickedDir)
})
electron.ipcMain.handle('file:readJson', async (_event, path) => {
  return readJson(path)
})
electron.ipcMain.handle('file:writeJson', async (_event, path, data, options) => {
  return saveJsonWithBackup(path, data, options ?? {})
})
electron.ipcMain.handle('file:listBackups', async (_event, targetPath) => {
  return listBackups(targetPath)
})
electron.ipcMain.handle('file:restoreBackup', async (_event, backupPath, targetPath) => {
  return restoreBackup(backupPath, targetPath)
})
electron.ipcMain.handle('file:createBackup', async (_event, targetPath) => {
  return createBackup(targetPath)
})
electron.ipcMain.handle('file:watchStart', async (_event, path) => {
  await watchFile(path, (e) => {
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send('file:onChange', e)
    }
  })
  return { ok: true }
})
electron.ipcMain.handle('file:watchStop', async () => {
  await stopWatching()
  return { ok: true }
})
electron.ipcMain.handle('schema:loadDefault', async () => {
  const { app: app2 } = await import('electron')
  const candidates = [
    node_path.join(app2.getAppPath(), 'schema.json'),
    node_path.join(process.resourcesPath, 'app.asar', 'schema.json'),
    node_path.join(process.resourcesPath, 'schema.json'),
    node_path.join(app2.getAppPath(), '..', 'schema.json'),
  ]
  let lastErr = null
  for (const path of candidates) {
    try {
      const result = await loadSchema(path)
      return { ...result, _resolvedPath: path }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(
    `schema.json not found in any of: ${candidates.join(', ')} (${lastErr?.message ?? 'unknown'})`,
  )
})
electron.ipcMain.handle('schema:load', async (_event, schemaPath) => {
  return loadSchema(schemaPath)
})
electron.ipcMain.handle('schema:save', async (_event, schemaPath, schema) => {
  await saveSchema(schemaPath, schema)
  return { ok: true }
})
electron.ipcMain.handle('process:detectMainProgram', async () => {
  return detectMainProgram()
})
const DEBUG_PORT = process.env.E2E_DEBUG_PORT ? Number(process.env.E2E_DEBUG_PORT) : 0
if (DEBUG_PORT > 0) {
  electron.app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT))
}
function createWindow() {
  const isE2E = process.env.E2E_TEST === '1'
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: '系统配置编辑工具',
    webPreferences: {
      preload: node_path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: !isE2E,
      nodeIntegration: false,
    },
  })
  win.on('ready-to-show', () => {
    win.show()
  })
  win.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(node_path.join(__dirname, '../renderer/index.html'))
  }
  return win
}
try {
  node_fs.writeFileSync(
    'D:/Temp/e2e-fired.txt',
    `pid=${process.pid}
argv=${process.argv.slice(0, 5).join(' | ')}
RAN=${process.env.E2E_TEST ?? 'unset'}
`,
  )
} catch {}
electron.app.whenReady().then(async () => {
  if (process.env.E2E_TEST === '1') {
    const filePath = process.env.E2E_TEST_FILE
    const resultPath = process.env.E2E_TEST_RESULT
    const writeResult = (status, info) => {
      if (!resultPath) {
        process.stdout.write(`[E2E_TEST] ${status} ${JSON.stringify(info)}
`)
        return
      }
      try {
        node_fs.mkdirSync(resultPath.replace(/[^\\/]+$/, ''), { recursive: true })
        node_fs.writeFileSync(resultPath, JSON.stringify({ status, ...info }, null, 2))
      } catch (err) {
        process.stdout.write(`[E2E_TEST] FAIL write-result ${err.message}
`)
      }
    }
    if (!filePath) {
      writeResult('FAIL', { error: 'E2E_TEST_FILE not set' })
      electron.app.exit(2)
      return
    }
    try {
      const data = await readJson(filePath)
      const topKeys = Object.keys(data)
      writeResult('OK', {
        file: filePath,
        topKeys: topKeys.length,
        sample: topKeys.slice(0, 3),
      })
      electron.app.exit(0)
    } catch (err) {
      writeResult('FAIL', { error: err.message, file: filePath })
      electron.app.exit(1)
    }
    return
  }
  createWindow()
  electron.app.on('activate', () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
electron.app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') electron.app.quit()
})
