<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'

const configStore = useConfigStore()
const schemaStore = useSchemaStore()

const emit = defineEmits<{ loaded: [] }>()

onMounted(async () => {
  // Auto-load bundled schema via main-process IPC (works in dev + packaged)
  try {
    await schemaStore.loadDefault()
  } catch (err) {
    console.warn('schema.json not loaded yet:', err)
  }
})

async function pickAndOpen() {
  await configStore.pickAndLoad()
  if (configStore.filePath) {
    // 记下目录(下次启动自动打开)
    const dir = configStore.filePath.replace(/[\/][^\/]+$/, '')
    localStorage.setItem('lastConfigDir', dir)
    emit('loaded')
  }
}
</script>

<template>
  <div class="picker-view">
    <h2>选择 SystemConfig.json 所在目录</h2>
    <p class="hint">
      系统配置通常位于
      <code>&lt;DataRoot&gt;/Config/SystemConfig.json</code>
      。 你可以选择
      <strong>DataRoot</strong>
      (如
      <code>D:/IonImplantationSystemData</code>
      ) 或直接选
      <strong>Config</strong>
      子目录,工具会自动找文件。
    </p>
    <button class="primary" @click="pickAndOpen">浏览...</button>
    <div v-if="configStore.lastError" class="error">{{ configStore.lastError }}</div>
    <div v-if="configStore.filePath" class="info">
      已加载
      <code>{{ configStore.filePath }}</code>
    </div>
    <div v-if="schemaStore.lastError" class="warn">
      ⚠ Schema 加载失败: {{ schemaStore.lastError }}
    </div>
  </div>
</template>

<style scoped>
.picker-view {
  padding: 32px;
  max-width: 720px;
}
.picker-view h2 {
  margin: 0 0 12px;
}
.hint {
  color: #555;
  margin: 0 0 24px;
  font-size: 13px;
  line-height: 1.6;
}
.primary {
  padding: 10px 24px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}
.error {
  margin-top: 12px;
  color: #ff4d4f;
  background: #fff1f0;
  padding: 8px 12px;
  border-radius: 4px;
}
.info {
  margin-top: 12px;
  color: #52c41a;
}
.warn {
  margin-top: 12px;
  color: #d48806;
  background: #fffbe6;
  padding: 8px 12px;
  border-radius: 4px;
}
code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}
</style>
