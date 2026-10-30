import { describe, expect, it } from 'vitest'
import { diff } from '@shared/utils/diff'

describe('snapshot diffing logic', () => {
  it('diffs two snapshot data objects accurately', () => {
    const snapA = {
      SoftwareConfig: {
        ScanFrequencyHz: 50,
        Enabled: true,
      },
    }
    const snapB = {
      SoftwareConfig: {
        ScanFrequencyHz: 60,
        Enabled: true,
        NewSetting: 'test',
      },
    }

    const dataDiff = diff(snapA, snapB).toArray()
    expect(dataDiff).toHaveLength(2)

    const mod = dataDiff.find((d) => d.path === 'SoftwareConfig.ScanFrequencyHz')
    expect(mod?.type).toBe('modify')
    expect(mod?.oldValue).toBe(50)
    expect(mod?.newValue).toBe(60)

    const add = dataDiff.find((d) => d.path === 'SoftwareConfig.NewSetting')
    expect(add?.type).toBe('add')
    expect(add?.newValue).toBe('test')
  })

  it('diffs snapshot annotations/descriptions correctly', () => {
    const descsA: Record<string, string> = {
      'SoftwareConfig.ScanFrequencyHz': '扫描频率旧版',
      'SoftwareConfig.RemovedField': '即将删除的描述',
    }
    const descsB: Record<string, string> = {
      'SoftwareConfig.ScanFrequencyHz': '扫描频率新版 (50-60Hz)',
      'SoftwareConfig.NewField': '新增字段描述',
    }

    const descChanges: Array<{ path: string; type: string; oldVal?: string; newVal?: string }> = []
    const allKeys = new Set([...Object.keys(descsA), ...Object.keys(descsB)])

    for (const k of allKeys) {
      const oldV = descsA[k]
      const newV = descsB[k]
      if (oldV === undefined && newV !== undefined && newV.trim() !== '') {
        descChanges.push({ path: k, type: 'add', newVal: newV })
      } else if (oldV !== undefined && (newV === undefined || newV.trim() === '')) {
        descChanges.push({ path: k, type: 'delete', oldVal: oldV })
      } else if (oldV !== undefined && newV !== undefined && oldV !== newV) {
        descChanges.push({ path: k, type: 'modify', oldVal: oldV, newVal: newV })
      }
    }

    expect(descChanges).toHaveLength(3)
    const mod = descChanges.find((d) => d.path === 'SoftwareConfig.ScanFrequencyHz')
    expect(mod?.type).toBe('modify')
    expect(mod?.oldVal).toBe('扫描频率旧版')
    expect(mod?.newVal).toBe('扫描频率新版 (50-60Hz)')

    const add = descChanges.find((d) => d.path === 'SoftwareConfig.NewField')
    expect(add?.type).toBe('add')

    const del = descChanges.find((d) => d.path === 'SoftwareConfig.RemovedField')
    expect(del?.type).toBe('delete')
  })
})
