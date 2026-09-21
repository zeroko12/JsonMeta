<script setup lang="ts">
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()

function reload() {
  configStore.reloadFromDisk()
  configStore.externalChangePending = false
}

function keepMine() {
  // Continue editing; we'll overwrite on save
  configStore.externalChangePending = false
}
</script>

<template>
  <div v-if="configStore.externalChangePending" class="backdrop">
    <div class="dialog">
      <header>
        <h2>⚠ 磁盘文件已被外部修改</h2>
        <p>
          检测到磁盘上的 SystemConfig.json 在外部被修改(其他工具或主程序自动写入)。
          你的内存修改可能与磁盘状态冲突。
        </p>
      </header>
      <footer class="actions">
        <button @click="keepMine">继续编辑(下次保存会覆盖)</button>
        <button class="primary" @click="reload">从磁盘重新加载(放弃本地修改)</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
}
.dialog {
  background: white;
  border-radius: 8px;
  width: 480px;
  overflow: hidden;
}
header {
  padding: 20px 24px;
  border-bottom: 1px solid #f0f0f0;
}
header h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
header p {
  margin: 0;
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
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
</style>
