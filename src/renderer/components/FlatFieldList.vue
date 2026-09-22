<script setup lang="ts">
/**
 * FlatFieldList — 主区:字段就地编辑
 *
 * 把字段按 sub-config 分组平铺在主区,每个字段直接带输入框。
 * 搜索时只显示匹配的字段(连同所属 group)。
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

interface FieldEntry {
  groupKey: string
  groupInstanceDesc: string
  fieldName: string
  fieldPath: string
  fieldType: SchemaField['_type']
  isReadOnly: boolean
  description?: string
  enumValues?: JsonValue[]
  enumStrValues?: string[]
  isModified: boolean
}

interface GroupEntry {
  groupKey: string
  groupPath: string
  groupInstanceDesc: string
  fields: FieldEntry[]
}

// Build flat list of all leaf fields
const allGroups = computed<GroupEntry[]>(() => {
  if (!schemaStore.schema || configStore.current === null) return []
  const out: GroupEntry[] = []
  // Use unknown to avoid deep recursion through SchemaField's nested _fields.
  const schema = schemaStore.schema as unknown as Record<string, unknown>
  for (const key of Object.keys(schema)) {
    if (key.startsWith('_')) continue
    const top = schema[key] as
      | {
          _type?: string
          _useTemplate?: string
          _fields?: Record<string, unknown>
          _desc?: string
          _instanceDesc?: string
        }
      | null
      | undefined
    if (!top || typeof top !== 'object') continue
    if (top._useTemplate) {
      out.push(buildGroup(key, key, top as unknown as SchemaField, get(configStore.current, key)))
      continue
    }
    if (top._fields) {
      out.push(buildGroup(key, key, top as unknown as SchemaField, get(configStore.current, key)))
    }
  }
  return out
})

function buildGroup(
  groupKey: string,
  groupPath: string,
  groupField: SchemaField,
  groupValue: unknown,
): GroupEntry {
  const fields: FieldEntry[] = []
  const childFields = (groupField._fields ?? {}) as Record<string, SchemaField>
  for (const fieldName of Object.keys(childFields)) {
    const childSchema = childFields[fieldName] as SchemaField
    const fieldPath = `${groupPath}.${fieldName}`
    fields.push({
      groupKey,
      groupInstanceDesc: groupField._instanceDesc ?? groupField._desc ?? '',
      fieldName,
      fieldPath,
      fieldType: childSchema._type,
      isReadOnly: childSchema._readOnly === true,
      description: childSchema._desc,
      enumValues: childSchema._enum,
      enumStrValues: (childSchema._enum ?? []).map((v) => String(v)),
      isModified: configStore.changes.has(fieldPath),
    })
  }
  return {
    groupKey,
    groupPath,
    groupInstanceDesc: groupField._instanceDesc ?? groupField._desc ?? '',
    fields,
  }
}

const filteredGroups = computed<GroupEntry[]>(() => {
  const q = uiStore.searchQuery.trim().toLowerCase()
  if (!q) return allGroups.value
  return allGroups.value
    .map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) =>
          f.fieldName.toLowerCase().includes(q) ||
          (f.description ?? '').toLowerCase().includes(q) ||
          g.groupKey.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.fields.length > 0)
})

const totalMatched = computed(() =>
  filteredGroups.value.reduce((sum, g) => sum + g.fields.length, 0),
)

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

function onReset(field: FieldEntry) {
  // Revert this single field by removing it from current JSON (will use C# default on next load)
  // For now: simplest revert is to delete the path (the change is "add/modify"; we re-strip it)
  // Actually our diff treats any change as "modify". To revert we need originalSnapshot. For now,
  // we approximate by re-loading the original snapshot field.
  // Simpler: trigger a "discard changes" globally via store.
  // Better: per-field revert — look up the original value from originalSnapshot.
  // The simplest UX: a per-field reset that puts back original value.
  configStore.revertField(field.fieldPath)
}

function onSelect(field: FieldEntry) {
  uiStore.selectedPath = field.fieldPath
}

function isSelected(field: FieldEntry): boolean {
  return uiStore.selectedPath === field.fieldPath
}
</script>

<template>
  <div class="flat-list">
    <div v-if="totalMatched === 0" class="empty">
      <p v-if="uiStore.searchQuery">未找到匹配 "{{ uiStore.searchQuery }}" 的字段</p>
      <p v-else>没有字段可显示</p>
    </div>

    <details v-for="g in filteredGroups" :key="g.groupKey" class="group" open>
      <summary class="group-header">
        <span class="caret">▼</span>
        <strong>{{ g.groupKey }}</strong>
        <span v-if="g.groupInstanceDesc" class="instance-desc">{{ g.groupInstanceDesc }}</span>
        <span class="count">{{ g.fields.length }} 字段</span>
      </summary>

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

          <button v-if="f.isModified" class="reset" title="还原" @click.stop="onReset(f)">↻</button>
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.flat-list {
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
.group[open] .group-header {
  border-bottom: 1px solid #f0f0f0;
}
.group:not([open]) .group-header {
  border-bottom: none;
  border-radius: 6px;
}
.group-header .caret {
  color: #999;
  font-size: 10px;
  display: inline-block;
  transition: transform 0.1s;
}
.group:not([open]) .group-header .caret {
  transform: rotate(-90deg);
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
  transition: background 0.1s;
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
.field-label .modified-dot {
  position: absolute;
  margin-left: 4px;
  color: #fa8c16;
  font-size: 14px;
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
.field-input .unknown {
  color: #999;
  font-style: italic;
  font-size: 11px;
}
.field-input .reset {
  padding: 2px 8px;
  border: 1px solid #d9d9d9;
  background: white;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: #1890ff;
}
.field-input .reset:hover {
  background: #e6f7ff;
}
</style>
