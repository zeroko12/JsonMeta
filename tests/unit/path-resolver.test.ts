import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveSystemConfigPath } from '@shared/path-resolver'

describe('resolveSystemConfigPath', () => {
  it('finds SystemConfig.json in picked dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    writeFileSync(join(dir, 'SystemConfig.json'), '{}', 'utf8')
    expect(resolveSystemConfigPath(dir)).toBe(join(dir, 'SystemConfig.json'))
  })

  it('finds Config/SystemConfig.json when picked dir is DataRoot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    const configDir = join(dir, 'Config')
    mkdirSync(configDir)
    writeFileSync(join(configDir, 'SystemConfig.json'), '{}', 'utf8')
    expect(resolveSystemConfigPath(dir)).toBe(join(configDir, 'SystemConfig.json'))
  })

  it('strips trailing slash/backslash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    writeFileSync(join(dir, 'SystemConfig.json'), '{}', 'utf8')
    expect(resolveSystemConfigPath(dir + '\\\\')).toBe(join(dir, 'SystemConfig.json'))
  })

  it('returns null when file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    expect(resolveSystemConfigPath(dir)).toBeNull()
  })
})
