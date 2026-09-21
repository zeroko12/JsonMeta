// Phase 4 stub - shared between main process and renderer
// Will be expanded in Phase 4 to include full IPC contract types

export type AuthResult = {
  ok: boolean
}

export type PickDirectoryResult = string | null

export type DetectProcessResult = {
  running: boolean
  pids: number[]
  matchedNames?: string[]
}

export type WriteJsonResult = {
  ok: boolean
  backupPath?: string
  changed: boolean
  error?: string
}

export type FileChangeEvent = {
  type: 'change' | 'add' | 'unlink'
  path: string
}

declare global {
  interface Window {
    api: {
      auth: {
        check(password: string): Promise<boolean>
      }
      file: {
        pickDirectory(): Promise<string | null>
        readJson<T = unknown>(path: string): Promise<T>
        writeJson(
          path: string,
          data: unknown,
          options?: { backup?: boolean; maxBackups?: number },
        ): Promise<WriteJsonResult>
        listBackups(targetPath: string): Promise<string[]>
        restoreBackup(
          backupPath: string,
          targetPath: string,
        ): Promise<{ ok: boolean; error?: string }>
        createBackup(targetPath: string): Promise<string>
        watchStart(path: string): Promise<{ ok: boolean }>
        watchStop(): Promise<{ ok: boolean }>
        onChange(callback: (event: FileChangeEvent) => void): () => void
      }
      schema: {
        load<T = unknown>(path: string): Promise<T>
        save(path: string, schema: unknown): Promise<{ ok: boolean }>
      }
      process: {
        detectMainProgram(): Promise<DetectProcessResult>
      }
    }
  }
}

export {}
