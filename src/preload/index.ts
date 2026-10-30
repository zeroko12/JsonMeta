import { contextBridge, ipcRenderer } from 'electron'

function toPlainJson<T>(val: T): T {
  if (val === null || val === undefined) return val
  if (typeof val !== 'object') return val
  try {
    return JSON.parse(JSON.stringify(val))
  } catch {
    return val
  }
}

const api = {
  auth: {
    async check(password: string): Promise<boolean> {
      return ipcRenderer.invoke('auth:check', password)
    },
  },
  file: {
    async pickJsonFile(): Promise<string | null> {
      return ipcRenderer.invoke('file:pickJsonFile')
    },
    async saveAsJsonFile(defaultName?: string): Promise<string | null> {
      return ipcRenderer.invoke('file:saveAsJsonFile', defaultName)
    },
    async loadMeta<T = { descriptions: Record<string, string> }>(jsonPath: string): Promise<T> {
      return ipcRenderer.invoke('file:loadMeta', jsonPath)
    },
    async saveMeta(jsonPath: string, meta: unknown): Promise<{ ok: boolean; metaPath?: string }> {
      return ipcRenderer.invoke('file:saveMeta', jsonPath, toPlainJson(meta))
    },
    async pickDirectory(): Promise<string | null> {
      return ipcRenderer.invoke('file:pickDirectory')
    },
    async resolveConfigPath(pickedDir: string): Promise<string | null> {
      return ipcRenderer.invoke('file:resolveConfigPath', pickedDir)
    },
    async readJson<T = unknown>(path: string): Promise<T> {
      return ipcRenderer.invoke('file:readJson', path)
    },
    async writeJson(
      path: string,
      data: unknown,
      options?: { backup?: boolean; maxBackups?: number },
    ): Promise<{ ok: boolean; backupPath?: string; changed: boolean; error?: string }> {
      return ipcRenderer.invoke('file:writeJson', path, toPlainJson(data), toPlainJson(options))
    },
    async readText(path: string): Promise<string> {
      return ipcRenderer.invoke('file:readText', path)
    },
    async writeText(path: string, content: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('file:writeText', path, content)
    },
    async listBackups(targetPath: string): Promise<string[]> {
      return ipcRenderer.invoke('file:listBackups', targetPath)
    },
    async restoreBackup(
      backupPath: string,
      targetPath: string,
    ): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke('file:restoreBackup', backupPath, targetPath)
    },
    async createBackup(targetPath: string, memo?: string): Promise<string> {
      return ipcRenderer.invoke('file:createBackup', targetPath, memo)
    },
    async watchStart(path: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('file:watchStart', path)
    },
    async watchStop(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('file:watchStop')
    },
    onChange(callback: (event: { type: string; path: string }) => void): () => void {
      const handler = (_e: unknown, payload: unknown) =>
        callback(payload as { type: string; path: string })
      ipcRenderer.on('file:onChange', handler)
      return () => ipcRenderer.off('file:onChange', handler)
    },
  },
  schema: {
    async load<T = unknown>(path: string): Promise<T> {
      return ipcRenderer.invoke('schema:load', path)
    },
    async loadDefault<T = unknown>(): Promise<T> {
      return ipcRenderer.invoke('schema:loadDefault')
    },
    async save(path: string, schema: unknown): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('schema:save', path, toPlainJson(schema))
    },
  },
  process: {
    async detectMainProgram(): Promise<{
      running: boolean
      pids: number[]
      matchedNames: string[]
    }> {
      return ipcRenderer.invoke('process:detectMainProgram')
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
