/**
 * Schema-driven validation for SystemConfig.json values.
 *
 * Schema fields use underscore-prefixed metadata keys to avoid collision
 * with C# property names. Each field is independently validated; arrays
 * validate element names; object fields validate nested fields.
 *
 * The function returns an array of ValidationResult; empty array means
 * the value is valid.
 */

import type { JsonValue } from './json-path'

export type SchemaType = 'bool' | 'int' | 'double' | 'string' | 'enum' | 'array' | 'object'

export interface SchemaField {
  _type: SchemaType
  _desc?: string
  _instanceDesc?: string
  _min?: number
  _max?: number
  _pattern?: string
  _enum?: JsonValue[]
  _required?: boolean | string[]
  _readOnly?: boolean
  /** Element template for arrays (each element validated against this). */
  _elementTemplate?: SchemaField
  /** Nested fields for object type. */
  _fields?: Record<string, SchemaField>
  /** Used by template-merge: name of template to inline. */
  _useTemplate?: string
  /** Used by template-merge: per-field overrides applied after template. */
  _override?: Record<string, SchemaField>
}

export type ValidationKind = 'type' | 'range' | 'pattern' | 'enum' | 'required' | 'readonly'

export interface ValidationResult {
  /** Dotted path within the validated value (empty string for root). */
  path: string
  type: ValidationKind
  message: string
}

function fail(path: string, type: ValidationKind, message: string): ValidationResult {
  return { path, type, message }
}

/**
 * Validate `value` against `field`. Returns an empty array when the
 * value is valid for the schema field.
 */
export function validate(value: unknown, field: SchemaField): ValidationResult[] {
  const results: ValidationResult[] = []

  // Required check applies to whatever type
  if (field._required && (value === undefined || value === null)) {
    results.push(fail('', 'required', '此字段为必填'))
    return results
  }

  // When value is undefined/null but not required, skip other checks
  if (value === undefined || value === null) {
    return results
  }

  switch (field._type) {
    case 'bool':
      validateBool(value, field, results)
      break
    case 'int':
      validateInt(value, field, results)
      break
    case 'double':
      validateDouble(value, field, results)
      break
    case 'string':
      validateString(value, field, results)
      break
    case 'enum':
      validateEnumField(value, field, results)
      break
    case 'array':
      validateArray(value, field, results)
      break
    case 'object':
      validateObject(value, field, results)
      break
  }

  if (field._readOnly) {
    results.push(fail('', 'readonly', '此字段为只读'))
  }

  return results
}

function validateBool(value: unknown, _field: SchemaField, results: ValidationResult[]): void {
  if (typeof value !== 'boolean') {
    results.push(fail('', 'type', `期望 boolean 类型,实际为 ${describe(value)}`))
  }
}

function validateInt(value: unknown, field: SchemaField, results: ValidationResult[]): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    results.push(fail('', 'type', `期望整数,实际为 ${describe(value)}`))
    return
  }
  checkRange(value, field, results)
}

function validateDouble(value: unknown, field: SchemaField, results: ValidationResult[]): void {
  if (typeof value !== 'number') {
    results.push(fail('', 'type', `期望数字,实际为 ${describe(value)}`))
    return
  }
  checkRange(value, field, results)
}

function checkRange(value: number, field: SchemaField, results: ValidationResult[]): void {
  if (field._min !== undefined && value < field._min) {
    results.push(fail('', 'range', `值 ${value} 小于最小值 ${field._min}`))
  }
  if (field._max !== undefined && value > field._max) {
    results.push(fail('', 'range', `值 ${value} 大于最大值 ${field._max}`))
  }
}

function validateString(value: unknown, field: SchemaField, results: ValidationResult[]): void {
  if (typeof value !== 'string') {
    results.push(fail('', 'type', `期望字符串,实际为 ${describe(value)}`))
    return
  }
  if (field._pattern !== undefined) {
    let regex: RegExp
    try {
      regex = new RegExp(field._pattern)
    } catch {
      results.push(fail('', 'pattern', `invalid regex in schema: ${field._pattern}`))
      return
    }
    if (!regex.test(value)) {
      results.push(fail('', 'pattern', `字符串 "${value}" 不匹配模式 ${field._pattern}`))
    }
  }
}

function validateEnumField(value: unknown, field: SchemaField, results: ValidationResult[]): void {
  const allowed = field._enum ?? []
  if (!allowed.includes(value as JsonValue)) {
    const shown = allowed.map((v) => JSON.stringify(v)).join(', ')
    results.push(fail('', 'enum', `值必须为以下之一: ${shown}, 实际为 ${describe(value)}`))
  }
}

function validateArray(value: unknown, field: SchemaField, results: ValidationResult[]): void {
  if (!Array.isArray(value)) {
    results.push(fail('', 'type', `期望数组,实际为 ${describe(value)}`))
    return
  }
  const elementTemplate = field._elementTemplate
  if (!elementTemplate) return
  for (let i = 0; i < value.length; i++) {
    const childResults = validate(value[i], elementTemplate)
    for (const r of childResults) {
      results.push({
        path: `${i}.${r.path}`.replace(/\.$/, ''),
        type: r.type,
        message: r.message,
      })
    }
  }
}

function validateObject(value: unknown, field: SchemaField, results: ValidationResult[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    results.push(fail('', 'type', `期望对象,实际为 ${describe(value)}`))
    return
  }
  const obj = value as Record<string, unknown>
  const fields = field._fields ?? {}

  // Object-level required: list of field names that must be present
  if (Array.isArray(field._required)) {
    for (const requiredName of field._required) {
      if (!(requiredName in obj)) {
        results.push(fail(requiredName, 'required', `缺少必填字段 ${requiredName}`))
      }
    }
  }

  for (const [name, childField] of Object.entries(fields)) {
    if (!(name in obj)) {
      // Per-child required (boolean)
      if (childField._required === true) {
        results.push(fail(name, 'required', `缺少必填字段 ${name}`))
      }
      continue
    }
    const childResults = validate(obj[name], childField)
    for (const r of childResults) {
      results.push({
        path: r.path ? `${name}.${r.path}` : name,
        type: r.type,
        message: r.message,
      })
    }
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
