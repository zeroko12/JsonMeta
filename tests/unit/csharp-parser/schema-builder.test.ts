import { describe, expect, it } from 'vitest'
import { buildSchema } from '@shared/csharp-parser/schema-builder'
import type { CSharpClass } from '@shared/csharp-parser/types'

function cls(
  name: string,
  properties: Partial<CSharpClass['properties'][number]>[],
  overrides: Partial<CSharpClass> = {},
): CSharpClass {
  return {
    name,
    properties: properties as CSharpClass['properties'],
    sourceFile: 'test.cs',
    startLine: 1,
    endLine: 10,
    ...overrides,
  }
}

function prop(
  name: string,
  type: string,
  options: Partial<CSharpClass['properties'][number]> = {},
): CSharpClass['properties'][number] {
  return {
    name,
    type,
    isInitOnly: false,
    attributes: [],
    line: 1,
    ...options,
  }
}

describe('buildSchema', () => {
  it('builds _meta section with version + generatedAt + entry class', () => {
    const classes = [cls('SystemConfigModel', [])]
    const schema = buildSchema(classes, {
      entryClass: 'SystemConfigModel',
      generatorVersion: '1.0.0',
    })
    expect(schema._meta.rootClass).toBe('SystemConfigModel')
    expect(schema._meta.generatorVersion).toBe('1.0.0')
    expect(schema._meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(schema._meta.version).toBe(1)
  })

  it('maps top-level sub-configs as fields', () => {
    const systemConfig = cls('SystemConfigModel', [
      prop('SoftwareConfig', 'SoftwareConfig'),
      prop('IHCConfig', 'IHCConfig'),
    ])
    const softwareConfig = cls('SoftwareConfig', [prop('EnableTermPower', 'SwitchTypeConfig')])
    const ihcConfig = cls('IHCConfig', [
      prop('DeviceName', 'string', { defaultValue: '"\\\\.\\MMIPAR0"' }),
    ])
    const sw = cls('SwitchTypeConfig', [
      prop('IsFirstCtrlInvert', 'bool', { xmlComment: '一控取反' }),
    ])
    const schema = buildSchema([systemConfig, softwareConfig, ihcConfig, sw], {
      entryClass: 'SystemConfigModel',
      generatorVersion: '1.0.0',
    })
    expect(schema.SoftwareConfig).toBeDefined()
    expect(schema.IHCConfig).toBeDefined()
  })

  it('maps C# types to schema _type values', () => {
    const entry = cls('Entry', [
      prop('B', 'bool'),
      prop('I', 'int'),
      prop('D', 'double'),
      prop('S', 'string'),
    ])
    const schema = buildSchema([entry], { entryClass: 'Entry', generatorVersion: '1.0.0' })
    expect(schema.B._type).toBe('bool')
    expect(schema.I._type).toBe('int')
    expect(schema.D._type).toBe('double')
    expect(schema.S._type).toBe('string')
  })

  it('marks init-only properties with _readOnly', () => {
    const entry = cls('Entry', [prop('Locked', 'int', { isInitOnly: true })])
    const schema = buildSchema([entry], { entryClass: 'Entry', generatorVersion: '1.0.0' })
    expect(schema.Locked._readOnly).toBe(true)
  })

  it('extracts description from XML comment', () => {
    const entry = cls('Entry', [prop('WithDesc', 'string', { xmlComment: '设备名称' })])
    const schema = buildSchema([entry], { entryClass: 'Entry', generatorVersion: '1.0.0' })
    expect(schema.WithDesc._desc).toBe('设备名称')
  })

  it('extracts description from inline comment when XML absent', () => {
    const entry = cls('Entry', [prop('WithInline', 'string', { inlineComment: '靶台左窗口' })])
    const schema = buildSchema([entry], { entryClass: 'Entry', generatorVersion: '1.0.0' })
    expect(schema.WithInline._desc).toBe('靶台左窗口')
  })

  it('marks [JsonIgnore] attributes with _readOnly', () => {
    const entry = cls('Entry', [
      prop('Skipped', 'Func<object?>', { attributes: [{ name: 'JsonIgnore' }] }),
    ])
    const schema = buildSchema([entry], { entryClass: 'Entry', generatorVersion: '1.0.0' })
    expect(schema.Skipped._readOnly).toBe(true)
  })

  it('detects templates when a custom class is referenced by ≥3 fields', () => {
    const entry = cls('Entry', [
      prop('S1', 'SwitchTypeConfig'),
      prop('S2', 'SwitchTypeConfig'),
      prop('S3', 'SwitchTypeConfig'),
    ])
    const sw = cls(
      'SwitchTypeConfig',
      [
        prop('IsFirstCtrlInvert', 'bool', { xmlComment: '一控取反' }),
        prop('IsSecondCtrlInvert', 'bool'),
      ],
      { xmlComment: '开关量点位(双控双反馈)' },
    )
    const schema = buildSchema([entry, sw], {
      entryClass: 'Entry',
      generatorVersion: '1.0.0',
      templateThreshold: 3,
    })
    expect(schema._templates).toBeDefined()
    expect(schema._templates!['SwitchTypeConfig']).toBeDefined()
    expect(schema._templates!['SwitchTypeConfig']!._desc).toBe('开关量点位(双控双反馈)')
    expect(schema.S1._useTemplate).toBe('SwitchTypeConfig')
  })

  it('does NOT treat single-use class as a template (inlines instead)', () => {
    const entry = cls('Entry', [prop('S1', 'UniqueConfig')])
    const unique = cls('UniqueConfig', [prop('X', 'int')])
    const schema = buildSchema([entry, unique], {
      entryClass: 'Entry',
      generatorVersion: '1.0.0',
      templateThreshold: 3,
    })
    expect(schema._templates?.['UniqueConfig']).toBeUndefined()
    expect(schema.S1._fields).toBeDefined()
    expect(schema.S1._useTemplate).toBeUndefined()
  })

  it('handles List<T> by setting _type=array and _elementTemplate', () => {
    const entry = cls('Entry', [prop('Items', 'List<ImplantElementConfig>')])
    const elem = cls('ImplantElementConfig', [prop('Element', 'string'), prop('Mass', 'double')])
    const schema = buildSchema([entry, elem], {
      entryClass: 'Entry',
      generatorVersion: '1.0.0',
    })
    expect(schema.Items._type).toBe('array')
    expect(schema.Items._elementTemplate).toBeDefined()
    expect(schema.Items._elementTemplate!._type).toBe('object')
  })

  it('emits _instanceDesc on template-using fields when class has a comment', () => {
    const entry = cls('Entry', [
      prop('Door1', 'SwitchTypeConfig'),
      prop('Door2', 'SwitchTypeConfig'),
      prop('Door3', 'SwitchTypeConfig'),
    ])
    const sw = cls('SwitchTypeConfig', [
      prop('IsFirstCtrlInvert', 'bool', { xmlComment: '一控取反' }),
    ])
    // Each DoorX instance has its own inline comment
    entry.properties[0]!.inlineComment = '1#门禁'
    entry.properties[1]!.inlineComment = '2#门禁'
    entry.properties[2]!.inlineComment = '3#门禁'
    const schema = buildSchema([entry, sw], {
      entryClass: 'Entry',
      generatorVersion: '1.0.0',
      templateThreshold: 3,
    })
    expect(schema.Door1._useTemplate).toBe('SwitchTypeConfig')
    expect(schema.Door1._instanceDesc).toBe('1#门禁')
  })

  it('returns empty object when entry class is missing', () => {
    const schema = buildSchema([], { entryClass: 'Missing', generatorVersion: '1.0.0' })
    // Should not throw; root fields are undefined or empty
    expect(Object.keys(schema).filter((k) => !k.startsWith('_'))).toHaveLength(0)
  })
})
