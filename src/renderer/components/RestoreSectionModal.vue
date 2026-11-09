<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import { get } from '@shared/utils/json-path'

const doc = useJsonDocStore()

interface SnapshotChoice {
  path: string
  timestamp: number
  memo?: string
  locked?: boolean
  hasSection: boolean
  sectionSummary?: string
}

const snapshots = ref<SnapshotChoice[]>([])
const selectedSnapshot = ref<string | null>(null)
const isLoading = ref(false)
const protectDescriptions = ref(true) // 方案 B: 默认保护当前最新注释

const targetPath = computed(() => doc.showRestoreSectionModal?.path || '')
const targetLabel = computed(() => doc.showRestoreSectionModal?.label || '')

function formatTs(ts: number): string {
  if (!ts) return '(时间未知)'
  return new Date(ts).toLocaleString()
}

function getSnapshotShortName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

async function loadSnapshotsForSection() {
  if (!doc.filePath || !targetPath.value) return
  isLoading.value = true
  selectedSnapshot.value = null
  try {
    const list = await window.api.file.listBackups(doc.filePath)
    const items: SnapshotChoice[] = await Promise.all(
      list.map(async (p) => {
        const match = p.match(/\.(\d{8}_\d{6})(?:[._]([^\\/]+?))?\.bak\.json$/i)
        let ts = 0
        let memo = ''
        if (match && match[1]) {
          const str = match[1]
          ts = new Date(
            `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(9, 11)}:${str.slice(11, 13)}:${str.slice(13, 15)}`,
          ).getTime()
          if (match[2]) {
            memo = match[2]
          }
        }
        let isLocked = false
        try {
          const meta = await window.api.file.loadMeta<{ memo?: string; locked?: boolean }>(p)
          if (!memo && meta?.memo) memo = meta.memo
          isLocked = Boolean(meta?.locked)
        } catch {
          // ignore
        }

        let hasSection = false
        let sectionSummary = ''
        try {
          const snapData = await window.api.file.readJson<unknown>(p)
          const val = get(snapData, targetPath.value)
          if (val !== undefined) {
            hasSection = true
            if (val === null) {
              sectionSummary = 'null'
            } else if (Array.isArray(val)) {
              sectionSummary = `[ 数组: ${val.length} 项 ]`
            } else if (typeof val === 'object') {
              sectionSummary = `{ 对象: ${Object.keys(val).length} 项属性 }`
            } else {
              sectionSummary = `数值: ${JSON.stringify(val).slice(0, 30)}`
            }
          }
        } catch {
          hasSection = false
        }

        return {
          path: p,
          timestamp: ts,
          memo: memo || undefined,
          locked: isLocked,
          hasSection,
          sectionSummary,
        }
      }),
    )
    snapshots.value = items
    // 默认选择第一个包含该配置段的快照
    const firstAvailable = items.find((x) => x.hasSection)
    if (firstAvailable) {
      selectedSnapshot.value = firstAvailable.path
    }
  } finally {
    isLoading.value = false
  }
}

watch(
  () => doc.showRestoreSectionModal,
  (val) => {
    if (val) {
      protectDescriptions.value = true
      loadSnapshotsForSection()
    }
  },
  { immediate: true },
)

async function doRestore() {
  if (!selectedSnapshot.value || !targetPath.value) return
  const item = snapshots.value.find((x) => x.path === selectedSnapshot.value)
  if (!item || !item.hasSection) return

  const memoStr = item.memo ? `【${item.memo}】` : ''
  const shortName = getSnapshotShortName(item.path)
  const metaNotice = protectDescriptions.value
    ? '（已开启方案 B：保护当前已有最新中文注释，不随参数回滚）'
    : '（警告：将强制用快照注释覆盖当前注释）'

  const ok = confirm(
    `确定将配置段 [${targetPath.value}] 恢复为历史快照 ${memoStr} ${shortName} 中的内容吗？\n${metaNotice}\n\n注：恢复后可按 Ctrl+Z 快捷撤销。`,
  )
  if (!ok) return

  await doc.restoreSectionFromSnapshot(targetPath.value, item.path, {
    overwriteMeta: !protectDescriptions.value,
  })
}
</script>

<template>
  <div
    v-if="doc.showRestoreSectionModal"
    class="modal-backdrop"
    @click.self="doc.closeRestoreSectionModal()"
  >
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-info">
          <h3>从历史快照恢复配置段</h3>
          <div class="target-node-pill">
            <span class="pill-label">目标段:</span>
            <code class="pill-path">{{ targetPath }}</code>
            <span v-if="targetLabel" class="pill-desc">({{ targetLabel }})</span>
          </div>
        </div>
        <button class="close-btn" @click="doc.closeRestoreSectionModal()">✕</button>
      </header>

      <div class="modal-body">
        <p class="section-tip">
          💡
          <strong>局部定向恢复</strong>
          ：仅将所选快照中的
          <code>{{ targetPath }}</code>
          分支配置替换到当前编辑区中，其他所有模块参数完全保留不变。
        </p>

        <div v-if="isLoading" class="loading-state">
          <span>正在检索历史快照...</span>
        </div>

        <div v-else-if="snapshots.length === 0" class="empty-state">
          <p>暂无历史备份快照。可在右上角“历史备份与快照”中先创建快照。</p>
        </div>

        <div v-else class="snapshot-selector-list">
          <div
            v-for="s in snapshots"
            :key="s.path"
            class="snap-item"
            :class="{
              selected: selectedSnapshot === s.path,
              disabled: !s.hasSection,
            }"
            @click="s.hasSection && (selectedSnapshot = s.path)"
          >
            <div class="snap-left">
              <input
                type="radio"
                name="restore-snap"
                :checked="selectedSnapshot === s.path"
                :disabled="!s.hasSection"
                @change="selectedSnapshot = s.path"
              />
              <div class="snap-details">
                <div class="snap-title-line">
                  <span class="snap-time">{{ formatTs(s.timestamp) }}</span>
                  <span v-if="s.memo" class="snap-memo-pill">🏷️ {{ s.memo }}</span>
                  <span v-if="s.locked" class="snap-lock-pill">🔒 常驻</span>
                </div>
                <code class="snap-filename">{{ getSnapshotShortName(s.path) }}</code>
              </div>
            </div>

            <div class="snap-right">
              <span v-if="s.hasSection" class="badge-available">
                {{ s.sectionSummary }}
              </span>
              <span v-else class="badge-missing">⚠️ 该快照中无此段</span>
            </div>
          </div>
        </div>

        <!-- 方案 B：注释保护选项 -->
        <div class="meta-protect-row">
          <label
            class="protect-label"
            title="方案 B：机台参数将还原为所选快照中的数值；当前已维护好的中文字典与字段解释将被完整保留，仅增量补全快照中存在而当前缺失的字段注释"
          >
            <input v-model="protectDescriptions" type="checkbox" />
            <span class="protect-title">
              🛡️ 保护当前最新中文业务注释（推荐：仅回滚参数，不冲掉已维护好的注释字典）
            </span>
          </label>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn secondary" @click="doc.closeRestoreSectionModal()">取消</button>
        <button class="btn primary" :disabled="!selectedSnapshot" @click="doRestore">
          确认恢复此段配置
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.modal-card {
  width: 650px;
  max-width: 92vw;
  background: var(--bg-modal, #1e293b);
  border: 1px solid var(--border-color, #334155);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  color: var(--text-main, #f1f5f9);
  overflow: hidden;
}

.modal-header {
  padding: 14px 18px;
  background: var(--bg-drawer-header, #0f172a);
  border-bottom: 1px solid var(--border-color, #334155);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-info h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #38bdf8;
}

.target-node-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.pill-label {
  color: var(--text-dim, #94a3b8);
}

.pill-path {
  background: var(--bg-input, #1e293b);
  border: 1px solid var(--border-focus, #38bdf8);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #f59e0b;
}

.pill-desc {
  color: var(--text-dim, #94a3b8);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-dim, #94a3b8);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-btn-hover, #334155);
  color: #fff;
}

.modal-body {
  padding: 16px 18px;
  max-height: 440px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim, #94a3b8);
  line-height: 1.5;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 8px 12px;
  border-radius: 6px;
}

.loading-state,
.empty-state {
  padding: 30px;
  text-align: center;
  color: var(--text-dim, #94a3b8);
  font-size: 13px;
}

.snapshot-selector-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snap-item {
  padding: 9px 12px;
  background: var(--bg-input, #0f172a);
  border: 1px solid var(--border-color, #334155);
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s;
}

.snap-item:hover:not(.disabled) {
  border-color: #38bdf8;
  background: var(--bg-btn-hover, #1e293b);
}

.snap-item.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
}

.snap-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: transparent;
}

.snap-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.snap-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.snap-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.snap-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main, #f1f5f9);
}

.snap-memo-pill {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
}

.snap-lock-pill {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.35);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
}

.snap-filename {
  font-size: 11px;
  color: var(--text-dim, #94a3b8);
  font-family: monospace;
}

.badge-available {
  font-size: 11px;
  color: #38bdf8;
  font-weight: 500;
}

.badge-missing {
  font-size: 11px;
  color: #ef4444;
}

.meta-protect-row {
  margin-top: 4px;
  padding: 10px 12px;
  background: var(--bg-workspace, #0f172a);
  border: 1px solid var(--border-color, #334155);
  border-radius: 6px;
}

.protect-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.protect-title {
  font-size: 12px;
  color: #10b981;
  font-weight: 500;
}

.modal-footer {
  padding: 12px 18px;
  background: var(--bg-drawer-header, #0f172a);
  border-top: 1px solid var(--border-color, #334155);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  padding: 6px 16px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.btn.secondary {
  background: var(--bg-btn, #334155);
  color: var(--text-main, #f1f5f9);
  border-color: var(--border-color, #475569);
}

.btn.secondary:hover {
  background: var(--bg-btn-hover, #475569);
}

.btn.primary {
  background: #0284c7;
  color: #fff;
  border-color: #38bdf8;
}

.btn.primary:hover:not(:disabled) {
  background: #0369a1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
