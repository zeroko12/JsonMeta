/**
 * Main-process IPC handlers for file operations:
 *  - read / write JSON
 *  - timestamped backup creation
 *  - backup rotation (keep last 10)
 *  - restore from backup
 *  - diff detection (skip writes when no change)
 */

import { readFile, writeFile, readdir, stat, mkdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { markSelfWrite } from './file-watch'

const MAX_BACKUPS = 10

/** Read a JSON file. Strips UTF-8 BOM if present (Notepad often saves with BOM). */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  let text = await readFile(filePath, 'utf8')
  // Strip UTF-8 BOM (U+FEFF) — Windows editors (Notepad) prepend this
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return JSON.parse(text) as T
}

/** Write a JSON file with 2-space indent. */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2)
  await writeFile(filePath, text, 'utf8')
}

/** Read file bytes as UTF-8 text (for raw diff comparison). Strips BOM. */
export async function readText(filePath: string): Promise<string> {
  let text = await readFile(filePath, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return text
}

/**
 * Create a timestamped backup of `target` in the same directory.
 * Returns the backup file path. Format:
 *   SystemConfig.json -> SystemConfig.YYYYMMDD_HHmmss.bak.json
 *   Or with memo: SystemConfig.YYYYMMDD_HHmmss.memo.bak.json
 *
 * Also rotates backups so at most MAX_BACKUPS are kept.
 */
export async function createBackup(
  target: string,
  memo?: string,
  maxBackups = MAX_BACKUPS,
  locked = false,
  autoRotateEnabled = true,
): Promise<string> {
  const dir = dirname(target)
  const base = basename(target, '.json')
  const stamp = formatTimestamp(new Date())
  const cleanMemo =
    memo
      ?.trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 50) || ''
  const memoPart = cleanMemo ? `.${cleanMemo}` : ''
  const bak = join(dir, `${base}.${stamp}${memoPart}.bak.json`)
  const text = await readFile(target, 'utf8')
  await writeFile(bak, text, 'utf8')

  // 同步备份伴生 .meta.json 描述文件（若存在），并保存 memo 与 locked 状态
  const metaPath = join(dir, `${base}.meta.json`)
  const metaBak = join(dir, `${base}.${stamp}${memoPart}.bak.meta.json`)
  let metaObj: { memo?: string; locked?: boolean; descriptions?: Record<string, string> } = {
    descriptions: {},
  }
  try {
    const metaText = await readFile(metaPath, 'utf8')
    metaObj = JSON.parse(metaText)
  } catch {
    // meta 不存在
  }
  if (memo?.trim()) {
    metaObj.memo = memo.trim()
  }
  if (locked) {
    metaObj.locked = true
  }
  if (
    memo?.trim() ||
    locked ||
    (metaObj.descriptions && Object.keys(metaObj.descriptions).length > 0)
  ) {
    await writeFile(metaBak, JSON.stringify(metaObj, null, 2), 'utf8')
  }

  await rotateBackups(target, maxBackups, autoRotateEnabled)
  return bak
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/**
 * List backups for `target`, newest first.
 * Only includes files matching `<basename>.*.bak.json`.
 */
export async function listBackups(target: string): Promise<string[]> {
  const dir = dirname(target)
  const base = basename(target, '.json')
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const matched = entries.filter((n) => n.startsWith(`${base}.`) && n.endsWith('.bak.json'))
  const fullPaths = await Promise.all(
    matched.map(async (n) => {
      const full = join(dir, n)
      try {
        const s = await stat(full)
        return { full, mtime: s.mtimeMs }
      } catch {
        return null
      }
    }),
  )
  return fullPaths
    .filter((x): x is { full: string; mtime: number } => x !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.full)
}

/**
 * Check if a backup is locked (permanent retention, exempt from auto-rotation).
 */
export async function isBackupLocked(backupPath: string): Promise<boolean> {
  try {
    const metaPath = backupPath.replace(/\.bak\.json$/i, '.bak.meta.json')
    const text = await readFile(metaPath, 'utf8')
    const obj = JSON.parse(text) as { locked?: boolean }
    return Boolean(obj.locked)
  } catch {
    return false
  }
}

/**
 * Toggle or set the locked status of a backup file.
 */
export async function updateBackupLocked(
  backupPath: string,
  locked: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const metaPath = backupPath.replace(/\.bak\.json$/i, '.bak.meta.json')
    let metaObj: { memo?: string; locked?: boolean; descriptions?: Record<string, string> } = {
      descriptions: {},
    }
    try {
      const text = await readFile(metaPath, 'utf8')
      metaObj = JSON.parse(text)
    } catch {
      // meta 不存在
    }
    if (locked) {
      metaObj.locked = true
    } else {
      delete metaObj.locked
    }
    await writeFile(metaPath, JSON.stringify(metaObj, null, 2), 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Rotate backups so at most MAX_BACKUPS rotatable backups exist (deletes oldest unlocked).
 * Locked (pinned) backups are permanently preserved and exempt from auto-rotation.
 * If autoRotateEnabled is false, no backups are deleted.
 */
export async function rotateBackups(
  target: string,
  max = MAX_BACKUPS,
  autoRotateEnabled = true,
): Promise<number> {
  if (!autoRotateEnabled) return 0
  const list = await listBackups(target)

  // 过滤出参与自动轮换的快照 (排除锁定的常驻保留快照)
  const rotatable: string[] = []
  for (const p of list) {
    if (await isBackupLocked(p)) {
      continue
    }
    rotatable.push(p)
  }

  if (rotatable.length <= max) return 0
  const toDelete = rotatable.slice(max)
  const { unlink } = await import('node:fs/promises')
  await Promise.all(
    toDelete.flatMap((p) => [
      unlink(p).catch(() => undefined),
      unlink(p.replace(/\.bak\.json$/i, '.bak.meta.json')).catch(() => undefined),
    ]),
  )
  return toDelete.length
}

/**
 * Manually delete a backup file and its companion .bak.meta.json.
 */
export async function deleteBackup(backupPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await unlink(backupPath)
    const metaBak = backupPath.replace(/\.bak\.json$/i, '.bak.meta.json')
    await unlink(metaBak).catch(() => undefined)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Restore a backup file to `targetPath`. Returns { ok, error? }.
 * Scheme B: By default (overwriteMeta = false), existing Chinese descriptions in targetPath
 * are protected from rollback, and only missing field descriptions from the snapshot are supplemented.
 * If overwriteMeta = true, the snapshot's meta completely overwrites the target's meta.
 */
export async function restoreBackup(
  backupPath: string,
  targetPath: string,
  options: { overwriteMeta?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    const text = await readFile(backupPath, 'utf8')
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, text, 'utf8')

    // 伴生元数据描述文件处理 (Scheme B)
    const metaBak = backupPath.replace(/\.bak\.json$/i, '.bak.meta.json')
    const targetMeta = targetPath.replace(/\.json$/i, '.meta.json')
    try {
      const metaBakText = await readFile(metaBak, 'utf8')
      const metaBakObj = JSON.parse(metaBakText) as { descriptions?: Record<string, string> }
      if (options.overwriteMeta) {
        // 用户主动要求完全覆盖注释
        await writeFile(targetMeta, JSON.stringify(metaBakObj, null, 2), 'utf8')
      } else {
        // 方案 B：默认保护当前已有最新注释，仅增量补全缺失项
        let targetMetaObj: { descriptions?: Record<string, string> } = { descriptions: {} }
        try {
          const currentText = await readFile(targetMeta, 'utf8')
          targetMetaObj = JSON.parse(currentText)
        } catch {
          // 当前 targetMeta 不存在
        }
        const currentDescs = targetMetaObj.descriptions || {}
        const bakDescs = metaBakObj.descriptions || {}
        // 增量合并：当前最新注释优先，快照仅补充缺失键
        const mergedDescs = { ...bakDescs, ...currentDescs }
        targetMetaObj.descriptions = mergedDescs
        await writeFile(targetMeta, JSON.stringify(targetMetaObj, null, 2), 'utf8')
      }
    } catch {
      // 无元数据备份则忽略
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Update the memo of an existing backup file.
 * Renames the file to include or remove the memo, and synchronizes the companion .bak.meta.json file.
 * Returns { ok: true, newPath, memo } or { ok: false, error }.
 */
export async function updateBackupMemo(
  backupPath: string,
  memo: string,
): Promise<{ ok: boolean; newPath?: string; memo?: string; error?: string }> {
  try {
    const dir = dirname(backupPath)
    const file = basename(backupPath)
    const cleanMemo = memo
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 50)

    // Match base, timestamp, and optional existing memo
    const match = file.match(/^(.+?)\.(\d{8}_\d{6})(?:[._].+?)?\.bak\.json$/i)
    let newPath = backupPath

    if (match) {
      const base = match[1]
      const stamp = match[2]
      const memoPart = cleanMemo ? `.${cleanMemo}` : ''
      newPath = join(dir, `${base}.${stamp}${memoPart}.bak.json`)
    }

    // If filename needs to change and destination already exists (and is different from backupPath)
    if (newPath !== backupPath) {
      try {
        await stat(newPath)
        return { ok: false, error: '已存在同名快照文件，请更换备注内容' }
      } catch {
        // Target does not exist, can proceed to rename
      }
      await rename(backupPath, newPath)
    }

    // Synchronize companion .bak.meta.json
    const oldMeta = backupPath.replace(/\.bak\.json$/i, '.bak.meta.json')
    const newMeta = newPath.replace(/\.bak\.json$/i, '.bak.meta.json')

    let metaObj: { memo?: string; descriptions?: Record<string, string> } = { descriptions: {} }
    let oldMetaExisted = false
    try {
      const metaText = await readFile(oldMeta, 'utf8')
      metaObj = JSON.parse(metaText)
      oldMetaExisted = true
    } catch {
      // old meta did not exist
    }

    if (cleanMemo) {
      metaObj.memo = cleanMemo
    } else {
      delete metaObj.memo
    }

    // If paths differ and old meta existed, remove the old meta file
    if (oldMetaExisted && oldMeta !== newMeta) {
      await unlink(oldMeta).catch(() => undefined)
    }

    // Write updated meta file if memo exists or descriptions exist
    if (cleanMemo || (metaObj.descriptions && Object.keys(metaObj.descriptions).length > 0)) {
      await writeFile(newMeta, JSON.stringify(metaObj, null, 2), 'utf8')
    } else if (oldMetaExisted) {
      // If memo was removed and descriptions are empty, clean up meta file
      await unlink(newMeta).catch(() => undefined)
    }

    return { ok: true, newPath, memo: cleanMemo }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Returns true if writing `newText` to `targetPath` would change the file
 * (i.e. bytes differ from current disk content).
 */
export async function hasMeaningfulChange(targetPath: string, newText: string): Promise<boolean> {
  try {
    const current = await readFile(targetPath, 'utf8')
    return current !== newText
  } catch {
    // File doesn't exist yet — definitely a change
    return true
  }
}

/**
 * Find SystemConfig.json in a directory the user picked.
 * Tries <dir>/SystemConfig.json, then <dir>/Config/SystemConfig.json.
 * Returns the resolved path or null.
 */
export async function resolveConfigPath(pickedDir: string): Promise<string | null> {
  const norm = pickedDir.replace(/[\\/]+$/, '')
  const candidates = [join(norm, 'SystemConfig.json'), join(norm, 'Config', 'SystemConfig.json')]
  for (const c of candidates) {
    try {
      await stat(c)
      return c
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Save JSON to a backup file. Creates backup if file exists.
 * Returns { ok, backupPath? }.
 */
export async function saveJsonWithBackup(
  targetPath: string,
  data: unknown,
  options: { backup?: boolean; maxBackups?: number; autoRotate?: boolean } = {},
): Promise<{ ok: boolean; backupPath?: string; changed: boolean; error?: string }> {
  try {
    const text = JSON.stringify(data, null, 2)
    const changed = await hasMeaningfulChange(targetPath, text)
    let backupPath: string | undefined
    if (changed && options.backup !== false) {
      try {
        backupPath = await createBackup(
          targetPath,
          undefined,
          options.maxBackups ?? MAX_BACKUPS,
          false,
          options.autoRotate ?? true,
        )
      } catch {
        // backup failed (e.g. file didn't exist yet) — continue writing
        backupPath = undefined
      }
    }
    markSelfWrite(1500)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, text, 'utf8')
    return { ok: true, backupPath, changed }
  } catch (err) {
    return { ok: false, changed: false, error: (err as Error).message }
  }
}
