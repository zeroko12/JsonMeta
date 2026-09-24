<script setup lang="ts">
/**
 * FocusedEditPanel — 选中字段后的右侧焦点编辑面板
 *
 * 大描述 + 大输入控件 + 范围提示 + 校验 + 删除/还原。
 */
import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
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
const existsInData = computed(() => value.value !== undefined)

function onBoolChange(e: Event) {
  if (!configStore.current) return
  const checked = (e.target as HTMLInputElement).checked
  configStore.current = set(
    configStore.current as JsonValue,
    uiStore.selectedPath,
    checked as JsonValue,
  )
}
function onTextChange(e: Event) {
  if (!configStore.current) return
  const v = (e.target as HTMLInputElement).value
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}
function onIntChange(e: Event) {
  if (!configStore.current) return
  const v = Number.parseInt((e.target as HTMLInputElement).value, 10)
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}
function onDoubleChange(e: Event) {
  if (!configStore.current) return
  const v = Number.parseFloat((e.target as HTMLInputElement).value)
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}
function onEnumChange(e: Event) {
  if (!configStore.current) return
  const v = (e.target as HTMLSelectElement).value
  configStore.current = set(configStore.current as JsonValue, uiStore.selectedPath, v as JsonValue)
}

function onDelete() {
  if (!configStore.current) return
  const next = remove(configStore.current as JsonValue, uiStore.selectedPath)
  configStore.current = next
}

function onRestore() {
  if (!configStore.current || !field.value) return
  // Reset to schema default-ish value
  if (field.value._type === 'bool') {
    configStore.current = set(
      configStore.current as JsonValue,
      uiStore.selectedPath,
      false as JsonValue,
    )
  } else if (field.value._type === 'string') {
    configStore.current = set(
      configStore.current as JsonValue,
      uiStore.selectedPath,
      '' as JsonValue,
    )
  } else if (field.value._type === 'int' || field.value._type === 'double') {
    configStore.current = set(
      configStore.current as JsonValue,
      uiStore.selectedPath,
      0 as JsonValue,
    )
  } else if (field.value._type === 'array') {
    configStore.current = set(
      configStore.current as JsonValue,
      uiStore.selectedPath,
      [] as unknown as JsonValue,
    )
  }
}
</script>

<template>
  <div class="focused-edit">
    <div v-if="!field || !uiStore.selectedPath" class="empty">
      <p>从左侧选中字段查看详情</p>
    </div>
    <div v-else class="content">
      <header class="field-header">
        <div class="path-line">
          <code class="path">{{ uiStore.selectedPath }}</code>
          <span v-if="isModified" class="modified">● 已修改</span>
        </div>
        <h2>{{ field._type }} 字段</h2>
        <p v-if="field._desc" class="desc-main">{{ field._desc }}</p>
        <p v-if="!existsInData" class="missing-note">
          ⚠ 当前 JSON 文件中未设置此字段,改动会写入(如果字段可空)。
        </p>
      </header>

      <section class="value-editor">
        <template v-if="field._type === 'bool'">
          <label class="big-checkbox">
            <input
              type="checkbox"
              :checked="value === true"
              :disabled="field._readOnly === true"
              @change="onBoolChange"
            />
            <span :class="{ off: value !== true }">
              {{ value === true ? 'true' : 'false' }}
            </span>
          </label>
        </template>

        <input
          v-else-if="field._type === 'string'"
          type="text"
          class="big-input"
          :value="(value as string) ?? ''"
          :disabled="field._readOnly === true"
          @input="onTextChange"
        />

        <input
          v-else-if="field._type === 'int'"
          type="number"
          step="1"
          class="big-input"
          :value="(value as number) ?? 0"
          :disabled="field._readOnly === true"
          @input="onIntChange"
        />

        <input
          v-else-if="field._type === 'double'"
          type="number"
          step="any"
          class="big-input"
          :value="(value as number) ?? 0"
          :disabled="field._readOnly === true"
          @input="onDoubleChange"
        />

        <select
          v-else-if="field._type === 'enum'"
          class="big-input"
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
          rows="8"
          class="big-input mono"
        />
        <p v-else class="unknown">未知类型 {{ field._type }} — 直接编辑 JSON</p>
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
        <button class="primary" @click="onRestore">↻ 还原</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.focused-edit {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 20px 24px;
  background: #fafbfc;
}
.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}
.field-header {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e8e8e8;
}
.field-header .path-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.field-header .path {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: #888;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 3px;
}
.field-header .modified {
  color: #fa8c16;
  font-weight: 500;
  font-size: 12px;
}
.field-header h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: #2c3e50;
  font-weight: 600;
}
.field-header .desc-main {
  margin: 0;
  padding: 8px 12px;
  background: #f0f9ff;
  border-left: 3px solid #1890ff;
  border-radius: 4px;
  color: #444;
  font-size: 13px;
  line-height: 1.6;
}
.field-header .missing-note {
  margin: 8px 0 0;
  padding: 8px 12px;
  background: #fff1f0;
  border-left: 3px solid #ff4d4f;
  border-radius: 4px;
  color: #874d00;
  font-size: 12px;
}
.value-editor {
  margin-bottom: 16px;
}
.big-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  background: white;
}
.big-input:focus {
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}
.big-input:disabled {
  background: #f5f5f5;
  color: #999;
}
.big-input.mono {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  resize: vertical;
}
.big-checkbox {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}
.big-checkbox input {
  width: 20px;
  height: 20px;
  cursor: pointer;
}
.big-checkbox .off {
  color: #aaa;
}
.range {
  color: #666;
  font-size: 12px;
  margin-bottom: 12px;
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: white;
  border-radius: 4px;
}
.warnings {
  margin-bottom: 16px;
}
.warnings p {
  margin: 4px 0;
  padding: 8px 12px;
  border-radius: 4px;
  background: #fffbe6;
  border-left: 3px solid #faad14;
  color: #d48806;
  font-size: 12px;
}
.unknown {
  color: #999;
  font-style: italic;
}
.actions {
  display: flex;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid #e8e8e8;
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
</style>
