import { describe, expect, it, beforeEach } from 'vitest'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('schema handler', () => {
  let dir: string
  beforeEach(async () => {
    dir = join(tmpdir(), `schema-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
  })

  it('loads a valid schema file', async () => {
    const schemaPath = join(dir, 'schema.json')
    const validSchema = {
      _meta: { version: 1, rootClass: 'X' },
      SoftwareConfig: { _type: 'object' },
    }
    await writeFile(schemaPath, JSON.stringify(validSchema), 'utf8')
    const { loadSchema } = await import('../../../src/main/ipc/schema')
    const loaded = await loadSchema(schemaPath)
    expect(loaded._meta.rootClass).toBe('X')
  })

  it('saves schema back to disk with formatting', async () => {
    const schemaPath = join(dir, 'schema.json')
    const { saveSchema, loadSchema } = await import('../../../src/main/ipc/schema')
    const data = { _meta: { version: 1, rootClass: 'X' }, A: { _type: 'int' } }
    await saveSchema(schemaPath, data)
    const onDisk = await readFile(schemaPath, 'utf8')
    expect(onDisk).toBe(JSON.stringify(data, null, 2))
    const reloaded = await loadSchema(schemaPath)
    expect(reloaded.A._type).toBe('int')
  })

  it('returns a default empty schema if file does not exist', async () => {
    const schemaPath = join(dir, 'nope.json')
    const { loadSchema } = await import('../../../src/main/ipc/schema')
    const loaded = await loadSchema(schemaPath)
    expect(loaded._meta).toBeDefined()
    expect(loaded._meta.version).toBe(1)
  })

  it('throws on invalid JSON', async () => {
    const schemaPath = join(dir, 'bad.json')
    await writeFile(schemaPath, '{not valid json', 'utf8')
    const { loadSchema } = await import('../../../src/main/ipc/schema')
    await expect(loadSchema(schemaPath)).rejects.toThrow()
  })

  it('validates a value against a field schema', async () => {
    const { validateValue } = await import('../../../src/main/ipc/schema')
    const field = { _type: 'int', _min: 0, _max: 100 }
    expect(validateValue(50, field)).toEqual([])
    const over = validateValue(150, field)
    expect(over.some((r) => r.type === 'range')).toBe(true)
  })
})
