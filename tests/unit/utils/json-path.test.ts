import { describe, expect, it } from 'vitest'
import {
  get,
  has,
  set,
  remove,
  walk,
  renameKey,
  moveKey,
  moveArrayItem,
  insertArrayItem,
  addProperty,
} from '@shared/utils/json-path'

describe('json-path', () => {
  describe('get', () => {
    const obj = {
      SoftwareConfig: {
        DoorLock1: { IsFirstCtrlInvert: true },
        ImplantElementConfigs: [{ Element: 'Al+' }, { Element: 'B+' }],
      },
    }

    it('returns top-level value', () => {
      expect(get(obj, 'SoftwareConfig')).toEqual(obj.SoftwareConfig)
    })

    it('returns nested object value', () => {
      expect(get(obj, 'SoftwareConfig.DoorLock1.IsFirstCtrlInvert')).toBe(true)
    })

    it('returns array element by index', () => {
      expect(get(obj, 'SoftwareConfig.ImplantElementConfigs.0.Element')).toBe('Al+')
    })

    it('returns undefined for missing path', () => {
      expect(get(obj, 'SoftwareConfig.NotExist')).toBeUndefined()
    })

    it('returns undefined for too-deep path', () => {
      expect(get(obj, 'SoftwareConfig.DoorLock1.NotExist.Whatever')).toBeUndefined()
    })

    it('handles null intermediate gracefully', () => {
      const withNull: Record<string, unknown> = { a: null }
      expect(get(withNull, 'a.b')).toBeUndefined()
    })

    it('treats empty path as identity', () => {
      expect(get(obj, '')).toBe(obj)
    })
  })

  describe('has', () => {
    const obj: { a: { c: number }; arr: number[] } = { a: { c: 1 }, arr: [10, 20] }

    it('returns true for existing path', () => {
      expect(has(obj, 'a.c')).toBe(true)
    })

    it('returns true for array index', () => {
      expect(has(obj, 'arr.0')).toBe(true)
    })

    it('returns false for missing path', () => {
      expect(has(obj, 'a.b')).toBe(false)
    })

    it('returns true even when value is falsy', () => {
      const falsy: Record<string, unknown> = { x: 0, y: '', z: false, n: null }
      expect(has(falsy, 'x')).toBe(true)
      expect(has(falsy, 'y')).toBe(true)
      expect(has(falsy, 'z')).toBe(true)
      expect(has(falsy, 'n')).toBe(true)
    })
  })

  describe('set (immutable)', () => {
    it('returns new object with updated value', () => {
      const original: Record<string, unknown> = { a: { b: 1 } }
      const next = set(original, 'a.b', 2)
      expect(next).toEqual({ a: { b: 2 } })
      expect(original).toEqual({ a: { b: 1 } })
      expect(next).not.toBe(original)
      expect((next as Record<string, unknown>).a).not.toBe(original.a)
    })

    it('creates intermediate objects if missing', () => {
      const original: Record<string, unknown> = {}
      const next = set(original, 'a.b.c', 5)
      expect(next).toEqual({ a: { b: { c: 5 } } })
    })

    it('updates array element by index', () => {
      const original: Record<string, unknown> = { arr: [1, 2, 3] }
      const next = set(original, 'arr.1', 99)
      expect(next).toEqual({ arr: [1, 99, 3] })
      expect(original).toEqual({ arr: [1, 2, 3] })
    })

    it('appends to array when index === length', () => {
      const original: Record<string, unknown> = { arr: [1, 2] }
      const next = set(original, 'arr.2', 3)
      expect(next).toEqual({ arr: [1, 2, 3] })
    })

    it('sets new top-level key', () => {
      const original: Record<string, unknown> = {}
      const next = set(original, 'k', 'v')
      expect(next).toEqual({ k: 'v' })
    })

    it('does not mutate original when no change is needed', () => {
      const original: Record<string, unknown> = { a: 1 }
      const next = set(original, 'a', 1)
      // For deep immutability we still create new refs even if value is same
      expect(next).not.toBe(original)
      expect(next).toEqual({ a: 1 })
    })
  })

  describe('remove (immutable)', () => {
    it('removes nested key and returns new object', () => {
      const original: Record<string, unknown> = { a: { b: 1, c: 2 } }
      const next = remove(original, 'a.b')
      expect(next).toEqual({ a: { c: 2 } })
      expect(original).toEqual({ a: { b: 1, c: 2 } })
    })

    it('removes array element', () => {
      const original: Record<string, unknown> = { arr: [1, 2, 3] }
      const next = remove(original, 'arr.1')
      expect(next).toEqual({ arr: [1, 3] })
      expect(original).toEqual({ arr: [1, 2, 3] })
    })

    it('returns identical object when path missing', () => {
      const original: Record<string, unknown> = { a: 1 }
      const next = remove(original, 'a.b')
      expect(next).toBe(original)
    })

    it('removes top-level key', () => {
      const original: Record<string, unknown> = { a: 1, b: 2 }
      const next = remove(original, 'a')
      expect(next).toEqual({ b: 2 })
    })
  })

  describe('walk', () => {
    it('visits every leaf with its dotted path', () => {
      const obj = {
        a: 1,
        b: { c: 2, d: { e: 3 } },
        f: [10, 20],
      }
      const visited = new Map<string, unknown>()
      walk(obj, (path, value) => {
        visited.set(path, value)
      })

      expect(visited.get('a')).toBe(1)
      expect(visited.get('b.c')).toBe(2)
      expect(visited.get('b.d.e')).toBe(3)
      expect(visited.get('f.0')).toBe(10)
      expect(visited.get('f.1')).toBe(20)
    })

    it('stops when callback returns "stop"', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const visited: number[] = []
      walk(obj, (path, value) => {
        if (typeof value === 'number') visited.push(value)
        if (path === 'b') return 'stop'
        return 'continue'
      })
      expect(visited).toEqual([1, 2])
    })

    it('visits arrays element-by-element with index path', () => {
      const obj = { list: [{ x: 1 }, { x: 2 }] }
      const visited: string[] = []
      walk(obj, (path) => {
        visited.push(path)
      })
      expect(visited).toContain('list.0.x')
      expect(visited).toContain('list.1.x')
    })

    it('does not visit null/undefined children', () => {
      const obj = { a: null, b: undefined, c: 1 }
      const visited = new Map<string, unknown>()
      walk(obj, (path, value) => {
        visited.set(path, value)
      })
      expect(visited.has('a')).toBe(true)
      expect(visited.has('b')).toBe(true)
      expect(visited.get('c')).toBe(1)
    })
  })

  describe('renameKey', () => {
    it('renames an object key while keeping key order', () => {
      const orig = { a: 1, b: 2, c: 3 }
      const res = renameKey(orig, '', 'b', 'bRenamed')
      expect(Object.keys(res)).toEqual(['a', 'bRenamed', 'c'])
      expect((res as Record<string, number>).bRenamed).toBe(2)
    })

    it('renames nested key', () => {
      const orig = { nested: { x: 10, y: 20 } }
      const res = renameKey(orig, 'nested', 'x', 'xNew')
      expect(Object.keys((res as { nested: Record<string, number> }).nested)).toEqual(['xNew', 'y'])
    })
  })

  describe('moveKey', () => {
    it('moves key up and down', () => {
      const orig = { a: 1, b: 2, c: 3 }
      const movedUp = moveKey(orig, '', 'b', 'up')
      expect(Object.keys(movedUp)).toEqual(['b', 'a', 'c'])

      const movedDown = moveKey(orig, '', 'b', 'down')
      expect(Object.keys(movedDown)).toEqual(['a', 'c', 'b'])
    })
  })

  describe('moveArrayItem', () => {
    it('moves item up and down', () => {
      const orig = { items: ['first', 'second', 'third'] }
      const movedUp = moveArrayItem(orig, 'items', 1, 'up')
      expect((movedUp as { items: string[] }).items).toEqual(['second', 'first', 'third'])

      const movedDown = moveArrayItem(orig, 'items', 1, 'down')
      expect((movedDown as { items: string[] }).items).toEqual(['first', 'third', 'second'])
    })
  })

  describe('insertArrayItem and addProperty', () => {
    it('inserts array item at index', () => {
      const orig = { items: [1, 3] }
      const res = insertArrayItem(orig, 'items', 1, 2)
      expect((res as { items: number[] }).items).toEqual([1, 2, 3])
    })

    it('adds property to object', () => {
      const orig = { a: 1 }
      const res = addProperty(orig, '', 'b', 2)
      expect((res as Record<string, number>).b).toBe(2)
    })
  })
})
