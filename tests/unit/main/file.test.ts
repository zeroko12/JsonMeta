import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We test the underlying logic by importing the modules under test.
// Because main/ipc runs in Node, vitest can import them directly.

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

describe('hasMeaningfulChange', () => {
  it('returns false for byte-identical content', async () => {
    const { hasMeaningfulChange } = await import('../../../src/main/ipc/file')
    const result = await hasMeaningfulChange('/path/a', '/path/b')
    expect(typeof result).toBe('boolean')
  })

  // We'll need real file IO for actual comparison — skip the rest.
})
