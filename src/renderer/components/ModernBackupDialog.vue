<script setup lang="ts">
import { ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()

interface BackupItem {
  path: string
  timestamp: number
  size: number
}

const backups = ref<BackupItem[]>([])
const selectedPath = ref<string | null>(null)
const isLoading = ref(false)
const isCreating = ref(false)

async function loadBackups() {
  if (!doc.filePath) return
  isLoading.value = true
  try {
    const list = await window.api.file.listBackups(doc.filePath)
    const items: BackupItem[] = list.map((p) => {
      const tsMatch = p.match(/\.(\d{8}_\d{6})\./)
      let ts = 0
      if (tsMatch && tsMatch[1]) {
        const str = tsMatch[1]
        ts = new Date(
          `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(9, 11)}:${str.slice(11, 13)}:${str.slice(13, 15)}`,
        ).getTime()
      }
      return { path: p, timestamp: ts, size: 0 }
    })
    backups.value = items
    if (items.length > 0) {
      selectedPath.value = items[0]!.path
    }
  } finally {
    isLoading.value = false
  }
}

async function createManualBackup() {
  if (!doc.filePath) return
  isCreating.value = true
  try {
    const bak = await window.api.file.createBackup(doc.filePath)
    doc.showToast(`📸 快照创建成功: ${bak.split(/[\\/]/).pop()}`, 'success')
    await loadBackups()
  } catch (err) {
    doc.showToast(`❌ 创建快照失败: ${(err as Error).message}`, 'error')
  } finally {
    isCreating.value = false
  }
}

watch(
  () => doc.showBackupModal,
  (show) => {
    if (show) loadBackups()
  },
)

async function confirmRestore() {
  if (!doc.filePath || !selectedPath.value) return
  const ok = confirm(`确定从所选历史备份恢复文件？当前本地未保存的改动将被覆盖。`)
  if (!ok) return

  const res = await window.api.file.restoreBackup(selectedPath.value, doc.filePath)
  if (res.ok) {
    await doc.reloadFromDisk()
    doc.showToast('✅ 已成功从历史备份还原文件与中文字段描述！', 'success')
    doc.showBackupModal = false
  } else {
    alert(`恢复失败: ${res.error}`)
  }
}

function closeModal() {
  doc.showBackupModal = false
}

function formatTs(ts: number): string {
  if (!ts) return '(时间未知)'
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div v-if="doc.showBackupModal" class="modal-backdrop" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-main">
          <h3>📦 历史备份与快照</h3>
          <button
            class="btn-snapshot"
            :disabled="isCreating || !doc.filePath"
            title="对当前磁盘上的文件及中文字段描述创建一份即时备份"
            @click="createManualBackup"
          >
            {{ isCreating ? '正在生成...' : '📸 立即创建快照' }}
          </button>
        </div>
        <div class="backup-rule-box">
          <div class="rule-item">
            <span class="rule-icon">💡</span>
            <span>
              <strong>自动备份条件：</strong>
              点击“保存”(Ctrl+S) 且文件内容发生实质改变时，覆盖前自动生成带时间戳副本（最多保留 10
              份滚动清理）。无改动保存不会生成冗余副本。
            </span>
          </div>
          <div class="rule-item">
            <span class="rule-icon">🛡️</span>
            <span>
              <strong>双重同步：</strong>
              备份与还原均完整涵盖 JSON 原始数据与中文字段描述元数据（.meta.json），安全无虞。
            </span>
          </div>
        </div>
      </header>

      <div class="modal-body">
        <div v-if="backups.length === 0" class="empty">
          <p>暂无历史备份文件。点击右上角“📸 立即创建快照”或在保存修改时将自动生成。</p>
        </div>

        <ul v-else class="backup-list">
          <li
            v-for="b in backups"
            :key="b.path"
            :class="{ active: selectedPath === b.path }"
            @click="selectedPath = b.path"
          >
            <div class="b-info">
              <span class="b-time">🕒 {{ formatTs(b.timestamp) }}</span>
              <code class="b-path">{{ b.path.split(/[\\/]/).pop() }}</code>
            </div>
            <span v-if="selectedPath === b.path" class="selected-mark">✔ 选中</span>
          </li>
        </ul>
      </div>

      <footer class="modal-footer">
        <button class="btn secondary" @click="closeModal">关闭</button>
        <button
          class="btn primary"
          :disabled="!selectedPath || backups.length === 0"
          @click="confirmRestore"
        >
          从所选备份恢复
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.modal-card {
  background: #1e1e26;
  border: 1px solid #333342;
  border-radius: 8px;
  width: 540px;
  max-width: 92vw;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
}

.modal-header {
  padding: 16px 20px;
  background: #1a1a22;
  border-bottom: 1px solid #282834;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-main h3 {
  margin: 0;
  font-size: 15px;
  color: #f1f5f9;
  font-weight: 600;
}
.btn-snapshot {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: 1px solid #38bdf8;
  color: white;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-snapshot:hover:not(:disabled) {
  filter: brightness(1.15);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
}
.btn-snapshot:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.backup-rule-box {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.45;
  color: #cbd5e1;
}
.rule-icon {
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 1px;
}
.rule-item strong {
  color: #38bdf8;
}

.modal-body {
  padding: 14px 20px;
  max-height: 320px;
  overflow-y: auto;
}

.empty {
  text-align: center;
  padding: 30px;
  color: #64748b;
  font-size: 13px;
}

.backup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.backup-list li {
  padding: 10px 12px;
  border: 1px solid #282834;
  background: #16161c;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.1s;
}
.backup-list li:hover {
  background: #202028;
  border-color: #3b3b4a;
}
.backup-list li.active {
  background: #1e293b;
  border-color: #3b82f6;
}

.b-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.b-time {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
}
.b-path {
  font-size: 11px;
  color: #60a5fa;
  font-family: monospace;
}
.selected-mark {
  color: #38bdf8;
  font-size: 12px;
  font-weight: 700;
}

.modal-footer {
  padding: 12px 20px;
  background: #1a1a22;
  border-top: 1px solid #282834;
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
  background: #252530;
  border: 1px solid #363646;
  color: #cbd5e1;
}
.btn.secondary:hover {
  background: #323240;
  color: #fff;
}
.btn.primary {
  background: #2563eb;
  border: 1px solid #1d4ed8;
  color: white;
}
.btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn.primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: #282834;
  border-color: #383848;
}
</style>
