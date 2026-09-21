import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron'
import { join, dirname, basename } from 'node:path'
import { stat, readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import chokidar from 'chokidar'
import psList from 'ps-list'
import __cjs_mod__ from 'node:module'
const __filename = import.meta.filename
const __dirname = import.meta.dirname
const require2 = __cjs_mod__.createRequire(import.meta.url)
const HARDCODED_PASSWORD = 'admin123'
function checkPassword(input) {
  return input === HARDCODED_PASSWORD
}
const MAX_BACKUPS = 10
async function readJson(filePath) {
  let text = await readFile(filePath, 'utf8')
  if (text.charCodeAt(0) === 65279) {
    text = text.slice(1)
  }
  return JSON.parse(text)
}
async function createBackup(target) {
  const dir = dirname(target)
  const base = basename(target, '.json')
  const stamp = formatTimestamp(/* @__PURE__ */ new Date())
  const bak = join(dir, `${base}.${stamp}.bak.json`)
  const text = await readFile(target, 'utf8')
  await writeFile(bak, text, 'utf8')
  await rotateBackups(target)
  return bak
}
function formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
async function listBackups(target) {
  const dir = dirname(target)
  const base = basename(target, '.json')
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const matched = entries.filter((n) => n.startsWith(`${base}.`) && n.endsWith('.bak.json'))
  const fullPaths = await Promise.all(
    matched.map(async (n) => {
      const full = join(dir, n)
      try {
        const s = await stat(full)
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
    const text = await readFile(backupPath, 'utf8')
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
async function hasMeaningfulChange(targetPath, newText) {
  try {
    const current = await readFile(targetPath, 'utf8')
    return current !== newText
  } catch {
    return true
  }
}
async function resolveConfigPath(pickedDir) {
  const norm = pickedDir.replace(/[\\/]+$/, '')
  const candidates = [join(norm, 'SystemConfig.json'), join(norm, 'Config', 'SystemConfig.json')]
  for (const c of candidates) {
    try {
      await stat(c)
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
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, text, 'utf8')
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
    const text = await readFile(schemaPath, 'utf8')
    return JSON.parse(text)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return emptySchema()
    }
    throw err
  }
}
async function saveSchema(schemaPath, schema) {
  await mkdir(dirname(schemaPath), { recursive: true })
  const text = JSON.stringify(schema, null, 2)
  await writeFile(schemaPath, text, 'utf8')
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
async function detectMainProgram(patterns = DEFAULT_PATTERNS) {
  const procs = await psList()
  const matched = procs.filter((p) => patterns.some((rx) => rx.test(p.name)))
  return {
    running: matched.length > 0,
    pids: matched.map((p) => p.pid),
    matchedNames: matched.map((p) => p.name),
  }
}
ipcMain.handle('auth:check', async (_event, password) => {
  return checkPassword(password)
})
ipcMain.handle('file:pickDirectory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: '选择 SystemConfig.json 所在目录(或 DataRoot / Config 子目录)',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})
ipcMain.handle('file:resolveConfigPath', async (_event, pickedDir) => {
  return resolveConfigPath(pickedDir)
})
ipcMain.handle('file:readJson', async (_event, path) => {
  return readJson(path)
})
ipcMain.handle('file:writeJson', async (_event, path, data, options) => {
  return saveJsonWithBackup(path, data, options ?? {})
})
ipcMain.handle('file:listBackups', async (_event, targetPath) => {
  return listBackups(targetPath)
})
ipcMain.handle('file:restoreBackup', async (_event, backupPath, targetPath) => {
  return restoreBackup(backupPath, targetPath)
})
ipcMain.handle('file:createBackup', async (_event, targetPath) => {
  return createBackup(targetPath)
})
ipcMain.handle('file:watchStart', async (_event, path) => {
  await watchFile(path, (e) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('file:onChange', e)
    }
  })
  return { ok: true }
})
ipcMain.handle('file:watchStop', async () => {
  await stopWatching()
  return { ok: true }
})
ipcMain.handle('schema:loadDefault', async () => {
  const { app: app2 } = await import('electron')
  const candidates = [
    join(app2.getAppPath(), 'schema.json'),
    join(process.resourcesPath, 'app.asar', 'schema.json'),
    join(process.resourcesPath, 'schema.json'),
    join(app2.getAppPath(), '..', 'schema.json'),
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
ipcMain.handle('schema:load', async (_event, schemaPath) => {
  return loadSchema(schemaPath)
})
ipcMain.handle('schema:save', async (_event, schemaPath, schema) => {
  await saveSchema(schemaPath, schema)
  return { ok: true }
})
ipcMain.handle('process:detectMainProgram', async () => {
  return detectMainProgram()
})
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: '系统配置编辑工具',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.on('ready-to-show', () => {
    win.show()
  })
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
