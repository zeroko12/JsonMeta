import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('file watcher', () => {
  let dir: string
  let filePath: string

  beforeEach(async () => {
    dir = join(tmpdir(), `watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
    filePath = join(dir, 'SystemConfig.json')
    await writeFile(filePath, '{}', 'utf8')
  })

  afterEach(async () => {
    try {
      const { stopWatching } = await import('../../../src/main/ipc/file-watch')
      await stopWatching()
    } catch {
      // ignore
    }
    await rm(dir, { recursive: true, force: true })
  })

  it('emits change event when file is modified', async () => {
    const { watchFile, stopWatching } = await import('../../../src/main/ipc/file-watch')
    const events: string[] = []
    await watchFile(filePath, (event) => {
      events.push(event.type)
    })
    await writeFile(filePath, '{"a":1}', 'utf8')
    // Wait for the watcher to debounce
    await new Promise((r) => setTimeout(r, 1500))
    await stopWatching()
    expect(events.length).toBeGreaterThan(0)
  }, 10_000)
})
