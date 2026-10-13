<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import type { JsonValue } from '@shared/utils/json-path'

const doc = useJsonDocStore()

const modalState = computed(() => doc.showAddNodeModal)
const parentPath = computed(() => modalState.value?.parentPath ?? '')
const isArrayParent = computed(() => modalState.value?.isArray ?? false)

const keyName = ref('')
const selectedType = ref<'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'>('string')
const stringVal = ref('')
const numberVal = ref(0)
const boolVal = ref(false)

watch(
  () => doc.showAddNodeModal,
  (val) => {
    if (val) {
      keyName.value = ''
      selectedType.value = 'string'
      stringVal.value = ''
      numberVal.value = 0
      boolVal.value = false
    }
  },
)

function closeModal() {
  doc.showAddNodeModal = null
}

function confirmAdd() {
  if (!modalState.value) return
  if (!isArrayParent.value && !keyName.value.trim()) {
    alert('请输入属性名称')
    return
  }

  let finalVal: JsonValue = ''
  if (selectedType.value === 'string') finalVal = stringVal.value
  else if (selectedType.value === 'number') finalVal = numberVal.value
  else if (selectedType.value === 'boolean') finalVal = boolVal.value
  else if (selectedType.value === 'null') finalVal = null
  else if (selectedType.value === 'array') finalVal = []
  else if (selectedType.value === 'object') finalVal = {}

  doc.addChildNode(parentPath.value, keyName.value.trim(), finalVal)
  closeModal()
}
</script>

<template>
  <div v-if="modalState" class="modal-backdrop" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <h3>+ {{ isArrayParent ? '插入数组元素' : '添加对象属性' }}</h3>
        <p class="subtitle">
          目标父节点:
          <code>{{ parentPath || '根对象 (root)' }}</code>
        </p>
      </header>

      <div class="modal-body">
        <!-- 键名输入 (对象专属) -->
        <div v-if="!isArrayParent" class="form-item">
          <label class="form-label">属性名称 (Key):</label>
          <input
            v-model="keyName"
            type="text"
            class="form-input"
            placeholder="例如: serverHost, port, isEnabled..."
            autofocus
            @keydown.enter="confirmAdd"
          />
        </div>

        <!-- 初始数据类型 -->
        <div class="form-item">
          <label class="form-label">数据类型:</label>
          <div class="type-selector">
            <button
              type="button"
              :class="{ active: selectedType === 'string' }"
              @click="selectedType = 'string'"
            >
              String (文本)
            </button>
            <button
              type="button"
              :class="{ active: selectedType === 'number' }"
              @click="selectedType = 'number'"
            >
              Number (数字)
            </button>
            <button
              type="button"
              :class="{ active: selectedType === 'boolean' }"
              @click="selectedType = 'boolean'"
            >
              Boolean (布尔)
            </button>
            <button
              type="button"
              :class="{ active: selectedType === 'array' }"
              @click="selectedType = 'array'"
            >
              Array (空数组)
            </button>
            <button
              type="button"
              :class="{ active: selectedType === 'object' }"
              @click="selectedType = 'object'"
            >
              Object (空对象)
            </button>
            <button
              type="button"
              :class="{ active: selectedType === 'null' }"
              @click="selectedType = 'null'"
            >
              Null
            </button>
          </div>
        </div>

        <!-- 初始值输入 -->
        <div v-if="selectedType === 'string'" class="form-item">
          <label class="form-label">初始文本值:</label>
          <input v-model="stringVal" type="text" class="form-input" placeholder="输入初始文本..." />
        </div>
        <div v-else-if="selectedType === 'number'" class="form-item">
          <label class="form-label">初始数值:</label>
          <input v-model.number="numberVal" type="number" class="form-input" />
        </div>
        <div v-else-if="selectedType === 'boolean'" class="form-item">
          <label class="form-label">初始布尔值:</label>
          <label class="radio-label">
            <input v-model="boolVal" type="radio" :value="true" />
            true
          </label>
          <label class="radio-label">
            <input v-model="boolVal" type="radio" :value="false" />
            false
          </label>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn secondary" @click="closeModal">取消</button>
        <button class="btn primary" @click="confirmAdd">确定添加</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-modal-backdrop);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.modal-card {
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 440px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-main);
}

.modal-header {
  padding: 16px 20px;
  background: var(--bg-drawer-header);
  border-bottom: 1px solid var(--border-color);
}
.modal-header h3 {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--text-main);
}
.subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.subtitle code {
  color: var(--text-code);
  font-family: monospace;
}

.modal-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.form-input {
  padding: 8px 10px;
  border: 1px solid var(--border-input);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  background: var(--bg-input);
  color: var(--text-main);
}
.form-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.type-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.type-selector button {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  padding: 6px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  color: var(--text-main);
  font-weight: 500;
  transition: all 0.1s;
}
.type-selector button:hover {
  background: var(--bg-btn-hover);
}
.type-selector button.active {
  background: #2563eb;
  color: white;
  border-color: #1d4ed8;
}

.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  margin-right: 12px;
  cursor: pointer;
  color: var(--text-main);
}

.modal-footer {
  padding: 12px 20px;
  background: var(--bg-drawer-header);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn.secondary {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}
.btn.secondary:hover {
  background: var(--bg-btn-hover);
}
.btn.primary {
  background: #2563eb;
  border: 1px solid #1d4ed8;
  color: white;
}
.btn.primary:hover {
  background: #1d4ed8;
}
</style>
