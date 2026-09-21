<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'

const configStore = useConfigStore()
const uiStore = useUiStore()

const fileName = computed(() => {
  if (!configStore.filePath) return ''
  return configStore.filePath.split(/[\\/]/).pop()
})

async function onSave() {
  if (!configStore.isDirty) return
  if (configStore.mainProgramRunning) {
    const ok = confirm('检测到主程序正在运行,保存的修改需要重启主程序才生效。继续保存吗?')
    if (!ok) return
  }
  uiStore.showChangeListDialog = true
}

function onOpenAnother() {
  configStore.filePath = null
  // App-level routing will switch back to FilePicker
  window.dispatchEvent(new CustomEvent('app:open-another'))
}

onMounted(() => {
  configStore.detectMainProgram()
})
</script>

<template>
  <header class="topbar" :class="{ warn: configStore.mainProgramRunning }">
    <div class="left">
      <strong>{{ fileName }}</strong>
      <span v-if="configStore.isDirty" class="dirty-marker" title="有未保存修改">●</span>
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
      <button @click="onOpenAnother">打开其他</button>
      <button @click="uiStore.showBackupDialog = true">备份</button>
      <button :disabled="!configStore.isDirty" @click="onSave">💾 保存</button>
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
}
.topbar.warn {
  background: #a8071a;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dirty-marker {
  color: #faad14;
  font-size: 18px;
}
.external-marker {
  color: #fa8c16;
  font-weight: 500;
}
.main-running-marker {
  color: #ffccc7;
  font-weight: 500;
}
.right button {
  margin-left: 8px;
  padding: 4px 12px;
  background: transparent;
  color: white;
  border: 1px solid #434343;
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
</style>
