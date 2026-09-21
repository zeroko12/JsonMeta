import { describe, expect, it } from 'vitest'
import { validate, type SchemaField } from '@shared/utils/validation'

describe('validate', () => {
  describe('bool', () => {
    const field: SchemaField = { _type: 'bool' }

    it('accepts true', () => {
      expect(validate(true, field)).toEqual([])
    })

    it('accepts false', () => {
      expect(validate(false, field)).toEqual([])
    })

    it('rejects non-boolean', () => {
      const results = validate('true', field)
      expect(results).toHaveLength(1)
      expect(results[0]!.type).toBe('type')
      expect(results[0]!.message).toMatch(/boolean/i)
    })

    it('rejects number', () => {
      const results = validate(1, field)
      expect(results).toHaveLength(1)
      expect(results[0]!.type).toBe('type')
    })
  })

  describe('int', () => {
    const field: SchemaField = { _type: 'int', _min: 0, _max: 100 }

    it('accepts integer in range', () => {
      expect(validate(50, field)).toEqual([])
    })

    it('rejects integer below min', () => {
      const results = validate(-1, field)
      expect(results.some((r) => r.type === 'range')).toBe(true)
    })

    it('rejects integer above max', () => {
      const results = validate(101, field)
      expect(results.some((r) => r.type === 'range')).toBe(true)
    })

    it('accepts boundary values', () => {
      expect(validate(0, field)).toEqual([])
      expect(validate(100, field)).toEqual([])
    })

    it('rejects float for int type', () => {
      const results = validate(1.5, field)
      expect(results.some((r) => r.type === 'type')).toBe(true)
    })
  })

  describe('double', () => {
    const field: SchemaField = { _type: 'double', _min: -100.5, _max: 100.5 }

    it('accepts float in range', () => {
      expect(validate(0.5, field)).toEqual([])
    })

    it('rejects float below min', () => {
      const results = validate(-101, field)
      expect(results.some((r) => r.type === 'range')).toBe(true)
    })

    it('rejects float above max', () => {
      const results = validate(200, field)
      expect(results.some((r) => r.type === 'range')).toBe(true)
    })

    it('accepts integer value', () => {
      expect(validate(50, field)).toEqual([])
    })
  })

  describe('string', () => {
    it('accepts any string by default', () => {
      expect(validate('hello', { _type: 'string' })).toEqual([])
    })

    it('rejects non-string values', () => {
      const results = validate(123, { _type: 'string' })
      expect(results.some((r) => r.type === 'type')).toBe(true)
    })

    it('validates against regex pattern', () => {
      const ipPattern = '^(\\d{1,3}\\.){3}\\d{1,3}$'
      const field: SchemaField = { _type: 'string', _pattern: ipPattern }
      expect(validate('192.168.1.16', field)).toEqual([])
      const bad = validate('not-an-ip', field)
      expect(bad.some((r) => r.type === 'pattern')).toBe(true)
    })

    it('rejects invalid pattern source gracefully', () => {
      const field: SchemaField = { _type: 'string', _pattern: '[' }
      const results = validate('anything', field)
      expect(results.some((r) => r.type === 'pattern' && r.message.includes('invalid regex'))).toBe(
        true,
      )
    })
  })

  describe('enum', () => {
    const field: SchemaField = { _type: 'enum', _enum: ['mA', 'kV', 'Torr', '℃'] }

    it('accepts value in enum list', () => {
      expect(validate('mA', field)).toEqual([])
      expect(validate('℃', field)).toEqual([])
    })

    it('rejects value not in enum list', () => {
      const results = validate('invalid', field)
      expect(results.some((r) => r.type === 'enum')).toBe(true)
      expect(results[0]!.message).toContain('mA')
    })
  })

  describe('array', () => {
    const field: SchemaField = {
      _type: 'array',
      _elementTemplate: { _type: 'string' },
    }

    it('accepts empty array', () => {
      expect(validate([], field)).toEqual([])
    })

    it('accepts array of valid elements', () => {
      expect(validate(['a', 'b', 'c'], field)).toEqual([])
    })

    it('rejects non-array value', () => {
      const results = validate('not-array', field)
      expect(results.some((r) => r.type === 'type')).toBe(true)
    })

    it('reports element-level errors with index in path', () => {
      const fieldWithMin: SchemaField = {
        _type: 'array',
        _elementTemplate: { _type: 'int', _min: 0, _max: 10 },
      }
      const results = validate([5, 99, -1, 7], fieldWithMin)
      expect(results).toHaveLength(2)
      expect(results[0]!.path).toBe('1')
      expect(results[1]!.path).toBe('2')
    })
  })

  describe('object', () => {
    const field: SchemaField = {
      _type: 'object',
      _required: ['Name', 'Value'],
      _fields: {
        Name: { _type: 'string' },
        Value: { _type: 'int' },
        Optional: { _type: 'string' },
      },
    }

    it('accepts object with all required fields', () => {
      expect(validate({ Name: 'foo', Value: 42 }, field)).toEqual([])
    })

    it('accepts object with required + optional fields', () => {
      expect(validate({ Name: 'foo', Value: 42, Optional: 'bar' }, field)).toEqual([])
    })

    it('reports missing required fields', () => {
      const results = validate({ Name: 'foo' }, field)
      expect(results).toHaveLength(1)
      expect(results[0]!.type).toBe('required')
      expect(results[0]!.path).toBe('Value')
    })

    it('reports type errors on nested fields with dotted path', () => {
      const results = validate({ Name: 'foo', Value: 'oops' }, field)
      expect(results.some((r) => r.type === 'type' && r.path === 'Value')).toBe(true)
    })

    it('ignores unknown keys (permissive by design)', () => {
      expect(validate({ Name: 'x', Value: 1, Extra: 'whatever' }, field)).toEqual([])
    })
  })

  describe('required (top-level)', () => {
    it('reports missing value when required', () => {
      const results = validate(undefined, { _type: 'string', _required: true })
      expect(results.some((r) => r.type === 'required')).toBe(true)
    })

    it('does not report when not required', () => {
      const results = validate(undefined, { _type: 'string' })
      expect(results).toEqual([])
    })
  })

  describe('readOnly (warning)', () => {
    it('returns warning when modifying readOnly field', () => {
      const results = validate(99, { _type: 'int', _readOnly: true })
      expect(results.some((r) => r.type === 'readonly')).toBe(true)
    })
  })
})
