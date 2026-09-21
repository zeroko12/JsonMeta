/**
 * Resolve a SystemConfig.json path. The user might pick either:
 *   - The DataRoot directory:           <DataRoot>/Config/SystemConfig.json
 *   - The Config directory directly:    <DataRoot>/Config/SystemConfig.json
 *   - A folder containing the file:     <whatever>/SystemConfig.json
 *
 * Try the most likely candidates and return the first one that exists.
 * Return null if none found.
 */
import { existsSync } from 'node:fs'

export function resolveSystemConfigPath(pickedDir: string): string | null {
  const norm = pickedDir.replace(/[\\/]+$/, '') // strip trailing slashes
  const candidates = [
    `${norm}\\SystemConfig.json`,
    `${norm}\\Config\\SystemConfig.json`,
    `${norm}/SystemConfig.json`,
    `${norm}/Config/SystemConfig.json`,
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}
