/**
 * Detect whether the main ion-implantation application is currently running.
 *
 * Uses ps-list to walk all processes; matches by heuristic on process name.
 * The actual exe name is configurable since the deployment may use any name.
 */

export interface DetectProcessResult {
  running: boolean
  pids: number[]
  matchedNames: string[]
}

const DEFAULT_PATTERNS = [/ion/i, /implant/i, /IonImplantationSystem/i]

/** Dynamic import to support ps-list (ESM-only) from CJS main process. */
let psListPromise: Promise<typeof import('ps-list').default> | null = null
async function getPsList() {
  if (!psListPromise) {
    psListPromise = import('ps-list').then((m) => m.default)
  }
  return psListPromise
}

export async function detectMainProgram(
  patterns: RegExp[] = DEFAULT_PATTERNS,
): Promise<DetectProcessResult> {
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
