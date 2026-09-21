import { describe, expect, it } from 'vitest'
import {
  mergeTemplate,
  type SchemaField,
  type SchemaTemplateMap,
} from '@shared/utils/template-merge'

describe('mergeTemplate', () => {
  const switchTemplate: SchemaField = {
    _type: 'object',
    _desc: '开关量点位(双控双反馈)',
    _fields: {
      IsFirstCtrlInvert: { _type: 'bool', _desc: '一控取反' },
      IsSecondCtrlInvert: { _type: 'bool', _desc: '二控取反' },
      IsFirstFeedbackInvert: { _type: 'bool', _desc: '一反馈取反' },
      IsSecondFeedbackInvert: { _type: 'bool', _desc: '二反馈取反' },
    },
  }

  const analogTemplate: SchemaField = {
    _type: 'object',
    _desc: '模拟量点位',
    _fields: {
      DisplayUnit: { _type: 'string' },
      MinValue: { _type: 'double' },
      MaxValue: { _type: 'double' },
      ConvertCoefficient: { _type: 'double' },
      Digits: { _type: 'int' },
      IsScientificNotation: { _type: 'bool' },
    },
  }

  const templates: SchemaTemplateMap = {
    SwitchTypeConfig: switchTemplate,
    AnalogTypeConfig: analogTemplate,
  }

  it('inlines template fields when instance uses _useTemplate', () => {
    const instance: SchemaField = { _useTemplate: 'SwitchTypeConfig' }
    const merged = mergeTemplate(instance, templates)
    expect(merged._fields).toBeDefined()
    expect(Object.keys(merged._fields!)).toEqual([
      'IsFirstCtrlInvert',
      'IsSecondCtrlInvert',
      'IsFirstFeedbackInvert',
      'IsSecondFeedbackInvert',
    ])
  })

  it('preserves instance _instanceDesc', () => {
    const instance: SchemaField = {
      _useTemplate: 'SwitchTypeConfig',
      _instanceDesc: '1#门禁联锁',
    }
    const merged = mergeTemplate(instance, templates)
    expect(merged._instanceDesc).toBe('1#门禁联锁')
  })

  it('returns instance unchanged when _useTemplate points to missing template', () => {
    const instance: SchemaField = { _useTemplate: 'NonExistent', _desc: 'x' }
    const merged = mergeTemplate(instance, templates)
    expect(merged._desc).toBe('x')
    expect(merged._fields).toBeUndefined()
  })

  it('returns instance unchanged when _useTemplate is not set', () => {
    const instance: SchemaField = { _type: 'object', _fields: { x: { _type: 'int' } } }
    const merged = mergeTemplate(instance, templates)
    expect(merged._fields?.['x']).toBeDefined()
    expect(merged._useTemplate).toBeUndefined()
  })

  it('applies _override on top of template fields', () => {
    const instance: SchemaField = {
      _useTemplate: 'AnalogTypeConfig',
      _override: {
        MaxValue: { _max: 100, _desc: '1#流量计特殊上限' },
      },
    }
    const merged = mergeTemplate(instance, templates)
    const maxVal = merged._fields!['MaxValue']!
    expect(maxVal._desc).toBe('1#流量计特殊上限')
    expect(maxVal._max).toBe(100)
    expect(maxVal._type).toBe('double')
  })

  it('allows _override to add fields not in template', () => {
    const instance: SchemaField = {
      _useTemplate: 'SwitchTypeConfig',
      _override: {
        CustomField: { _type: 'string', _desc: '定制字段' },
      },
    }
    const merged = mergeTemplate(instance, templates)
    expect(merged._fields!['CustomField']!._desc).toBe('定制字段')
  })

  it('preserves the template _desc on the merged object', () => {
    const instance: SchemaField = { _useTemplate: 'SwitchTypeConfig' }
    const merged = mergeTemplate(instance, templates)
    expect(merged._desc).toBe('开关量点位(双控双反馈)')
  })

  it('does not mutate the original template', () => {
    const instance: SchemaField = {
      _useTemplate: 'SwitchTypeConfig',
      _override: {
        IsFirstCtrlInvert: { _type: 'bool', _desc: '修改' },
      },
    }
    mergeTemplate(instance, templates)
    expect(switchTemplate._fields!['IsFirstCtrlInvert']!._desc).toBe('一控取反')
  })
})
