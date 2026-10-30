import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { checkPassword } from './auth'
import {
  readJson,
  saveJsonWithBackup,
  createBackup,
  listBackups,
  restoreBackup,
  updateBackupMemo,
  deleteBackup,
  rotateBackups,
  resolveConfigPath,
} from './ipc/file'
import { watchFile, stopWatching } from './ipc/file-watch'
import { loadSchema, saveSchema } from './ipc/schema'
import { detectMainProgram } from './ipc/process'

// ----- AUTH -----
ipcMain.handle('auth:check', async (_event, password: string) => {
  return checkPassword(password)
})

function getMetaPath(jsonPath: string): string {
  if (jsonPath.toLowerCase().endsWith('.json')) {
    return jsonPath.slice(0, -5) + '.meta.json'
  }
  return jsonPath + '.meta.json'
}

// ----- FILE -----
ipcMain.handle('file:pickJsonFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: '打开 JSON 文件',
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('file:saveAsJsonFile', async (event, defaultName?: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showSaveDialog(win, {
    title: '另存为 JSON 文件',
    defaultPath: defaultName || 'Untitled.json',
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle('file:loadMeta', async (_event, jsonPath: string) => {
  const { readFile } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const metaPath = getMetaPath(jsonPath)
  try {
    const text = await readFile(metaPath, 'utf8')
    return JSON.parse(text)
  } catch {
    // 尝试迁移旧的同级 annotations.json
    try {
      const legacyPath = join(dirname(jsonPath), 'annotations.json')
      const legacyText = await readFile(legacyPath, 'utf8')
      const legacy = JSON.parse(legacyText) as { descriptions?: Record<string, unknown> }
      const descs: Record<string, string> = {}
      if (legacy.descriptions) {
        for (const [k, v] of Object.entries(legacy.descriptions)) {
          if (typeof v === 'string') descs[k] = v
          else if (v && typeof v === 'object' && 'description' in v) {
            descs[k] = (v as { description: string }).description
          }
        }
      }
      return { descriptions: descs }
    } catch {
      return { descriptions: {} }
    }
  }
})

ipcMain.handle('file:saveMeta', async (_event, jsonPath: string, meta: unknown) => {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  const metaPath = getMetaPath(jsonPath)
  await mkdir(dirname(metaPath), { recursive: true })
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')
  return { ok: true, metaPath }
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

ipcMain.handle('file:resolveConfigPath', async (_event, pickedDir: string) => {
  return resolveConfigPath(pickedDir)
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

ipcMain.handle('file:readText', async (_event, path: string) => {
  const { readFile } = await import('node:fs/promises')
  return readFile(path, 'utf8')
})

ipcMain.handle('file:writeText', async (_event, path: string, content: string) => {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return { ok: true }
})

ipcMain.handle('file:listBackups', async (_event, targetPath: string) => {
  return listBackups(targetPath)
})

ipcMain.handle('file:restoreBackup', async (_event, backupPath: string, targetPath: string) => {
  return restoreBackup(backupPath, targetPath)
})

ipcMain.handle(
  'file:createBackup',
  async (_event, targetPath: string, memo?: string, maxBackups?: number) => {
    return createBackup(targetPath, memo, maxBackups)
  },
)

ipcMain.handle('file:deleteBackup', async (_event, backupPath: string) => {
  return deleteBackup(backupPath)
})

ipcMain.handle('file:rotateBackups', async (_event, targetPath: string, maxBackups: number) => {
  return rotateBackups(targetPath, maxBackups)
})

ipcMain.handle('file:updateBackupMemo', async (_event, backupPath: string, memo: string) => {
  return updateBackupMemo(backupPath, memo)
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
ipcMain.handle('schema:loadDefault', async () => {
  const { app } = await import('electron')
  const candidates = [
    join(app.getAppPath(), 'schema.json'),
    join(process.resourcesPath, 'app.asar', 'schema.json'),
    join(process.resourcesPath, 'schema.json'),
    join(app.getAppPath(), '..', 'schema.json'),
  ]
  let lastErr: unknown = null
  for (const path of candidates) {
    try {
      const result = await loadSchema(path)
      return { ...result, _resolvedPath: path }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(
    `schema.json not found in any of: ${candidates.join(', ')} (${(lastErr as Error)?.message ?? 'unknown'})`,
  )
})

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
const DEBUG_PORT = process.env.E2E_DEBUG_PORT ? Number(process.env.E2E_DEBUG_PORT) : 0
if (DEBUG_PORT > 0) {
  app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT))
}

function createWindow() {
  const isE2E = process.env.E2E_TEST === '1'
  const iconPath = join(__dirname, '../../build/icon.ico')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: '系统配置编辑工具',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: !isE2E,
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

// UNCONDITIONAL DEBUG: write a sentinel file on every launch so we
// know main actually executes regardless of E2E_TEST branch
try {
  writeFileSync(
    'D:/Temp/e2e-fired.txt',
    `pid=${process.pid}\nargv=${process.argv.slice(0, 5).join(' | ')}\nRAN=${process.env.E2E_TEST ?? 'unset'}\n`,
  )
} catch {
  // ignore
}

app.whenReady().then(async () => {
  // ── E2E self-test mode ──
  // When E2E_TEST=1 is set, validate the real user file then exit.
  // Used by tests/manual/e2e-exe-self-test.ts to verify the bundled EXE.
  // Also when E2E_TEST=1, the window is created with contextIsolation:false
  // so Playwright/CDP tests can stub window.api at the page level.
  if (process.env.E2E_TEST === '1') {
    const filePath = process.env.E2E_TEST_FILE
    const resultPath = process.env.E2E_TEST_RESULT
    const writeResult = (status: 'OK' | 'FAIL', info: Record<string, unknown>) => {
      if (!resultPath) {
        process.stdout.write(`[E2E_TEST] ${status} ${JSON.stringify(info)}\n`)
        return
      }
      try {
        mkdirSync(resultPath.replace(/[^\\/]+$/, ''), { recursive: true })
        writeFileSync(resultPath, JSON.stringify({ status, ...info }, null, 2))
      } catch (err) {
        process.stdout.write(`[E2E_TEST] FAIL write-result ${(err as Error).message}\n`)
      }
    }
    if (!filePath) {
      writeResult('FAIL', { error: 'E2E_TEST_FILE not set' })
      app.exit(2)
      return
    }
    try {
      const data = await readJson(filePath)
      const topKeys = Object.keys(data as object)
      writeResult('OK', {
        file: filePath,
        topKeys: topKeys.length,
        sample: topKeys.slice(0, 3),
      })
      app.exit(0)
    } catch (err) {
      writeResult('FAIL', { error: (err as Error).message, file: filePath })
      app.exit(1)
    }
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
