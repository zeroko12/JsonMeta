<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import type { JsonValue } from '@shared/utils/json-path'

const doc = useJsonDocStore()

const modalState = computed(() => doc.showRawEditModal)
const rawText = ref('')
const errorMsg = ref<string | null>(null)

watch(
  () => doc.showRawEditModal,
  (val) => {
    if (val) {
      rawText.value = val.jsonText
      errorMsg.value = null
    }
  },
)

function closeModal() {
  doc.showRawEditModal = null
}

function formatJson() {
  try {
    const obj = JSON.parse(rawText.value)
    rawText.value = JSON.stringify(obj, null, 2)
    errorMsg.value = null
  } catch (err) {
    errorMsg.value = `格式化失败: ${(err as Error).message}`
  }
}

function confirmSave() {
  if (!modalState.value) return
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText.value)
  } catch (err) {
    errorMsg.value = `JSON 语法错误 (无法解析): ${(err as Error).message}`
    return
  }

  try {
    doc.setNodeValue(
      modalState.value.path,
      parsed as JsonValue,
      `编辑 Raw JSON: ${modalState.value.path}`,
    )
    closeModal()
  } catch (err) {
    errorMsg.value = `保存应用失败: ${(err as Error).message}`
  }
}
</script>

<template>
  <div v-if="modalState" class="modal-backdrop" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <h3>{ } {{ modalState.title }}</h3>
        <div class="header-right">
          <button class="small-tool-btn" title="格式化为规范 2 空格缩进" @click="formatJson">
            美化格式
          </button>
          <button class="close-btn" @click="closeModal">✕</button>
        </div>
      </header>

      <div class="modal-body">
        <textarea
          v-model="rawText"
          class="raw-textarea"
          spellcheck="false"
          placeholder="请输入合法的 JSON..."
          autofocus
        />
        <div v-if="errorMsg" class="error-alert">
          {{ errorMsg }}
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn secondary" @click="closeModal">取消</button>
        <button class="btn primary" @click="confirmSave">确认应用</button>
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
  width: 600px;
  max-width: 90vw;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-main);
}

.modal-header {
  padding: 12px 18px;
  background: var(--bg-drawer-header);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h3 {
  margin: 0;
  font-size: 14px;
  color: var(--text-main);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.small-tool-btn {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.small-tool-btn:hover {
  background: var(--bg-btn-hover);
}
.close-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
}
.close-btn:hover {
  color: var(--text-main);
}

.modal-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.raw-textarea {
  width: 100%;
  height: 280px;
  box-sizing: border-box;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 6px;
  padding: 12px;
  color: var(--text-code);
  font-family: 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
}
.raw-textarea:focus {
  border-color: var(--border-focus);
}

.error-alert {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
}

.modal-footer {
  padding: 12px 18px;
  background: var(--bg-drawer-header);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  padding: 6px 14px;
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
