/**
 * File watcher using chokidar.
 *
 * Exposes a single-file watch with debounced change events. The renderer
 * subscribes via the IPC channel `file:onChange`.
 */

import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'

type ChangeCallback = (event: { type: 'change' | 'add' | 'unlink'; path: string }) => void

let currentWatcher: FSWatcher | null = null
let currentPath: string | null = null

/**
 * Start watching `path`. If already watching, replaces the previous watch.
 * `cb` is called on every change event after debouncing.
 */
export async function watchFile(path: string, cb: ChangeCallback): Promise<void> {
  await stopWatching()
  const watcher = chokidar.watch(path, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
  })
  watcher.on('change', (changedPath) => {
    cb({ type: 'change', path: changedPath })
  })
  watcher.on('add', (addedPath) => {
    cb({ type: 'add', path: addedPath })
  })
  watcher.on('unlink', (removedPath) => {
    cb({ type: 'unlink', path: removedPath })
  })
  currentWatcher = watcher
  currentPath = path
}

/** Stop watching (idempotent). */
export async function stopWatching(): Promise<void> {
  if (currentWatcher) {
    await currentWatcher.close()
    currentWatcher = null
    currentPath = null
  }
}

/** Get the path currently being watched (for tests / diagnostics). */
export function getWatchedPath(): string | null {
  return currentPath
}
