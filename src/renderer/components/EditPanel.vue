<script setup lang="ts">
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

function onInputChange(newValue: unknown) {
  if (!configStore.current) return
  configStore.current = set(
    configStore.current as JsonValue,
    uiStore.selectedPath,
    newValue as JsonValue,
  )
}

function onDelete() {
  if (!configStore.current) return
  uiStore.showDeleteDialog = true
}

function onAddField() {
  // Walk through schema for siblings
  const segments = uiStore.selectedPath.split('.')
  const parentPath = segments.slice(0, -1).join('.')
  const parentField = schemaStore.getField(parentPath)
  if (!parentField?._fields) return
  // Pick first schema field that doesn't exist in current value
  const parentValue = get(configStore.current, parentPath) as Record<string, unknown> | null
  const existingKeys = new Set(parentValue ? Object.keys(parentValue) : [])
  const available = Object.keys(parentField._fields).filter((k) => !existingKeys.has(k))
  if (available.length === 0) return
  // Auto-pick first
  const newKey = available[0]!
  const newField = parentField._fields[newKey]!
  const defaultValue = defaultValueForField(newField)
  const newParentValue = { ...(parentValue ?? {}), [newKey]: defaultValue }
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
</script>

<template>
  <div class="edit-panel">
    <div v-if="!field" class="empty">
      <p>选中左侧字段查看详情</p>
    </div>
    <div v-else class="content">
      <header>
        <h2>{{ uiStore.selectedPath.split('.').pop() }}</h2>
        <code class="path">{{ uiStore.selectedPath }}</code>
      </header>

      <section v-if="field._desc || field._instanceDesc" class="desc">
        <p>
          <strong>说明:</strong>
          {{ field._instanceDesc || field._desc }}
        </p>
      </section>

      <section class="type-info">
        <span class="badge">类型: {{ field._type }}</span>
        <span v-if="field._required" class="badge required">必填</span>
        <span v-if="field._readOnly" class="badge readonly">只读</span>
        <span v-if="field._useTemplate" class="badge template">
          使用模板: {{ field._useTemplate }}
        </span>
      </section>

      <section class="value-editor">
        <label v-if="field._type === 'bool'">
          <input
            type="checkbox"
            :checked="value === true"
            :disabled="field._readOnly === true"
            @change="(e) => onInputChange((e.target as HTMLInputElement).checked)"
          />
          {{ value === true ? 'true' : 'false' }}
        </label>
        <input
          v-else-if="field._type === 'string'"
          type="text"
          :value="(value as string) ?? ''"
          :disabled="field._readOnly === true"
          @input="(e) => onInputChange((e.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="field._type === 'int'"
          type="number"
          step="1"
          :value="(value as number) ?? 0"
          :disabled="field._readOnly === true"
          @input="(e) => onInputChange(Number.parseInt((e.target as HTMLInputElement).value, 10))"
        />
        <input
          v-else-if="field._type === 'double'"
          type="number"
          step="any"
          :value="(value as number) ?? 0"
          :disabled="field._readOnly === true"
          @input="(e) => onInputChange(Number.parseFloat((e.target as HTMLInputElement).value))"
        />
        <textarea
          v-else-if="field._type === 'object' || field._type === 'array'"
          readonly
          :value="JSON.stringify(value, null, 2)"
          rows="6"
        />
        <p v-else class="unknown">未知类型 {{ field._type }} — 直接编辑 JSON</p>
      </section>

      <section v-if="field._min !== undefined || field._max !== undefined" class="range-info">
        <span v-if="field._min !== undefined">最小值: {{ field._min }}</span>
        <span v-if="field._max !== undefined">最大值: {{ field._max }}</span>
      </section>

      <section v-if="validation.length > 0" class="warnings">
        <p v-for="v in validation" :key="v.path" :class="v.type">⚠ {{ v.message }}</p>
      </section>

      <footer class="actions">
        <button v-if="!field._readOnly" class="danger" @click="onDelete">删除字段</button>
        <button class="primary" @click="onAddField">新增字段</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.edit-panel {
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
header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
header h2 {
  margin: 0;
}
.path {
  color: #666;
  font-size: 12px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}
.desc {
  background: #f0f9ff;
  border-left: 3px solid #1890ff;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 4px;
}
.type-info {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.badge {
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.badge.required {
  background: #fff1f0;
  color: #cf1322;
}
.badge.readonly {
  background: #fafafa;
  color: #8c8c8c;
}
.badge.template {
  background: #f6ffed;
  color: #389e0d;
}
.value-editor {
  margin-bottom: 12px;
}
.value-editor input[type='text'],
.value-editor input[type='number'],
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
.range-info {
  color: #666;
  font-size: 12px;
  margin-bottom: 12px;
}
.range-info span {
  margin-right: 16px;
}
.warnings {
  margin-bottom: 12px;
}
.warnings p {
  margin: 4px 0;
  padding: 6px 10px;
  border-radius: 4px;
  background: #fffbe6;
  border-left: 3px solid #faad14;
  color: #d48806;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.actions button {
  padding: 8px 16px;
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
.unknown {
  color: #999;
  font-style: italic;
}
</style>
