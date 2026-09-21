import { contextBridge, ipcRenderer } from 'electron'

const api = {
  auth: {
    async check(password: string): Promise<boolean> {
      return ipcRenderer.invoke('auth:check', password)
    },
  },
  file: {
    async pickDirectory(): Promise<string | null> {
      return ipcRenderer.invoke('file:pickDirectory')
    },
    async readJson<T = unknown>(path: string): Promise<T> {
      return ipcRenderer.invoke('file:readJson', path)
    },
    async writeJson(
      path: string,
      data: unknown,
      options?: { backup?: boolean; maxBackups?: number },
    ): Promise<{ ok: boolean; backupPath?: string; changed: boolean; error?: string }> {
      return ipcRenderer.invoke('file:writeJson', path, data, options)
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
    async createBackup(targetPath: string): Promise<string> {
      return ipcRenderer.invoke('file:createBackup', targetPath)
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
    async save(path: string, schema: unknown): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('schema:save', path, schema)
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
