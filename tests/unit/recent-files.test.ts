import { describe, it, expect, beforeEach } from 'vitest'

describe('Recent Files History Logic', () => {
  const RECENT_KEY = 'json_meta_recent_files'

  beforeEach(() => {
    localStorage.clear()
  })

  function loadRecent(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((p) => typeof p === 'string' && p.trim() !== '').slice(0, 3)
        : []
    } catch {
      return []
    }
  }

  function addRecent(current: string[], newPath: string): string[] {
    if (!newPath || typeof newPath !== 'string') return current
    const clean = newPath.trim()
    if (!clean) return current
    const rest = current.filter((p) => p !== clean)
    const updated = [clean, ...rest].slice(0, 3)
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
    return updated
  }

  function clearRecent(): string[] {
    localStorage.removeItem(RECENT_KEY)
    return []
  }

  it('initially returns empty array when nothing stored', () => {
    expect(loadRecent()).toEqual([])
  })

  it('records a new opened file', () => {
    let list = loadRecent()
    list = addRecent(list, 'C:\\configs\\server.json')
    expect(list).toEqual(['C:\\configs\\server.json'])
    expect(loadRecent()).toEqual(['C:\\configs\\server.json'])
  })

  it('keeps at most 3 items with newest at the top', () => {
    let list = loadRecent()
    list = addRecent(list, 'C:\\configs\\1.json')
    list = addRecent(list, 'C:\\configs\\2.json')
    list = addRecent(list, 'C:\\configs\\3.json')
    list = addRecent(list, 'C:\\configs\\4.json')

    expect(list.length).toBe(3)
    expect(list).toEqual(['C:\\configs\\4.json', 'C:\\configs\\3.json', 'C:\\configs\\2.json'])
  })

  it('deduplicates when reopening an existing file and bumps it to top', () => {
    let list = loadRecent()
    list = addRecent(list, 'C:\\configs\\a.json')
    list = addRecent(list, 'C:\\configs\\b.json')
    list = addRecent(list, 'C:\\configs\\c.json')
    // Reopen a.json
    list = addRecent(list, 'C:\\configs\\a.json')

    expect(list).toEqual(['C:\\configs\\a.json', 'C:\\configs\\c.json', 'C:\\configs\\b.json'])
  })

  it('clears all recent records', () => {
    let list = loadRecent()
    list = addRecent(list, 'C:\\configs\\a.json')
    list = addRecent(list, 'C:\\configs\\b.json')
    expect(list.length).toBe(2)

    list = clearRecent()
    expect(list).toEqual([])
    expect(loadRecent()).toEqual([])
  })
})
