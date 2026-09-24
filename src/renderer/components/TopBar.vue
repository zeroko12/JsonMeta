<script setup lang="ts">
/**
 * TopBar — 顶栏:文件路径 + 改动计数 + 保存/放弃 + 备份
 *
 * 固定在顶部,任何时候可见。改动计数实时更新。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'

const configStore = useConfigStore()
const uiStore = useUiStore()

const fileName = computed(() => {
  if (!configStore.filePath) return ''
  return configStore.filePath.split(/[\\/]/).pop() ?? ''
})

function handleKey(e: KeyboardEvent) {
  // Ctrl+S / Cmd+S → 保存
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (configStore.isDirty && !uiStore.showChangeListDialog) {
      uiStore.showChangeListDialog = true
    }
  }
}

function onSave() {
  if (!configStore.isDirty) return
  uiStore.showChangeListDialog = true
}

function onDiscard() {
  if (confirm('放弃所有未保存的修改?')) {
    configStore.discardChanges()
  }
}

function onBackup() {
  uiStore.showBackupDialog = true
}

function onSchemaEditor() {
  window.dispatchEvent(new CustomEvent('app:toggle-schema-editor'))
}

onMounted(() => {
  document.addEventListener('keydown', handleKey)
  configStore.detectMainProgram()
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <header class="topbar" :class="{ warn: configStore.mainProgramRunning }">
    <div class="left">
      <strong>{{ fileName || '未加载文件' }}</strong>
      <code v-if="configStore.filePath" class="path">{{ configStore.filePath }}</code>
      <span v-if="configStore.isDirty" class="dirty-marker" title="有未保存修改">
        ● {{ configStore.changes.size }} 处变更
      </span>
      <span
        v-if="configStore.externalChangePending"
        class="external-marker"
        title="磁盘文件已被外部修改"
      >
        ⚠ 外部修改
      </span>
      <span v-if="configStore.mainProgramRunning" class="main-running-marker">⚠ 主程序运行中</span>
    </div>
    <div class="right">
      <button title="查看/恢复备份" @click="onBackup">📦 备份</button>
      <button title="编辑 schema 字段说明" @click="onSchemaEditor">📖 字段说明</button>
      <button
        :disabled="!configStore.isDirty"
        class="discard"
        title="放弃所有未保存修改"
        @click="onDiscard"
      >
        放弃
      </button>
      <button
        :disabled="!configStore.isDirty"
        class="primary"
        title="保存 (Ctrl+S)"
        @click="onSave"
      >
        💾 保存
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #001529;
  color: white;
  height: 48px;
  box-sizing: border-box;
  flex-shrink: 0;
}
.topbar.warn {
  background: #a8071a;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}
.left strong {
  font-size: 14px;
  flex-shrink: 0;
}
.path {
  color: #888;
  font-size: 11px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dirty-marker {
  color: #faad14;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.external-marker,
.main-running-marker {
  color: #ffccc7;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.right button {
  padding: 6px 14px;
  border: 1px solid #434343;
  background: transparent;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.right button:hover:not(:disabled) {
  background: #1890ff;
  border-color: #1890ff;
}
.right button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.right .primary {
  background: #1890ff;
  border-color: #1890ff;
}
.right .discard {
  border-color: #ff7878;
  color: #ffccc7;
}
.right .discard:hover:not(:disabled) {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}
</style>
