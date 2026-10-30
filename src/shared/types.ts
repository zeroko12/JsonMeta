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
        pickJsonFile(): Promise<string | null>
        saveAsJsonFile(defaultName?: string): Promise<string | null>
        loadMeta<T = { descriptions: Record<string, string> }>(jsonPath: string): Promise<T>
        saveMeta(jsonPath: string, meta: unknown): Promise<{ ok: boolean; metaPath?: string }>
        pickDirectory(): Promise<string | null>
        resolveConfigPath(pickedDir: string): Promise<string | null>
        readJson<T = unknown>(path: string): Promise<T>
        writeJson(
          path: string,
          data: unknown,
          options?: { backup?: boolean; maxBackups?: number },
        ): Promise<WriteJsonResult>
        readText(path: string): Promise<string>
        writeText(path: string, content: string): Promise<{ ok: boolean }>
        listBackups(targetPath: string): Promise<string[]>
        restoreBackup(
          backupPath: string,
          targetPath: string,
        ): Promise<{ ok: boolean; error?: string }>
        createBackup(targetPath: string, memo?: string, maxBackups?: number): Promise<string>
        deleteBackup(backupPath: string): Promise<{ ok: boolean; error?: string }>
        rotateBackups(targetPath: string, maxBackups: number): Promise<number>
        updateBackupMemo(
          backupPath: string,
          memo: string,
        ): Promise<{ ok: boolean; newPath?: string; memo?: string; error?: string }>
        watchStart(path: string): Promise<{ ok: boolean }>
        watchStop(): Promise<{ ok: boolean }>
        onChange(callback: (event: FileChangeEvent) => void): () => void
      }
      schema: {
        load<T = unknown>(path: string): Promise<T>
        loadDefault<T = unknown>(): Promise<T>
        save(path: string, schema: unknown): Promise<{ ok: boolean }>
      }
      process: {
        detectMainProgram(): Promise<DetectProcessResult>
      }
    }
  }
}

export {}
