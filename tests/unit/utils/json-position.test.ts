import { describe, expect, it } from 'vitest'
import {
  findPathRange,
  findPathAtOffset,
  getLineNumber,
  splitPathSegments,
} from '@shared/utils/json-position'

describe('json-position resolver', () => {
  const sample = JSON.stringify(
    {
      SoftwareConfig: {
        ScanFrequencyHz: 50,
        DoorLock1: {
          IsFirstCtrlInvert: true,
          MaxRetry: 3,
        },
        Elements: [
          { Name: 'Boron', AtomicNumber: 5 },
          { Name: 'Phosphorus', AtomicNumber: 15 },
        ],
      },
      ChillerConfig: {
        TargetTemp: 22.5,
      },
    },
    null,
    2,
  )

  it('splits path segments properly', () => {
    expect(splitPathSegments('SoftwareConfig.DoorLock1.IsFirstCtrlInvert')).toEqual([
      'SoftwareConfig',
      'DoorLock1',
      'IsFirstCtrlInvert',
    ])
    expect(splitPathSegments('SoftwareConfig.Elements.1.Name')).toEqual([
      'SoftwareConfig',
      'Elements',
      1,
      'Name',
    ])
  })

  it('finds line and key range for a deeply nested leaf node', () => {
    const loc = findPathRange(sample, 'SoftwareConfig.DoorLock1.IsFirstCtrlInvert')
    expect(loc).not.toBeNull()
    expect(loc!.line).toBeGreaterThan(1)
    const keySlice = sample.slice(loc!.keyStart, loc!.keyEnd)
    expect(keySlice).toBe('"IsFirstCtrlInvert"')
  })

  it('finds line for a top-level module (outline drawer selection)', () => {
    const loc = findPathRange(sample, 'SoftwareConfig')
    expect(loc).not.toBeNull()
    expect(loc!.line).toBe(2)
    const keySlice = sample.slice(loc!.keyStart, loc!.keyEnd)
    expect(keySlice).toBe('"SoftwareConfig"')

    const chillerLoc = findPathRange(sample, 'ChillerConfig')
    expect(chillerLoc).not.toBeNull()
    expect(sample.slice(chillerLoc!.keyStart, chillerLoc!.keyEnd)).toBe('"ChillerConfig"')
  })

  it('finds line and key range inside array elements', () => {
    const loc = findPathRange(sample, 'SoftwareConfig.Elements.1.AtomicNumber')
    expect(loc).not.toBeNull()
    expect(sample.slice(loc!.keyStart, loc!.keyEnd)).toBe('"AtomicNumber"')
  })

  it('falls back to parent when leaf path is not found', () => {
    // Non-existent leaf under DoorLock1
    const loc = findPathRange(sample, 'SoftwareConfig.DoorLock1.NonExistentField')
    expect(loc).not.toBeNull()
    // Should fall back to DoorLock1
    expect(sample.slice(loc!.keyStart, loc!.keyEnd)).toBe('"DoorLock1"')
  })

  it('finds path at text offset (reverse lookup from cursor position)', () => {
    const loc = findPathRange(sample, 'SoftwareConfig.DoorLock1.MaxRetry')
    expect(loc).not.toBeNull()
    const path = findPathAtOffset(sample, loc!.startOffset + 2)
    expect(path).toBe('SoftwareConfig.DoorLock1.MaxRetry')
  })

  it('calculates line numbers correctly', () => {
    expect(getLineNumber('line1\nline2\nline3', 0)).toBe(1)
    expect(getLineNumber('line1\nline2\nline3', 7)).toBe(2)
    expect(getLineNumber('line1\nline2\nline3', 13)).toBe(3)
  })
})
