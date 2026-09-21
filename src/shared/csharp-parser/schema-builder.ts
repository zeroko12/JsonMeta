/**
 * Build a SchemaDocument from a set of parsed C# classes.
 *
 * Responsibilities:
 *  - Map C# types to schema `_type` values
 *  - Identify "template" types referenced by ≥ N properties (SwitchTypeConfig etc.)
 *  - Inline other custom classes as nested _fields
 *  - Carry over XML doc / inline comment as `_desc`
 *  - Mark init-only and [JsonIgnore] as `_readOnly`
 *  - Handle List<T> and Dictionary<K,V> specially
 */

import type { SchemaField } from '../utils/validation'
import type { CSharpClass, CSharpProperty } from './types'

export interface SchemaMeta {
  version: number
  rootClass: string
  generatedAt: string
  generatorVersion: string
}

export interface SchemaDocument {
  _meta: SchemaMeta
  _templates?: Record<string, SchemaField>
  [subConfig: string]: SchemaField | SchemaMeta | Record<string, SchemaField> | undefined
}

export interface BuildOptions {
  entryClass: string
  generatorVersion: string
  /** Minimum number of usages for a custom type to become a template. */
  templateThreshold?: number
}

const KNOWN_BOOL = new Set(['bool'])
const KNOWN_INT = new Set(['int', 'short', 'long', 'byte', 'sbyte', 'uint', 'ushort', 'ulong'])
const KNOWN_DOUBLE = new Set(['double', 'float', 'decimal'])

/**
 * Map a C# type string to a schema `_type` value.
 * Returns `null` when the type is a custom (non-primitive, non-generic) class
 * that needs further lookup.
 */
export function csharpTypeToSchemaType(rawType: string): {
  _type: SchemaField['_type']
  /** Inner element type when `_type === 'array'` */
  elementType?: string
  /** Key/value types when `_type === 'object'` (Dictionary) */
  dictKey?: string
  dictValue?: string
  /** The non-generic class name (for `_type === 'object'` referencing a custom class) */
  customClassName?: string
} | null {
  const t = rawType.trim()
  // Nullable: strip trailing `?` for primitive mapping
  const stripped = t.endsWith('?') ? t.slice(0, -1) : t

  if (KNOWN_BOOL.has(stripped)) return { _type: 'bool' }
  if (KNOWN_INT.has(stripped)) return { _type: 'int' }
  if (KNOWN_DOUBLE.has(stripped)) return { _type: 'double' }
  if (stripped === 'string') return { _type: 'string' }

  // Generic: List<T> or IList<T>
  const listMatch = /^(?:List|IList|IEnumerable|ICollection)<(.+)>$/.exec(stripped)
  if (listMatch) {
    return { _type: 'array', elementType: listMatch[1]!.trim() }
  }

  // Dictionary<K, V>
  const dictMatch = /^(?:Dictionary|IDictionary)<(.+),\s*(.+)>$/.exec(stripped)
  if (dictMatch) {
    return {
      _type: 'object',
      dictKey: dictMatch[1]!.trim(),
      dictValue: dictMatch[2]!.trim(),
    }
  }

  // Custom class name (anything else)
  return { _type: 'object', customClassName: stripped }
}

function buildFieldFromProperty(
  prop: CSharpProperty,
  classes: Map<string, CSharpClass>,
  templates: Set<string>,
  visited: Set<string> = new Set(),
): SchemaField {
  const typeInfo = csharpTypeToSchemaType(prop.type)
  const field: SchemaField = { _type: 'object' }

  if (prop.xmlComment) field._desc = prop.xmlComment
  else if (prop.inlineComment) field._desc = prop.inlineComment

  if (prop.isInitOnly) field._readOnly = true
  if (prop.attributes.some((a) => a.name === 'JsonIgnore')) field._readOnly = true

  if (typeInfo === null) {
    field._type = 'string'
    return field
  }

  field._type = typeInfo._type

  if (typeInfo._type === 'array' && typeInfo.elementType) {
    field._elementTemplate = buildElementTemplate(typeInfo.elementType, classes, templates, visited)
  } else if (typeInfo._type === 'object' && typeInfo.customClassName) {
    const className = typeInfo.customClassName
    if (templates.has(className)) {
      field._useTemplate = className
      if (prop.inlineComment && prop.inlineComment !== prop.xmlComment) {
        field._instanceDesc = prop.inlineComment
      }
    } else if (visited.has(className)) {
      // Cycle: emit empty placeholder rather than recursing
      field._fields = {}
    } else {
      // Inline: build nested fields
      const nested = classes.get(className)
      if (nested) {
        visited.add(className)
        field._fields = buildNestedFields(nested, classes, templates, visited)
        if (nested.xmlComment) field._desc = nested.xmlComment
      } else {
        field._fields = {}
      }
    }
  } else if (typeInfo._type === 'object' && typeInfo.dictKey !== undefined) {
    const valueType = typeInfo.dictValue ?? 'string'
    field._fields = {
      _dictValue: buildElementTemplate(valueType, classes, templates, visited),
    }
  }

  return field
}

function buildNestedFields(
  cls: CSharpClass,
  classes: Map<string, CSharpClass>,
  templates: Set<string>,
  visited: Set<string>,
): Record<string, SchemaField> {
  const fields: Record<string, SchemaField> = {}
  visited.add(cls.name)
  for (const p of cls.properties) {
    fields[p.name] = buildFieldFromProperty(p, classes, templates, visited)
  }
  return fields
}

function buildElementTemplate(
  elementType: string,
  classes: Map<string, CSharpClass>,
  templates: Set<string>,
  visited: Set<string>,
): SchemaField {
  const typeInfo = csharpTypeToSchemaType(elementType)
  if (typeInfo === null) return { _type: 'string' }
  if (typeInfo._type === 'array') return { _type: 'array' }
  if (typeInfo._type === 'object' && typeInfo.customClassName) {
    const nested = classes.get(typeInfo.customClassName)
    if (nested) {
      if (visited.has(nested.name)) return { _type: 'object', _fields: {} }
      visited.add(nested.name)
      return {
        _type: 'object',
        _fields: buildNestedFields(nested, classes, templates, visited),
        _desc: nested.xmlComment,
      }
    }
    return { _type: 'object', _fields: {} }
  }
  return { _type: typeInfo._type }
}

/**
 * Identify which custom classes should become templates.
 *
 * Walks the full class graph recursively (not just the entry class) so that
 * types referenced deeply (e.g. SwitchTypeConfig inside SoftwareConfig) are
 * also counted.
 */
function detectTemplates(classes: CSharpClass[], threshold: number): Set<string> {
  const counts = new Map<string, number>()
  const seen = new Set<string>()

  function walk(cls: CSharpClass) {
    if (seen.has(cls.name)) return
    seen.add(cls.name)
    for (const p of cls.properties) {
      const info = csharpTypeToSchemaType(p.type)
      if (info?._type === 'object' && info.customClassName) {
        counts.set(info.customClassName, (counts.get(info.customClassName) ?? 0) + 1)
        const nested = classes.find((c) => c.name === info.customClassName)
        if (nested) walk(nested)
      }
      if (info?._type === 'array' && info.elementType) {
        const elInfo = csharpTypeToSchemaType(info.elementType)
        if (elInfo?._type === 'object' && elInfo.customClassName) {
          counts.set(elInfo.customClassName, (counts.get(elInfo.customClassName) ?? 0) + 1)
          const nested = classes.find((c) => c.name === elInfo.customClassName)
          if (nested) walk(nested)
        }
      }
    }
  }

  for (const c of classes) walk(c)

  const templates = new Set<string>()
  for (const [name, count] of counts) {
    if (count >= threshold) templates.add(name)
  }
  return templates
}

/**
 * Build the schema for the given entry class.
 */
export function buildSchema(classes: CSharpClass[], options: BuildOptions): SchemaDocument {
  const entry = classes.find((c) => c.name === options.entryClass)
  const threshold = options.templateThreshold ?? 3

  const document: SchemaDocument = {
    _meta: {
      version: 1,
      rootClass: options.entryClass,
      generatedAt: new Date().toISOString(),
      generatorVersion: options.generatorVersion,
    },
  }

  if (!entry) return document

  const classMap = new Map<string, CSharpClass>()
  for (const c of classes) classMap.set(c.name, c)

  const templates = detectTemplates(classes, threshold)

  // Build template definitions
  if (templates.size > 0) {
    const templateFields: Record<string, SchemaField> = {}
    for (const name of templates) {
      const cls = classMap.get(name)
      if (!cls) continue
      const visited = new Set<string>([cls.name])
      const fields = buildNestedFields(cls, classMap, templates, visited)
      const tmpl: SchemaField = {
        _type: 'object',
        _fields: fields,
      }
      if (cls.xmlComment) tmpl._desc = cls.xmlComment
      templateFields[name] = tmpl
    }
    document._templates = templateFields
  }

  // Build top-level fields
  const visited = new Set<string>()
  for (const prop of entry.properties) {
    const field = buildFieldFromProperty(prop, classMap, templates, visited)
    ;(document as Record<string, SchemaField>)[prop.name] = field
  }

  return document
}
