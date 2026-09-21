// Phase 1 stub - shared between main process and renderer
// Will be expanded in Phase 4 to include full IPC contract types

export type AuthResult = {
  ok: boolean
}

export type PickDirectoryResult = string | null

export type DetectProcessResult = {
  running: boolean
  pids: number[]
}

declare global {
  interface Window {
    api: {
      auth: {
        check(password: string): Promise<boolean>
      }
      file: {
        pickDirectory(): Promise<string | null>
      }
      process: {
        detectMainProgram(): Promise<DetectProcessResult>
      }
    }
  }
}

export {}
