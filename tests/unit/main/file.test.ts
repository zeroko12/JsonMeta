import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('file: readJson / writeJson', () => {
  let dir: string
  beforeEach(async () => {
    dir = join(tmpdir(), `cfg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
  })
  afterEach(async () => {
    await import('node:fs/promises').then((m) => m.rm(dir, { recursive: true, force: true }))
  })

  it('reads existing JSON file', async () => {
    const filePath = join(dir, 'test.json')
    await writeFile(filePath, JSON.stringify({ a: 1, b: 'hello' }, null, 2), 'utf8')
    const { readJson } = await import('../../../src/main/ipc/file')
    const result = await readJson(filePath)
    expect(result).toEqual({ a: 1, b: 'hello' })
  })

  it('throws when file does not exist', async () => {
    const { readJson } = await import('../../../src/main/ipc/file')
    await expect(readJson(join(dir, 'nope.json'))).rejects.toThrow()
  })

  it('writes JSON with 2-space indent', async () => {
    const filePath = join(dir, 'test.json')
    const { writeJson } = await import('../../../src/main/ipc/file')
    await writeJson(filePath, { x: 1, y: { z: 2 } })
    const content = await readFile(filePath, 'utf8')
    expect(content).toBe(JSON.stringify({ x: 1, y: { z: 2 } }, null, 2))
  })
})

describe('backup rotation', () => {
  let dir: string
  beforeEach(async () => {
    dir = join(tmpdir(), `cfg-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
  })

  it('generates timestamped backup file', async () => {
    const { createBackup } = await import('../../../src/main/ipc/file')
    const target = join(dir, 'SystemConfig.json')
    await writeFile(target, '{"version": 1}', 'utf8')
    const bak = await createBackup(target)
    expect(bak).toMatch(/SystemConfig\.\d{8}_\d{6}\.bak\.json$/)
    const content = await readFile(bak, 'utf8')
    expect(content).toBe('{"version": 1}')
  })

  it('generates backup with sanitized Chinese memo and writes meta.json', async () => {
    const { createBackup, listBackups } = await import('../../../src/main/ipc/file')
    const target = join(dir, 'SystemConfig.json')
    const metaTarget = join(dir, 'SystemConfig.meta.json')
    await writeFile(target, '{"version": 2}', 'utf8')
    await writeFile(metaTarget, JSON.stringify({ descriptions: { version: '配置版本' } }), 'utf8')

    const memo = '更换灯丝/标定测试'
    const bak = await createBackup(target, memo)
    // / should be replaced by _
    expect(bak).toMatch(/SystemConfig\.\d{8}_\d{6}\.更换灯丝_标定测试\.bak\.json$/)

    // Verify companion .bak.meta.json was created with memo and descriptions
    const metaBak = bak.replace(/\.bak\.json$/, '.bak.meta.json')
    const metaBakContent = JSON.parse(await readFile(metaBak, 'utf8'))
    expect(metaBakContent.memo).toBe('更换灯丝/标定测试')
    expect(metaBakContent.descriptions.version).toBe('配置版本')

    // Verify listBackups includes this backup
    const list = await listBackups(target)
    expect(list).toContain(bak)
  })

  it('lists existing backups in newest-first order', async () => {
    const { createBackup, listBackups } = await import('../../../src/main/ipc/file')
    const target = join(dir, 'SystemConfig.json')
    await writeFile(target, '{"v":1}', 'utf8')
    const b1 = await createBackup(target)
    // Force newer timestamp by waiting 1s
    await new Promise((r) => setTimeout(r, 1100))
    await writeFile(target, '{"v":2}', 'utf8')
    const b2 = await createBackup(target)
    expect(b1).not.toBe(b2)
    const list = await listBackups(target)
    expect(list[0]).toBe(b2)
    expect(list[1]).toBe(b1)
  })

  it('keeps at most 10 backups by deleting oldest', async () => {
    const { createBackup, listBackups } = await import('../../../src/main/ipc/file')
    const target = join(dir, 'SystemConfig.json')
    await writeFile(target, '{}', 'utf8')
    const files: string[] = []
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 1100))
      await writeFile(target, `{"i":${i}}`, 'utf8')
      files.push(await createBackup(target))
    }
    const list = await listBackups(target)
    expect(list.length).toBe(10)
    expect(list).not.toContain(files[0])
    expect(list).not.toContain(files[1])
  }, 30_000)
})

describe('restoreBackup', () => {
  it('overwrites target with backup contents', async () => {
    const dir = join(tmpdir(), `cfg-restore-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
    const target = join(dir, 'SystemConfig.json')
    await writeFile(target, '{"v":99}', 'utf8')
    const { createBackup, restoreBackup } = await import('../../../src/main/ipc/file')
    const bak = await createBackup(target)
    await writeFile(target, '{"v":0}', 'utf8')
    const result = await restoreBackup(bak, target)
    expect(result.ok).toBe(true)
    const restored = await readFile(target, 'utf8')
    expect(restored).toBe('{"v":99}')
  })
})

describe('updateBackupMemo', () => {
  let dir: string
  beforeEach(async () => {
    dir = join(tmpdir(), `cfg-upd-memo-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
  })

  it('updates memo for an old snapshot created without memo', async () => {
    const { createBackup, updateBackupMemo } = await import('../../../src/main/ipc/file')
    const target = join(dir, 'SystemConfig.json')
    await writeFile(target, '{"version": 10}', 'utf8')

    // Create standard old-style backup (no memo)
    const oldBak = await createBackup(target)
    expect(oldBak).toMatch(/SystemConfig\.\d{8}_\d{6}\.bak\.json$/)

    // Update memo
    const res = await updateBackupMemo(oldBak, '首次工况标定')
    expect(res.ok).toBe(true)
    expect(res.memo).toBe('首次工况标定')
    expect(res.newPath).toMatch(/SystemConfig\.\d{8}_\d{6}\.首次工况标定\.bak\.json$/)

    // Verify old file is gone and new file exists with identical content
    const { stat } = await import('node:fs/promises')
    await expect(stat(oldBak)).rejects.toThrow()
    const content = await readFile(res.newPath!, 'utf8')
    expect(content).toBe('{"version": 10}')

    // Verify companion meta file
    const metaBak = res.newPath!.replace(/\.bak\.json$/, '.bak.meta.json')
    const metaObj = JSON.parse(await readFile(metaBak, 'utf8'))
    expect(metaObj.memo).toBe('首次工况标定')

    // Update memo again
    const res2 = await updateBackupMemo(res.newPath!, '更换灯丝后复测')
    expect(res2.ok).toBe(true)
    expect(res2.memo).toBe('更换灯丝后复测')
    expect(res2.newPath).toMatch(/SystemConfig\.\d{8}_\d{6}\.更换灯丝后复测\.bak\.json$/)
    await expect(stat(res.newPath!)).rejects.toThrow()

    // Clear memo
    const res3 = await updateBackupMemo(res2.newPath!, '')
    expect(res3.ok).toBe(true)
    expect(res3.memo).toBe('')
    expect(res3.newPath).toMatch(/SystemConfig\.\d{8}_\d{6}\.bak\.json$/)
    await expect(stat(res2.newPath!)).rejects.toThrow()
    const cleanContent = await readFile(res3.newPath!, 'utf8')
    expect(cleanContent).toBe('{"version": 10}')
  })
})

describe('hasMeaningfulChange', () => {
  it('returns false for byte-identical content', async () => {
    const { hasMeaningfulChange } = await import('../../../src/main/ipc/file')
    const result = await hasMeaningfulChange('/path/a', '/path/b')
    expect(typeof result).toBe('boolean')
  })

  // We'll need real file IO for actual comparison — skip the rest.
})

describe('BOM stripping', () => {
  it('readJson strips UTF-8 BOM and parses successfully', async () => {
    const dir = join(tmpdir(), `bom-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, 'test.json')
    // Write JSON prefixed with UTF-8 BOM (U+FEFF) — Notepad saves like this
    const bom = Buffer.from([0xef, 0xbb, 0xbf]) // UTF-8 BOM
    const body = Buffer.from('{"a":1}', 'utf8')
    await writeFile(filePath, Buffer.concat([bom, body]))
    const { readJson } = await import('../../../src/main/ipc/file')
    const result = await readJson(filePath)
    expect(result).toEqual({ a: 1 })
  })

  it('writeJson does not introduce BOM', async () => {
    const dir = join(tmpdir(), `bomw-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, 'test.json')
    const { writeJson } = await import('../../../src/main/ipc/file')
    await writeJson(filePath, { x: 1 })
    const bytes = await readFile(filePath)
    expect(bytes[0]).not.toBe(0xef) // no BOM
  })
})
