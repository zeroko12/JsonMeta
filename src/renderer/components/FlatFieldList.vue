<script setup lang="ts">
/**
 * DataTree — 主区:递归展示数据树的每一层(都能就地编辑)
 *
 * 走实际 JSON + schema 递归:
 * - 顶层 10 个 sub-config 各自成 group
 * - 任何 object 类型的字段若 current 中存在,递归展开子字段(就地编辑)
 * - 字典按实际 key 展开(每 key 一组,内嵌字段也能就地编辑)
 * - 只显示 JSON 里真实存在的字段(C# 默认/硬编码跳过)
 */
import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import FieldRow from './FieldRow.vue'
import type { JsonValue } from '@shared/utils/json-path'
import type { SchemaField } from '@shared/utils/validation'

const configStore = useConfigStore()
const schemaStore = useSchemaStore()
const uiStore = useUiStore()

interface FieldEntry {
  fieldName: string
  fieldPath: string
  fieldType: SchemaField['_type']
  isReadOnly: boolean
  description?: string
  enumValues?: JsonValue[]
  enumStrValues?: string[]
  isModified: boolean
  existsInData: boolean
  children?: FieldEntry[]
}

interface DictEntry {
  key: string
  fieldPath: string
  isModified: boolean
  inner: FieldEntry[]
}

interface GroupEntry {
  groupKey: string
  groupInstanceDesc: string
  isDict?: boolean
  dictEntries?: DictEntry[]
  fields: FieldEntry[]
}

/** Walk the JSON file's actual contents (recursive).
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
      (SchemaField & { _useTemplate?: string; _elementTemplate?: SchemaField }) | null | undefined
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
        fields: [buildFieldEntry(key, topSchema, topValue, key)],
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
  const schemaKeys = childFields ? Object.keys(childFields).filter((k) => !k.startsWith('_')) : []
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
  const innerSchemaFields = dictValueSchema?._fields as Record<string, unknown> | undefined
  const obj = groupValue as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = `${groupPath}.${key}`
    const inner = buildFieldEntriesRecursive(fieldPath, innerSchemaFields, value)
    out.push({ key, fieldPath, isModified: configStore.changes.has(fieldPath), inner })
  }
  return out
}
function onAddDictEntry(g: GroupEntry) {
  if (!configStore.current) return
  const path = g.groupKey
  const cur = (configStore.current as Record<string, unknown>)[g.groupKey]
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
    const newKey = `New${g.groupKey}${Object.keys(cur).length}`
    ;(cur as Record<string, unknown>)[newKey] = {}
    configStore.current = { ...(configStore.current as object) }
    uiStore.selectedPath = `${path}.${newKey}`
  }
}

/** Recursively filter fields by search query (matches field name or description). */
function filterFields(fields: FieldEntry[], q: string): FieldEntry[] {
  if (!q) return fields
  const out: FieldEntry[] = []
  for (const f of fields) {
    const self =
      f.fieldName.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q)
    const children = f.children ? filterFields(f.children, q) : undefined
    if (self || (children && children.length > 0)) {
      out.push({ ...f, children })
    }
  }
  return out
}

const filteredGroups = computed<GroupEntry[]>(() => {
  const q = uiStore.searchQuery.trim().toLowerCase()
  if (!q) return allGroups.value
  return allGroups.value
    .map((g: GroupEntry) => ({
      ...g,
      dictEntries: g.dictEntries?.map((d: DictEntry) => ({
        ...d,
        inner: filterFields(d.inner, q),
      })),
      fields: filterFields(g.fields, q),
    }))
    .filter(
      (g: GroupEntry) =>
        g.fields.length > 0 ||
        (g.dictEntries && g.dictEntries.some((d: DictEntry) => d.inner.length > 0)),
    )
})

const totalMatched = computed(() => {
  function count(fs: FieldEntry[]): number {
    let n = 0
    for (const f of fs) {
      n += 1
      if (f.children) n += count(f.children)
    }
    return n
  }
  let n = 0
  for (const g of filteredGroups.value) {
    n += count(g.fields)
    for (const d of g.dictEntries ?? []) n += count(d.inner)
  }
  return n
})
</script>

<template>
  <div class="data-tree">
    <div v-if="totalMatched === 0" class="empty">
      <p v-if="uiStore.searchQuery">未找到匹配 "{{ uiStore.searchQuery }}" 的字段</p>
      <p v-else>没有字段可显示</p>
    </div>

    <details v-for="g in filteredGroups" :key="g.groupKey" class="group" open>
      <summary class="group-header">
        <span class="caret">▼</span>
        <strong>{{ g.groupKey }}</strong>
        <span v-if="g.groupInstanceDesc" class="instance-desc">{{ g.groupInstanceDesc }}</span>
        <span class="count">
          {{ g.fields.length + (g.dictEntries?.reduce((s, d) => s + d.inner.length, 0) ?? 0) }} 字段
        </span>
      </summary>

      <FieldRow v-for="f in g.fields" :key="f.fieldPath" :field="f" :depth="0" />

      <template v-if="g.isDict && g.dictEntries">
        <div v-for="de in g.dictEntries" :key="de.key" class="dict-entry">
          <div class="dict-header" @click="uiStore.selectedPath = de.fieldPath">
            <code class="dict-key">{{ de.key }}</code>
            <span class="count">{{ de.inner.length }} 字段</span>
          </div>
          <FieldRow v-for="f in de.inner" :key="f.fieldPath" :field="f" :depth="0" />
        </div>
        <button class="add-dict-btn" @click="onAddDictEntry(g)">+ 新增条目</button>
      </template>
    </details>
  </div>
</template>

<style scoped>
.data-tree {
  flex: 1;
  overflow: auto;
  padding: 8px 16px 32px;
  background: white;
}
.empty {
  padding: 80px 40px;
  text-align: center;
  color: #999;
}
.group {
  margin-bottom: 12px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  background: white;
}
.group-header {
  padding: 10px 14px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  border-radius: 6px 6px 0 0;
}
.group-header .caret {
  color: #999;
  font-size: 10px;
  display: inline-block;
}
.group-header strong {
  font-family: monospace;
  font-size: 13px;
  color: #003eb3;
}
.group-header .instance-desc {
  color: #888;
  font-size: 11px;
  font-weight: normal;
}
.group-header .count {
  margin-left: auto;
  font-size: 11px;
  color: #999;
}
.dict-entry {
  border-top: 1px solid #f0f0f0;
  background: #fcfcfc;
}
.dict-entry .dict-header {
  padding: 6px 14px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Consolas', monospace;
  font-size: 11px;
  cursor: pointer;
}
.dict-entry .dict-key {
  font-weight: 600;
  color: #722ed1;
}
.dict-entry .count {
  color: #999;
  font-size: 10px;
}
.add-dict-btn {
  display: block;
  margin: 4px 14px 12px 28px;
  padding: 4px 12px;
  background: #fafafa;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: #666;
}
.add-dict-btn:hover {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}
</style>
