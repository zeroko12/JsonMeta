import { contextBridge, ipcRenderer } from 'electron'

// 类型将在 Phase 4 完整定义,这里先放一个最小可用的 stub
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
  },
  process: {
    async detectMainProgram(): Promise<{ running: boolean; pids: number[] }> {
      return ipcRenderer.invoke('process:detectMainProgram')
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
