/**
 * Detect whether the main ion-implantation application is currently running.
 *
 * Uses ps-list to walk all processes; matches by heuristic on process name.
 * The actual exe name is configurable since the deployment may use any name.
 */

import psList from 'ps-list'

export interface DetectProcessResult {
  running: boolean
  pids: number[]
  matchedNames: string[]
}

const DEFAULT_PATTERNS = [/ion/i, /implant/i, /IonImplantationSystem/i]

export async function detectMainProgram(
  patterns: RegExp[] = DEFAULT_PATTERNS,
): Promise<DetectProcessResult> {
  const procs = await psList()
  const matched = procs.filter((p) => patterns.some((rx) => rx.test(p.name)))
  return {
    running: matched.length > 0,
    pids: matched.map((p) => p.pid),
    matchedNames: matched.map((p) => p.name),
  }
}
