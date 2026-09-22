<script setup lang="ts">
/**
 * InPlaceEditor — 字段就地编辑面板
 *
 * 替代旧的 EditPanel(树 + 右侧编辑面板分离),改为:
 * - 树依然保留作为导航(可折叠)
 * - 中间主区域直接显示字段列表 + 输入控件
 * - 描述挂在字段名旁边,改值时描述和编辑同时呈现
 * - 搜索(Ctrl+F)聚焦匹配字段
 */
import { computed } from 'vue'
import { useSchemaStore } from '../stores/schema'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'
import { get, set, remove } from '@shared/utils/json-path'
import type { JsonValue } from '@shared/utils/json-path'
import type { SchemaField, ValidationResult } from '@shared/utils/validation'

const schemaStore = useSchemaStore()
const configStore = useConfigStore()
const uiStore = useUiStore()

const field = computed<SchemaField | undefined>(() => schemaStore.getField(uiStore.selectedPath))

const value = computed(() => get(configStore.current, uiStore.selectedPath))

const validation = computed<ValidationResult[]>(() => {
  if (!field.value || value.value === undefined) return []
  return schemaStore.validateValue(value.value, field.value)
})

const isModified = computed(() => configStore.changes.has(uiStore.selectedPath))

function onBoolChange(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  if (!configStore.current) return
  configStore.current = set(
    configStore.current as JsonValue,
    uiStore.selectedPath,
    checked as JsonValue,
  )
}
function onTextChange(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (!configStore.current) return
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}
function onIntChange(e: Event) {
  const v = Number.parseInt((e.target as HTMLInputElement).value, 10)
  if (!configStore.current) return
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}
function onDoubleChange(e: Event) {
  const v = Number.parseFloat((e.target as HTMLInputElement).value)
  if (!configStore.current) return
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}
function onEnumChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (!configStore.current) return
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}

function onDelete() {
  if (!configStore.current) return
  const next = remove(configStore.current as JsonValue, uiStore.selectedPath)
  configStore.current = next
}

function onAddField() {
  // Walk schema for missing sibling
  const segments = uiStore.selectedPath.split('.')
  const parentPath = segments.slice(0, -1).join('.')
  const parentField = schemaStore.getField(parentPath)
  if (!parentField?._fields) return
  const parentValue = get(configStore.current, parentPath) as Record<string, unknown> | null
  const existingKeys = new Set(parentValue ? Object.keys(parentValue) : [])
  const available = Object.keys(parentField._fields).filter((k) => !existingKeys.has(k))
  if (available.length === 0) return
  const newKey = available[0]!
  const newField = parentField._fields[newKey]!
  const defaultValue = defaultValueForField(newField)
  const newParentValue = { ...(parentValue ?? {}), [newKey]: defaultValue }
  if (!configStore.current) return
  configStore.current = set(
    configStore.current as JsonValue,
    parentPath,
    newParentValue as JsonValue,
  )
  uiStore.selectedPath = `${parentPath}.${newKey}`
}

function defaultValueForField(f: SchemaField): unknown {
  switch (f._type) {
    case 'bool':
      return false
    case 'int':
      return 0
    case 'double':
      return 0
    case 'string':
      return ''
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return null
  }
}

function inputType(t: SchemaField['_type']): string {
  if (t === 'int') return 'number'
  if (t === 'double') return 'number'
  return 'text'
}

function inputStep(t: SchemaField['_type']): string {
  if (t === 'int') return '1'
  if (t === 'double') return 'any'
  return ''
}

function onNumberChange(t: SchemaField['_type'], e: Event) {
  if (t === 'int') onIntChange(e)
  else onDoubleChange(e)
}
</script>

<template>
  <div class="inplace">
    <div v-if="!field" class="empty">
      <p>选中左侧字段查看详情</p>
    </div>
    <div v-else class="content">
      <header class="field-header">
        <h2>
          <code>{{ uiStore.selectedPath.split('.').pop() }}</code>
          <span v-if="field._desc" class="desc-sub">{{ field._desc }}</span>
        </h2>
        <code class="path">{{ uiStore.selectedPath }}</code>
      </header>

      <section class="value-editor">
        <template v-if="field._type === 'bool'">
          <label>
            <input
              type="checkbox"
              :checked="value === true"
              :disabled="field._readOnly === true"
              @change="onBoolChange"
            />
            {{ value === true ? 'true' : 'false' }}
          </label>
        </template>

        <input
          v-else-if="field._type === 'string'"
          type="text"
          :value="(value as string) ?? ''"
          :disabled="field._readOnly === true"
          @input="onTextChange"
        />

        <input
          v-else-if="field._type === 'int' || field._type === 'double'"
          :type="inputType(field._type)"
          :step="inputStep(field._type)"
          :value="(value as number) ?? 0"
          :disabled="field._readOnly === true"
          @input="(e) => onNumberChange(field!._type, e)"
        />

        <select
          v-else-if="field._type === 'enum'"
          :value="(value as string) ?? ''"
          :disabled="field._readOnly === true"
          @change="onEnumChange"
        >
          <option v-for="opt in field._enum ?? []" :key="String(opt)" :value="String(opt)">
            {{ String(opt) }}
          </option>
        </select>

        <textarea
          v-else-if="field._type === 'object' || field._type === 'array'"
          readonly
          :value="JSON.stringify(value, null, 2)"
          rows="6"
        />
        <p v-else class="unknown">未知类型 {{ field._type }}</p>
      </section>

      <section v-if="field._min !== undefined || field._max !== undefined" class="range">
        <span v-if="field._min !== undefined">
          最小:
          <b>{{ field._min }}</b>
        </span>
        <span v-if="field._max !== undefined">
          最大值:
          <b>{{ field._max }}</b>
        </span>
      </section>

      <section v-if="validation.length > 0" class="warnings">
        <p v-for="v in validation" :key="v.path" :class="v.type">⚠ {{ v.message }}</p>
      </section>

      <footer class="actions">
        <button v-if="!field._readOnly" class="danger" @click="onDelete">🗑 删除</button>
        <button class="primary" @click="onAddField">+ 新增字段</button>
        <span v-if="isModified" class="modified-marker">● 已修改</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.inplace {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: auto;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}
.field-header h2 {
  margin: 0 0 4px;
  font-size: 14px;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.field-header h2 .desc-sub {
  font-weight: normal;
  font-size: 12px;
  color: #555;
  font-family: 'Microsoft YaHei', sans-serif;
}
.field-header .path {
  color: #888;
  font-size: 11px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}
.value-editor {
  margin-top: 16px;
}
.value-editor input[type='text'],
.value-editor input[type='number'],
.value-editor select,
.value-editor textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  box-sizing: border-box;
}
.value-editor label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.range {
  color: #666;
  font-size: 12px;
  margin-top: 12px;
  display: flex;
  gap: 16px;
}
.warnings {
  margin-top: 12px;
}
.warnings p {
  margin: 4px 0;
  padding: 6px 10px;
  border-radius: 4px;
  background: #fffbe6;
  border-left: 3px solid #faad14;
  color: #d48806;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  align-items: center;
}
.actions button {
  padding: 8px 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.actions .primary {
  background: #1890ff;
  color: white;
}
.actions .danger {
  background: #ff4d4f;
  color: white;
}
.modified-marker {
  color: #fa8c16;
  font-weight: 500;
  margin-left: auto;
}
</style>
