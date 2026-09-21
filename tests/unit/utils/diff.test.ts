import { describe, expect, it } from 'vitest'
import { diff, type Change, type ChangeType } from '@shared/utils/diff'

describe('diff', () => {
  it('returns no changes for identical inputs', () => {
    const a = { x: 1, y: { z: 2 } }
    const b = { x: 1, y: { z: 2 } }
    const changes = diff(a, b)
    expect(changes.size).toBe(0)
  })

  it('detects primitive modification', () => {
    const a = { RemoteIPAddress: '192.168.1.16' }
    const b = { RemoteIPAddress: '192.168.1.20' }
    const changes = diff(a, b)
    expect(changes.size).toBe(1)
    const change = changes.get('RemoteIPAddress')!
    expect(change.type).toBe<ChangeType>('modify')
    expect(change.oldValue).toBe('192.168.1.16')
    expect(change.newValue).toBe('192.168.1.20')
  })

  it('detects nested modification', () => {
    const a = { SoftwareConfig: { Mfc1: { MaxValue: 5 } } }
    const b = { SoftwareConfig: { Mfc1: { MaxValue: 10 } } }
    const changes = diff(a, b)
    const change = changes.get('SoftwareConfig.Mfc1.MaxValue')!
    expect(change.type).toBe<ChangeType>('modify')
    expect(change.oldValue).toBe(5)
    expect(change.newValue).toBe(10)
  })

  it('detects added leaf', () => {
    const a: Record<string, unknown> = {}
    const b = { NewField: 'hello' }
    const changes = diff(a, b)
    const change = changes.get('NewField')!
    expect(change.type).toBe<ChangeType>('add')
    expect(change.oldValue).toBeUndefined()
    expect(change.newValue).toBe('hello')
  })

  it('detects deleted leaf', () => {
    const a = { DoorLock1: { IsFirstCtrlInvert: true } }
    const b: Record<string, unknown> = {}
    const changes = diff(a, b)
    const change = changes.get('DoorLock1.IsFirstCtrlInvert')!
    expect(change.type).toBe<ChangeType>('delete')
    expect(change.oldValue).toBe(true)
    expect(change.newValue).toBeUndefined()
  })

  it('detects replacement of object with primitive', () => {
    const a = { X: { nested: 1 } }
    const b = { X: 'primitive' }
    const changes = diff(a, b)
    expect(changes.has('X')).toBe(true)
    expect(changes.has('X.nested')).toBe(true) // nested key is implicitly deleted
    expect(changes.get('X')!.type).toBe<ChangeType>('modify')
    expect(changes.get('X.nested')!.type).toBe<ChangeType>('delete')
  })

  it('handles array element changes by index', () => {
    const a = { Items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    const b = { Items: [{ id: 1 }, { id: 99 }, { id: 3 }] }
    const changes = diff(a, b)
    const change = changes.get('Items.1.id')!
    expect(change.type).toBe<ChangeType>('modify')
    expect(change.oldValue).toBe(2)
    expect(change.newValue).toBe(99)
  })

  it('detects array element addition', () => {
    const a = { Items: [1, 2] }
    const b = { Items: [1, 2, 3] }
    const changes = diff(a, b)
    const change = changes.get('Items.2')!
    expect(change.type).toBe<ChangeType>('add')
    expect(change.newValue).toBe(3)
  })

  it('detects trailing array element deletion', () => {
    const a = { Items: [1, 2, 3] }
    const b = { Items: [1, 2] }
    const changes = diff(a, b)
    const change = changes.get('Items.2')!
    expect(change.type).toBe<ChangeType>('delete')
    expect(change.oldValue).toBe(3)
  })

  it('detects array element modification with same length', () => {
    const a = { Items: [1, 2, 3] }
    const b = { Items: [1, 9, 3] }
    const changes = diff(a, b)
    const change = changes.get('Items.1')!
    expect(change.type).toBe<ChangeType>('modify')
    expect(change.oldValue).toBe(2)
    expect(change.newValue).toBe(9)
  })

  it('does not count null vs undefined as a change when both absent', () => {
    const a: Record<string, unknown> = { x: 1 }
    const b: Record<string, unknown> = { x: 1 }
    expect(diff(a, b).size).toBe(0)
  })

  it('returns iterable list of changes', () => {
    const a = { a: 1, b: 2 }
    const b = { a: 1, b: 3, c: 4 }
    const changes = diff(a, b)
    const list: Change[] = changes.toArray()
    expect(list).toHaveLength(2)
    expect(list.find((c) => c.path === 'b')?.newValue).toBe(3)
    expect(list.find((c) => c.path === 'c')?.newValue).toBe(4)
  })

  it('treats type changes (number→string) as modify at that path', () => {
    const a = { x: 1 }
    const b = { x: 'one' }
    const changes = diff(a, b)
    expect(changes.get('x')!.type).toBe<ChangeType>('modify')
    expect(changes.get('x')!.oldValue).toBe(1)
    expect(changes.get('x')!.newValue).toBe('one')
  })
})
