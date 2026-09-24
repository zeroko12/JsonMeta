import re

p = 'src/renderer/components/FlatFieldList.vue'
with open(p, encoding='utf-8') as f:
    txt = f.read()

old_start = '/** Walk data + schema recursively. Every layer is editable in place. */'
old_end = 'function onAddDictEntry(g: GroupEntry) {'

start = txt.index(old_start)
end_idx = txt.index(old_end)
assert start != -1 and end_idx != -1 and start < end_idx

new_block = """/** Walk the JSON file's actual contents (recursive).
 * For every key, look up schema for richer type/description/range info.
 * Falls back to runtime-inferred types if schema is missing the key.
 * Skips no-ops when the JSON has no relevant data. */
const allGroups = computed<GroupEntry[]>(() => {
  if (!schemaStore.schema || configStore.current === null) return []
  const out: GroupEntry[] = []
  const schema = schemaStore.schema as unknown as Record<string, unknown>
  for (const key of Object.keys(schema)) {
    if (key.startsWith('_')) continue
    const topSchema = schema[key] as
      | (SchemaField & { _useTemplate?: string; _elementTemplate?: SchemaField })
      | null
      | undefined
    if (!topSchema || typeof topSchema !== 'object') continue
    const topValue = (configStore.current as Record<string, unknown>)[key]
    const topInstanceDesc = topSchema._instanceDesc ?? topSchema._desc ?? ''
    const subSchema = (topSchema as { _fields?: Record<string, unknown> })._fields

    if (isDictLikeGroup(subSchema ?? {}, topValue)) {
      const dictEntries = buildDictEntries(key, subSchema ?? {}, topValue)
      if (dictEntries.length === 0) continue
      out.push({
        groupKey: key,
        groupInstanceDesc: topInstanceDesc,
        isDict: true,
        dictEntries,
        fields: [],
      })
      continue
    }

    if (topSchema._useTemplate) {
      out.push({
        groupKey: key,
        groupInstanceDesc: topInstanceDesc,
        fields: [buildFieldEntry(key, topSchema, topValue)],
      })
      continue
    }

    if (subSchema) {
      const fields = buildFieldEntriesRecursive(key, subSchema, topValue)
      if (fields.length === 0) continue
      out.push({
        groupKey: key,
        groupInstanceDesc: topInstanceDesc,
        fields,
      })
    }
  }
  return out
})

function isDictLikeGroup(fields: Record<string, unknown>, value: unknown): boolean {
  if ('_dictValue' in fields) return true
  if (value === null || value === undefined) return false
  if (typeof value !== 'object' || Array.isArray(value)) return false
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return true
  }
  return false
}

/**
 * Build editable FieldEntry[] by walking JSON's actual keys under `groupValue`.
 * For each key:
 *   - If schema has a definition: use schema._type / _desc / _enum etc.
 *   - Otherwise: infer type from runtime value (typeof / Array.isArray).
 * Recurses into nested objects/arrays — any nesting depth.
 * Skips empty objects/arrays (no field to edit).
 */
function buildFieldEntriesRecursive(
  groupPath: string,
  childFields: Record<string, unknown> | undefined,
  groupValue: unknown,
): FieldEntry[] {
  const jsonKeys =
    groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue)
      ? Object.keys(groupValue as Record<string, unknown>)
      : []
  const schemaKeys = childFields
    ? Object.keys(childFields).filter((k) => !k.startsWith('_'))
    : []
  const allKeysSet = new Set<string>([...jsonKeys, ...schemaKeys])
  const allKeys = [...allKeysSet].sort()

  const entries: FieldEntry[] = []
  for (const fieldName of allKeys) {
    const fieldPath = `${groupPath}.${fieldName}`
    const fieldValue =
      groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue)
        ? (groupValue as Record<string, unknown>)[fieldName]
        : undefined
    const schema = childFields?.[fieldName] as SchemaField | undefined
    const fe = buildFieldEntry(fieldPath, schema, fieldValue, fieldName)
    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
      const innerSchema = schema?._fields as Record<string, unknown> | undefined
      const children = buildFieldEntriesRecursive(fieldPath, innerSchema, fieldValue)
      if (children.length > 0) fe.children = children
    }
    entries.push(fe)
  }
  return entries
}

/**
 * Build one editable FieldEntry. Type comes from schema when available,
 * otherwise inferred from runtime value.
 */
function buildFieldEntry(
  fieldPath: string,
  schema: SchemaField | undefined,
  fieldValue: unknown,
  fieldName: string,
): FieldEntry {
  let fieldType = schema?._type
  let enumValues = schema?._enum
  if (!fieldType) {
    fieldType = inferType(fieldValue)
  }
  return {
    fieldName,
    fieldPath,
    fieldType: fieldType as FieldEntry['fieldType'],
    isReadOnly: schema?._readOnly === true,
    description: schema?._desc,
    enumValues,
    enumStrValues: (enumValues ?? []).map((v) => String(v)),
    isModified: configStore.changes.has(fieldPath),
    existsInData: fieldValue !== undefined,
  }
}

function inferType(v: unknown): FieldEntry['fieldType'] {
  if (v === null || v === undefined) return 'string'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
}

function buildDictEntries(
  groupPath: string,
  childFields: Record<string, unknown> | undefined,
  groupValue: unknown,
): DictEntry[] {
  const out: DictEntry[] = []
  if (!groupValue || typeof groupValue !== 'object' || Array.isArray(groupValue)) {
    return out
  }
  const dictValueSchema = (childFields as { _dictValue?: SchemaField })?._dictValue
  const innerSchemaFields = dictValueSchema?._fields as
    | Record<string, unknown>
    | undefined
  const obj = groupValue as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = `${groupPath}.${key}`
    const inner = buildFieldEntriesRecursive(fieldPath, innerSchemaFields, value)
    out.push({ key, fieldPath, isModified: configStore.changes.has(fieldPath), inner })
  }
  return out
}
"""

txt = txt[:start] + new_block + txt[end_idx:]
with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('ok')