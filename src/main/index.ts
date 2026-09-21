import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'node:path'
import { checkPassword } from './auth'
import { readJson, saveJsonWithBackup, createBackup, listBackups, restoreBackup } from './ipc/file'
import { watchFile, stopWatching } from './ipc/file-watch'
import { loadSchema, saveSchema } from './ipc/schema'
import { detectMainProgram } from './ipc/process'

// ----- AUTH -----
ipcMain.handle('auth:check', async (_event, password: string) => {
  return checkPassword(password)
})

// ----- FILE -----
ipcMain.handle('file:pickDirectory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: '选择 SystemConfig.json 所在目录',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('file:readJson', async (_event, path: string) => {
  return readJson(path)
})

ipcMain.handle(
  'file:writeJson',
  async (
    _event,
    path: string,
    data: unknown,
    options?: { backup?: boolean; maxBackups?: number },
  ) => {
    return saveJsonWithBackup(path, data, options ?? {})
  },
)

ipcMain.handle('file:listBackups', async (_event, targetPath: string) => {
  return listBackups(targetPath)
})

ipcMain.handle('file:restoreBackup', async (_event, backupPath: string, targetPath: string) => {
  return restoreBackup(backupPath, targetPath)
})

ipcMain.handle('file:createBackup', async (_event, targetPath: string) => {
  return createBackup(targetPath)
})

ipcMain.handle('file:watchStart', async (_event, path: string) => {
  // Forward change events to all renderer windows via 'file:onChange'
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

// ----- SCHEMA -----
ipcMain.handle('schema:load', async (_event, schemaPath: string) => {
  return loadSchema(schemaPath)
})

ipcMain.handle('schema:save', async (_event, schemaPath: string, schema: unknown) => {
  await saveSchema(schemaPath, schema as Parameters<typeof saveSchema>[1])
  return { ok: true }
})

// ----- PROCESS -----
ipcMain.handle('process:detectMainProgram', async () => {
  return detectMainProgram()
})

// ----- WINDOW -----
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
