<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useConfigStore } from '../stores/config'

const uiStore = useUiStore()
const configStore = useConfigStore()

interface Backup {
  path: string
  timestamp: number
  size: number
  content: unknown
}

const backups = ref<Backup[]>([])
const selectedPath = ref<string | null>(null)

async function loadBackups() {
  if (!configStore.filePath) return
  const list = await window.api.file.listBackups(configStore.filePath)
  const enriched: Backup[] = await Promise.all(
    list.map(async (path) => {
      const stat = await window.api.file.readJson(path)
      const tsMatch = path.match(/\.(\d{8}_\d{6})\./)
      const ts = tsMatch
        ? new Date(
            tsMatch[1]!.slice(0, 4) +
              '-' +
              tsMatch[1]!.slice(4, 6) +
              '-' +
              tsMatch[1]!.slice(6, 8) +
              'T' +
              tsMatch[1]!.slice(9, 11) +
              ':' +
              tsMatch[1]!.slice(11, 13) +
              ':' +
              tsMatch[1]!.slice(13, 15),
          ).getTime()
        : 0
      const text = JSON.stringify(stat)
      return { path, timestamp: ts, size: text.length, content: stat }
    }),
  )
  backups.value = enriched
}

watch(
  () => uiStore.showBackupDialog,
  (v) => {
    if (v) loadBackups()
  },
)

async function confirmRestore() {
  if (!configStore.filePath || !selectedPath.value) return
  const ok = confirm(
    `确定要从备份 ${selectedPath.value} 恢复?当前内容会被覆盖(会自动备份当前状态)。`,
  )
  if (!ok) return
  const r = await window.api.file.restoreBackup(selectedPath.value, configStore.filePath)
  if (r.ok) {
    await configStore.reloadFromDisk()
    uiStore.showBackupDialog = false
  } else {
    alert(`恢复失败: ${r.error}`)
  }
}

function cancel() {
  uiStore.showBackupDialog = false
  selectedPath.value = null
}

function formatTs(ts: number): string {
  if (!ts) return '(未知时间)'
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div v-if="uiStore.showBackupDialog" class="backdrop" @click.self="cancel">
    <div class="dialog">
      <header>
        <h2>备份列表</h2>
        <p class="subtitle">共 {{ backups.length }} 份备份(最多保留 10 份)。</p>
      </header>
      <main>
        <table v-if="backups.length > 0">
          <thead>
            <tr>
              <th></th>
              <th>备份时间</th>
              <th>大小</th>
              <th>路径</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in backups"
              :key="b.path"
              :class="{ selected: selectedPath === b.path }"
              @click="selectedPath = b.path"
            >
              <td>
                <input type="radio" :checked="selectedPath === b.path" />
              </td>
              <td>{{ formatTs(b.timestamp) }}</td>
              <td>{{ (b.size / 1024).toFixed(1) }} KB</td>
              <td class="path-cell">{{ b.path.split(/[\\/]/).pop() }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">暂无备份。</div>
      </main>
      <footer class="actions">
        <button @click="cancel">关闭</button>
        <button class="primary" :disabled="!selectedPath" @click="confirmRestore">
          从备份恢复
        </button>
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
  width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
header {
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}
header h2 {
  margin: 0 0 8px;
}
.subtitle {
  margin: 0;
  font-size: 13px;
  color: #666;
}
main {
  flex: 1;
  overflow: auto;
  padding: 0 24px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: #999;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
}
tr.selected {
  background: #e6f7ff;
}
tr:hover {
  cursor: pointer;
  background: #f0f9ff;
}
th {
  background: #fafafa;
  font-weight: 500;
}
.path-cell {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: #003eb3;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
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
.actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
