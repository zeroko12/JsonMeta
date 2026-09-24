<script setup lang="ts">
/**
 * FieldRow — 渲染单层字段,无递归
 * 嵌套子字段由 FlatFieldList 递归平铺处理。
 */
import { computed, ref } from 'vue'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'
import { useAnnotationsStore } from '../stores/annotations'
import { get, set } from '@shared/utils/json-path'
import type { JsonValue } from '@shared/utils/json-path'

const props = defineProps<{
  fieldName: string
  fieldPath: string
  fieldType: 'bool' | 'int' | 'double' | 'string' | 'enum' | 'array' | 'object'
  description?: string
  enumValues?: JsonValue[]
  enumStrValues?: string[]
  isReadOnly: boolean
  isModified: boolean
  depth: number
  hasChildren?: boolean
}>()

const configStore = useConfigStore()
const uiStore = useUiStore()
const annotations = useAnnotationsStore()

const isSelected = computed(() => uiStore.selectedPath === props.fieldPath)
const userDesc = computed(() => annotations.getDescription(props.fieldPath))

const showDescEditor = ref(false)
const descDraft = ref('')
const expanded = ref(false)

function toggleExpand() {
  expanded.value = !expanded.value
  uiStore.selectedPath = props.fieldPath
}
function toggleSelect() {
  uiStore.selectedPath = props.fieldPath
}

function pushChange(newValue: unknown) {
  const old = currentValue()
  if (old !== newValue) {
    annotations.pushHistory({
      path: props.fieldPath,
      oldValue: old,
      newValue,
      type: 'modify',
    })
  }
}

function currentValue(): unknown {
  return get(configStore.current as JsonValue, props.fieldPath)
}

function setBool(v: boolean) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.fieldPath, v as JsonValue)
}
function setString(v: string) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.fieldPath, v as JsonValue)
}
function setInt(v: number) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.fieldPath, v as JsonValue)
}
function setDouble(v: number) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.fieldPath, v as JsonValue)
}
function setEnum(v: string) {
  pushChange(v)
  configStore.current = set(configStore.current as JsonValue, props.fieldPath, v as JsonValue)
}

function openDescEditor(e: Event) {
  e.stopPropagation()
  descDraft.value = userDesc.value ?? props.description ?? ''
  showDescEditor.value = true
}
function saveDesc() {
  annotations.setDescription(props.fieldPath, descDraft.value)
  showDescEditor.value = false
}
function cancelDesc() {
  showDescEditor.value = false
}
</script>

<template>
  <div
    class="field-row"
    :class="{ modified: isModified, selected: isSelected }"
    :data-path="fieldPath"
    :style="{ paddingLeft: `${depth * 20}px` }"
  >
    <div class="row-line">
      <div class="field-label" @click="toggleSelect">
        <div class="name-row">
          <button v-if="hasChildren" class="caret" @click.stop="toggleExpand">
            {{ expanded ? '▼' : '▶' }}
          </button>
          <span v-else class="caret-spacer"></span>
          <code class="name">{{ fieldName }}</code>
          <small class="type">· {{ fieldType }}</small>
          <span v-if="isModified" class="modified-dot" title="已修改">●</span>
          <button class="desc-btn" title="编辑描述" @click="openDescEditor">📝</button>
        </div>
        <div class="desc-stack">
          <span v-if="props.description && !userDesc" class="desc">{{ props.description }}</span>
          <span v-if="userDesc" class="desc user-desc">📝 {{ userDesc }}</span>
          <span v-if="!props.description && !userDesc" class="desc empty">无描述 — 点 📝 添加</span>
        </div>
      </div>
      <div class="field-input" @click="toggleSelect">
        <div v-if="showDescEditor" class="desc-editor" @click.stop>
          <textarea v-model="descDraft" rows="3" placeholder="输入描述..."></textarea>
          <div class="desc-editor-actions">
            <button @click.stop="saveDesc">保存</button>
            <button @click.stop="cancelDesc">取消</button>
          </div>
        </div>

        <label v-if="fieldType === 'bool'" class="checkbox-row">
          <input
            type="checkbox"
            :checked="currentValue() === true"
            :disabled="isReadOnly"
            @change="(e) => setBool((e.target as HTMLInputElement).checked)"
            @click.stop
          />
          <span :class="{ off: currentValue() !== true }">
            {{ currentValue() === true ? 'true' : 'false' }}
          </span>
        </label>

        <input
          v-else-if="fieldType === 'string'"
          type="text"
          :value="(currentValue() as string) ?? ''"
          :disabled="isReadOnly"
          @input="(e) => setString((e.target as HTMLInputElement).value)"
          @click.stop
        />

        <input
          v-else-if="fieldType === 'int'"
          type="number"
          step="1"
          :value="(currentValue() as number) ?? 0"
          :disabled="isReadOnly"
          @input="(e) => setInt(Number.parseInt((e.target as HTMLInputElement).value, 10))"
          @click.stop
        />

        <input
          v-else-if="fieldType === 'double'"
          type="number"
          step="any"
          :value="(currentValue() as number) ?? 0"
          :disabled="isReadOnly"
          @input="(e) => setDouble(Number.parseFloat((e.target as HTMLInputElement).value))"
          @click.stop
        />

        <select
          v-else-if="fieldType === 'enum'"
          :value="String(currentValue() ?? '')"
          :disabled="isReadOnly"
          @change="(e) => setEnum((e.target as HTMLSelectElement).value)"
          @click.stop
        >
          <option v-for="opt in enumStrValues ?? []" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-row {
  border-bottom: 1px solid #f5f5f5;
  position: relative;
}
.field-row:hover {
  background: #fafbfc;
}
.field-row.selected {
  background: #e6f7ff;
}
.field-row.modified {
  background: #fff7e6;
}
.field-row.modified.selected {
  background: #ffd591;
}
.row-line {
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  gap: 16px;
  padding: 6px 14px;
  align-items: start;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  padding-top: 4px;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.caret {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 10px;
  color: #999;
  padding: 0;
  width: 12px;
}
.caret-spacer {
  display: inline-block;
  width: 12px;
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
.field-row.modified .field-label .name {
  color: #d46b08;
}
.modified-dot {
  color: #fa8c16;
  font-size: 14px;
}
.desc-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  color: #999;
}
.desc-btn:hover {
  color: #1890ff;
}
.desc-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}
.desc-stack .desc {
  font-size: 11px;
  color: #555;
  line-height: 1.4;
}
.desc-stack .desc.user-desc {
  color: #2c5282;
  background: #ebf8ff;
  padding: 2px 6px;
  border-radius: 3px;
  border-left: 2px solid #3182ce;
}
.desc-stack .desc.empty {
  color: #aaa;
  font-style: italic;
}
.field-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
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
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.desc-editor {
  background: white;
  border: 1px solid #1890ff;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.desc-editor textarea {
  width: 100%;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  padding: 6px 8px;
  font-family: inherit;
  font-size: 12px;
  resize: vertical;
}
.desc-editor-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.desc-editor-actions button {
  padding: 3px 10px;
  border: 1px solid #d9d9d9;
  background: white;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}
.desc-editor-actions button:first-child {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}
</style>
