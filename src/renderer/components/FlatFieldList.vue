<script setup lang="ts">
/**
 * DataTree — 主区:走实际 JSON 数据,显示真实存在的字段
 *
 * 每个 sub-config 按真实数据 key 列出,字段也只在 current 中存在才显示。
 * 字典按实际 key 展开。
 * 每个字段直接带 input/checkbox/select + 描述。
 * 点击字段 → 选中并 emit,让右侧 EditPanel 显示焦点编辑。
 */
import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import { get, set } from '@shared/utils/json-path'
import type { JsonValue } from '@shared/utils/json-path'
import type { SchemaField } from '@shared/utils/validation'

const configStore = useConfigStore()
const schemaStore = useSchemaStore()
const uiStore = useUiStore()

const emit = defineEmits<{ select: [path: string] }>()

interface FieldEntry {
  groupKey: string
  groupPath: string
  groupInstanceDesc: string
  fieldName: string
  fieldPath: string
  fieldType: SchemaField['_type']
  isReadOnly: boolean
  description?: string
  enumValues?: JsonValue[]
  enumStrValues?: string[]
  isModified: boolean
  existsInData: boolean
}

interface DictEntry {
  key: string
  fieldPath: string
  isModified: boolean
  inner: FieldEntry[]
}

interface GroupEntry {
  groupKey: string
  groupPath: string
  groupInstanceDesc: string
  isDict?: boolean
  dictEntries?: DictEntry[]
  fields: FieldEntry[]
}

/** Build the data tree by walking current, only showing what's actually there. */
const allGroups = computed<GroupEntry[]>(() => {
  if (!schemaStore.schema || configStore.current === null) return []
  const out: GroupEntry[] = []
  const schema = schemaStore.schema as unknown as Record<string, unknown>
  for (const key of Object.keys(schema)) {
    if (key.startsWith('_')) continue
    const top = schema[key] as
      (SchemaField & { _useTemplate?: string; _elementTemplate?: SchemaField }) | null | undefined
    if (!top || typeof top !== 'object') continue

    const topValue = (configStore.current as Record<string, unknown>)[key]
    const topPath = key
    const topInstanceDesc = top._instanceDesc ?? top._desc ?? ''

    if (top._useTemplate) {
      out.push({
        groupKey: key,
        groupPath: topPath,
        groupInstanceDesc: topInstanceDesc,
        fields: [buildFieldEntry(topPath, top, topValue)],
      })
      continue
    }

    if (top._fields) {
      const isDict = isDictLikeGroup(top._fields, topValue)
      if (isDict) {
        out.push({
          groupKey: key,
          groupPath: topPath,
          groupInstanceDesc: topInstanceDesc,
          isDict: true,
          dictEntries: buildDictEntries(topPath, top._fields, topValue),
          fields: [],
        })
      } else {
        out.push({
          groupKey: key,
          groupPath: topPath,
          groupInstanceDesc: topInstanceDesc,
          fields: buildFieldEntries(topPath, top._fields, topValue),
        })
      }
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

function buildFieldEntries(
  groupPath: string,
  childFields: Record<string, unknown>,
  groupValue: unknown,
): FieldEntry[] {
  const entries: FieldEntry[] = []
  for (const [fieldName, childSchema] of Object.entries(childFields)) {
    if (fieldName.startsWith('_')) continue
    const fieldPath = `${groupPath}.${fieldName}`
    const fieldValue =
      groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue)
        ? (groupValue as Record<string, unknown>)[fieldName]
        : undefined
    entries.push(buildFieldEntry(fieldPath, childSchema as SchemaField, fieldValue))
  }
  return entries
}

function buildFieldEntry(fieldPath: string, schema: SchemaField, fieldValue: unknown): FieldEntry {
  // Only surface fields that actually exist in the loaded JSON file.
  // Fields that are pure C# defaults / hardcoded elsewhere are silently skipped.
  const exists = fieldValue !== undefined
  return {
    groupKey: '',
    groupPath: '',
    groupInstanceDesc: '',
    fieldName: fieldPath.split('.').pop() ?? '',
    fieldPath,
    fieldType: schema._type,
    isReadOnly: schema._readOnly === true,
    description: schema._desc,
    enumValues: schema._enum,
    enumStrValues: (schema._enum ?? []).map((v) => String(v)),
    isModified: configStore.changes.has(fieldPath),
    existsInData: exists,
  }
}

function buildDictEntries(
  groupPath: string,
  childFields: Record<string, unknown>,
  groupValue: unknown,
): DictEntry[] {
  const out: DictEntry[] = []
  if (!groupValue || typeof groupValue !== 'object' || Array.isArray(groupValue)) {
    return out
  }
  const dictValueSchema = (childFields._dictValue as SchemaField | undefined) ?? undefined
  const innerSchemaFields = dictValueSchema?._fields ?? {}
  const obj = groupValue as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = `${groupPath}.${key}`
    const inner = buildFieldEntries(fieldPath, innerSchemaFields, value)
    out.push({ key, fieldPath, isModified: configStore.changes.has(fieldPath), inner })
  }
  return out
}

const filteredGroups = computed<GroupEntry[]>(() => {
  const q = uiStore.searchQuery.trim().toLowerCase()
  if (!q) return allGroups.value
  return allGroups.value
    .map((g) => ({
      ...g,
      dictEntries: g.dictEntries
        ?.map((d) => ({
          ...d,
          inner: d.inner.filter((f) => matchSearch(f, q)),
        }))
        .filter((d) => d.inner.length > 0 || d.key.toLowerCase().includes(q)),
      fields: g.fields.filter((f) => matchSearch(f, q) || g.groupKey.toLowerCase().includes(q)),
    }))
    .filter(
      (g) =>
        g.fields.length > 0 || (g.dictEntries && g.dictEntries.some((d) => d.inner.length > 0)),
    )
})

function matchSearch(f: FieldEntry, q: string): boolean {
  return f.fieldName.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q)
}

const totalMatched = computed(() => {
  return filteredGroups.value.reduce(
    (sum, g) =>
      sum + g.fields.length + (g.dictEntries?.reduce((s, d) => s + d.inner.length, 0) ?? 0),
    0,
  )
})

function onBoolChange(field: FieldEntry, e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  configStore.current = set(configStore.current as JsonValue, field.fieldPath, checked as JsonValue)
}
function onTextChange(field: FieldEntry, e: Event) {
  const v = (e.target as HTMLInputElement).value
  configStore.current = set(configStore.current as JsonValue, field.fieldPath, v as JsonValue)
}
function onIntChange(field: FieldEntry, e: Event) {
  const v = Number.parseInt((e.target as HTMLInputElement).value, 10)
  configStore.current = set(configStore.current as JsonValue, field.fieldPath, v as JsonValue)
}
function onDoubleChange(field: FieldEntry, e: Event) {
  const v = Number.parseFloat((e.target as HTMLInputElement).value)
  configStore.current = set(configStore.current as JsonValue, field.fieldPath, v as JsonValue)
}
function onEnumChange(field: FieldEntry, e: Event) {
  const v = (e.target as HTMLSelectElement).value
  configStore.current = set(configStore.current as JsonValue, field.fieldPath, v as JsonValue)
}
function onAddDictEntry(g: GroupEntry) {
  if (!configStore.current) return
  const path = g.groupPath
  const cur = (configStore.current as Record<string, unknown>)[g.groupKey]
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
    const newKey = `New${g.groupKey}${Object.keys(cur).length}`
    ;(cur as Record<string, unknown>)[newKey] = {}
    configStore.current = { ...(configStore.current as object) }
    uiStore.selectedPath = `${path}.${newKey}`
  }
}

function onSelect(field: FieldEntry) {
  uiStore.selectedPath = field.fieldPath
  emit('select', field.fieldPath)
}

function isSelected(field: FieldEntry): boolean {
  return uiStore.selectedPath === field.fieldPath
}
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

      <!-- Plain object: show each field as editable row -->
      <div
        v-for="f in g.fields"
        :key="f.fieldPath"
        class="field"
        :class="{ modified: f.isModified, selected: isSelected(f) }"
        @click="onSelect(f)"
      >
        <div class="field-label">
          <code class="name">{{ f.fieldName }}</code>
          <small class="type">· {{ f.fieldType }}</small>
          <span v-if="f.description" class="desc">{{ f.description }}</span>
          <span v-if="f.isModified" class="modified-dot" title="已修改">●</span>
        </div>

        <div class="field-input">
          <template v-if="f.fieldType === 'bool'">
            <label>
              <input
                type="checkbox"
                :checked="get(configStore.current, f.fieldPath) === true"
                :disabled="f.isReadOnly"
                @change="(e) => onBoolChange(f, e)"
                @click.stop
              />
              <span :class="{ off: get(configStore.current, f.fieldPath) !== true }">
                {{ get(configStore.current, f.fieldPath) === true ? 'true' : 'false' }}
              </span>
            </label>
          </template>

          <input
            v-else-if="f.fieldType === 'string'"
            type="text"
            :value="(get(configStore.current, f.fieldPath) as string) ?? ''"
            :disabled="f.isReadOnly"
            @input="(e) => onTextChange(f, e)"
            @click.stop
          />

          <input
            v-else-if="f.fieldType === 'int'"
            type="number"
            step="1"
            :value="(get(configStore.current, f.fieldPath) as number) ?? 0"
            :disabled="f.isReadOnly"
            @input="(e) => onIntChange(f, e)"
            @click.stop
          />

          <input
            v-else-if="f.fieldType === 'double'"
            type="number"
            step="any"
            :value="(get(configStore.current, f.fieldPath) as number) ?? 0"
            :disabled="f.isReadOnly"
            @input="(e) => onDoubleChange(f, e)"
            @click.stop
          />

          <select
            v-else-if="f.fieldType === 'enum'"
            :value="String(get(configStore.current, f.fieldPath) ?? '')"
            :disabled="f.isReadOnly"
            @change="(e) => onEnumChange(f, e)"
            @click.stop
          >
            <option v-for="opt in f.enumStrValues" :key="opt" :value="opt">{{ opt }}</option>
          </select>

          <code v-else class="unknown">类型 {{ f.fieldType }} 不支持就地编辑</code>
        </div>
      </div>

      <!-- Dict-like group: each existing key is its own sub-section -->
      <template v-if="g.isDict && g.dictEntries">
        <div v-for="de in g.dictEntries" :key="de.key" class="dict-entry">
          <div class="dict-header" @click="uiStore.selectedPath = de.fieldPath">
            <code class="dict-key">{{ de.key }}</code>
            <span class="count">{{ de.inner.length }} 字段</span>
          </div>
          <div
            v-for="f in de.inner"
            :key="f.fieldPath"
            class="field dict-field"
            :class="{ modified: f.isModified, selected: isSelected(f), missing: !f.existsInData }"
            @click="onSelect(f)"
          >
            <div class="field-label">
              <code class="name">{{ f.fieldName }}</code>
              <small class="type">· {{ f.fieldType }}</small>
              <span v-if="f.description" class="desc">{{ f.description }}</span>
              <span v-if="!f.existsInData" class="missing-dot">⚠ 未设置</span>
              <span v-if="f.isModified" class="modified-dot">●</span>
            </div>
            <div class="field-input">
              <span v-if="!f.existsInData" class="not-set">未设置</span>
              <input
                v-else-if="f.fieldType === 'string'"
                type="text"
                :value="(get(configStore.current, f.fieldPath) as string) ?? ''"
                :disabled="f.isReadOnly"
                @input="(e) => onTextChange(f, e)"
                @click.stop
              />
              <input
                v-else-if="f.fieldType === 'bool'"
                type="checkbox"
                :checked="get(configStore.current, f.fieldPath) === true"
                :disabled="f.isReadOnly"
                @change="(e) => onBoolChange(f, e)"
                @click.stop
              />
              <input
                v-else-if="f.fieldType === 'int'"
                type="number"
                step="1"
                :value="(get(configStore.current, f.fieldPath) as number) ?? 0"
                :disabled="f.isReadOnly"
                @input="(e) => onIntChange(f, e)"
                @click.stop
              />
              <input
                v-else-if="f.fieldType === 'double'"
                type="number"
                step="any"
                :value="(get(configStore.current, f.fieldPath) as number) ?? 0"
                :disabled="f.isReadOnly"
                @input="(e) => onDoubleChange(f, e)"
                @click.stop
              />
              <select
                v-else-if="f.fieldType === 'enum'"
                :value="String(get(configStore.current, f.fieldPath) ?? '')"
                :disabled="f.isReadOnly"
                @change="(e) => onEnumChange(f, e)"
                @click.stop
              >
                <option v-for="opt in f.enumStrValues" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <code v-else class="unknown">{{ f.fieldType }}</code>
            </div>
          </div>
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
.field {
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  gap: 16px;
  padding: 8px 14px;
  border-bottom: 1px solid #f5f5f5;
  align-items: center;
  cursor: pointer;
}
.field:last-child {
  border-bottom: none;
}
.field:hover {
  background: #fafbfc;
}
.field.selected {
  background: #e6f7ff;
}
.field.modified {
  background: #fff7e6;
}
.field.modified.selected {
  background: #ffd591;
}
.field.missing {
  background: #fafafa;
  opacity: 0.7;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.field-label .name {
  font-weight: 600;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  color: #003eb3;
}
.field-label .type {
  font-weight: normal;
  color: #999;
  font-size: 10px;
  margin-left: 4px;
}
.field-label .desc {
  font-size: 11px;
  color: #555;
  line-height: 1.4;
}
.field.modified .field-label .name {
  color: #d46b08;
}
.modified-dot {
  color: #fa8c16;
  font-size: 14px;
}
.missing-dot {
  color: #d4380d;
  font-size: 11px;
  font-weight: 600;
}
.field-input {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
}
.field-input input[type='text'],
.field-input input[type='number'],
.field-input select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  box-sizing: border-box;
}
.field-input input:focus,
.field-input select:focus {
  border-color: #1890ff;
  outline: none;
}
.field-input input:disabled,
.field-input select:disabled {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}
.field-input input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.field-input label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-input .off {
  color: #aaa;
}
.field-input .not-set {
  color: #d4380d;
  font-size: 11px;
}
.field-input .unknown {
  color: #999;
  font-style: italic;
  font-size: 11px;
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
}
.dict-entry .dict-key {
  font-weight: 600;
  color: #722ed1;
}
.dict-entry .count {
  color: #999;
  font-size: 10px;
}
.dict-field {
  padding-left: 28px;
  background: #fafafa;
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
