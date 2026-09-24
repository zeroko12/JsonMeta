<script setup lang="ts">
/**
 * FieldRow — 单个字段行,支持递归嵌套子字段
 *
 * - 顶层 group 里 FieldRow 在 depth 0
 * - FieldRow 的 .children 数组再渲染一组 FieldRow(depth + 1)
 * - 选中 emit('select'),输入变化通过 emit 回调
 */
import { computed, ref } from 'vue'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'
import { useAnnotationsStore } from '../stores/annotations'
import { get, set } from '@shared/utils/json-path'
import type { JsonValue } from '@shared/utils/json-path'

const props = defineProps<{
  field: {
    fieldName: string
    fieldPath: string
    fieldType: 'bool' | 'int' | 'double' | 'string' | 'enum' | 'array' | 'object'
    description?: string
    enumValues?: JsonValue[]
    enumStrValues?: string[]
    isReadOnly: boolean
    isModified: boolean
    existsInData: boolean
    children?: typeof props extends { field: infer F } ? F[] : never
  }
  depth: number
}>()

const emit = defineEmits<{
  select: []
}>()

const configStore = useConfigStore()
const uiStore = useUiStore()
const annotations = useAnnotationsStore()

const isSelected = computed(() => uiStore.selectedPath === props.field.fieldPath)

// 描述:schema 的 _desc + 用户运行时写的 _userDesc(annotations.json)
const userDesc = computed(() => annotations.getDescription(props.field.fieldPath))
const showDescEditor = ref(false)
const descDraft = ref('')

function openDescEditor() {
  descDraft.value = userDesc.value ?? props.field.description ?? ''
  showDescEditor.value = true
}
function saveDesc() {
  annotations.setDescription(props.field.fieldPath, descDraft.value)
  showDescEditor.value = false
}
function cancelDesc() {
  showDescEditor.value = false
}

// 折叠/展开 object/array 子字段
const expanded = ref(false)
// 有子字段时自动展开
if (props.field.children && props.field.children.length > 0) {
  expanded.value = true
}

function onClick() {
  uiStore.selectedPath = props.field.fieldPath
  emit('select')
}

function currentValue(): unknown {
  return get(configStore.current as JsonValue, props.field.fieldPath)
}

function setBool(v: boolean) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setString(v: string) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setInt(v: number) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setDouble(v: number) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
function setEnum(v: string) {
  configStore.current = set(configStore.current as JsonValue, props.field.fieldPath, v as JsonValue)
}
</script>

<template>
  <div
    class="field-row"
    :class="{ modified: field.isModified, selected: isSelected }"
    :data-path="field.fieldPath"
  >
    <div class="row-line" :style="{ paddingLeft: `${depth * 20}px` }">
      <div class="field-label" @click.stop="onClick">
        <div class="name-row">
          <code class="name">{{ field.fieldName }}</code>
          <small class="type">· {{ field.fieldType }}</small>
          <span v-if="field.isModified" class="modified-dot" title="已修改">●</span>
          <button class="desc-btn" title="编辑描述" @click.stop="openDescEditor">📝</button>
        </div>
        <div class="desc-stack">
          <span v-if="field.description && !userDesc" class="desc">{{ field.description }}</span>
          <span v-if="userDesc" class="desc user-desc" :title="'用户描述: ' + userDesc">
            📝 {{ userDesc }}
          </span>
          <span v-if="!field.description && !userDesc" class="desc empty">无描述 — 点 📝 添加</span>
        </div>
      </div>
      <div class="field-input" @click.stop="onClick">
        <div v-if="showDescEditor" class="desc-editor" @click.stop>
          <textarea v-model="descDraft" rows="3" placeholder="输入描述..."></textarea>
          <div class="desc-editor-actions">
            <button @click="saveDesc">保存</button>
            <button @click="cancelDesc">取消</button>
          </div>
        </div>
        <!-- bool -->
        <label v-if="field.fieldType === 'bool'" class="checkbox-row">
          <input
            type="checkbox"
            :checked="currentValue() === true"
            :disabled="field.isReadOnly"
            @change="(e) => setBool((e.target as HTMLInputElement).checked)"
          />
          <span :class="{ off: currentValue() !== true }">
            {{ currentValue() === true ? 'true' : 'false' }}
          </span>
        </label>

        <!-- string -->
        <input
          v-else-if="field.fieldType === 'string'"
          type="text"
          :value="(currentValue() as string) ?? ''"
          :disabled="field.isReadOnly"
          @input="(e) => setString((e.target as HTMLInputElement).value)"
        />

        <!-- int -->
        <input
          v-else-if="field.fieldType === 'int'"
          type="number"
          step="1"
          :value="(currentValue() as number) ?? 0"
          :disabled="field.isReadOnly"
          @input="(e) => setInt(Number.parseInt((e.target as HTMLInputElement).value, 10))"
        />

        <!-- double -->
        <input
          v-else-if="field.fieldType === 'double'"
          type="number"
          step="any"
          :value="(currentValue() as number) ?? 0"
          :disabled="field.isReadOnly"
          @input="(e) => setDouble(Number.parseFloat((e.target as HTMLInputElement).value))"
        />

        <!-- enum -->
        <select
          v-else-if="field.fieldType === 'enum'"
          :value="String(currentValue() ?? '')"
          :disabled="field.isReadOnly"
          @change="(e) => setEnum((e.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in field.enumStrValues ?? []" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </div>
    </div>
    <!-- 对象 / 数组:可展开看子字段(任意嵌套深度) -->
    <div v-if="field.fieldType === 'object' || field.fieldType === 'array'" class="nested-actions">
      <button class="expand-btn" :class="{ open: expanded }" @click="expanded = !expanded">
        {{ field.fieldType === 'object' ? '{}' : '[]' }}
        {{ expanded ? '收起子字段' : '展开子字段' }}
        <span v-if="field.children?.length" class="count">{{ field.children.length }} 字段</span>
      </button>
      <FieldRow
        v-for="c in field.children ?? []"
        v-if="expanded"
        :key="c.fieldPath"
        :field="c"
        :depth="depth + 1"
        @select="onClick"
      />
    </div>
  </div>
</template>

<style scoped>
.field-row {
  border-bottom: 1px solid #f5f5f5;
}
.field-row:last-child {
  border-bottom: none;
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
  padding: 8px 14px;
  align-items: center;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 4px;
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
.field-label .desc {
  font-size: 11px;
  color: #555;
  line-height: 1.4;
}
.field-input {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
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
.desc-editor {
  background: white;
  border: 1px solid #1890ff;
  border-radius: 4px;
  padding: 8px;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
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
.checked-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nested-actions {
  padding: 4px 0 8px 0;
  background: #fafbfc;
  border-top: 1px solid #f0f0f0;
}
.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin: 4px 0 4px 0;
  border: 1px dashed #d9d9d9;
  background: white;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: #666;
  font-family: 'Consolas', monospace;
}
.expand-btn:hover {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}
.expand-btn.open {
  border-style: solid;
  border-color: #1890ff;
  color: #1890ff;
  background: #e6f7ff;
}
.expand-btn .count {
  color: #999;
  font-size: 10px;
}
.unknown {
  color: #999;
  font-style: italic;
  font-size: 11px;
}
</style>
