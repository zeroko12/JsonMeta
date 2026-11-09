<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import { get } from '@shared/utils/json-path'
import { diff } from '@shared/utils/diff'

const doc = useJsonDocStore()

interface SnapshotChoice {
  path: string
  timestamp: number
  memo?: string
  locked?: boolean
  hasSection: boolean
  sectionSummary?: string
}

interface SectionDiffItem {
  subPath: string
  fullPath: string
  type: 'modify' | 'add' | 'delete'
  currentValText: string
  snapshotValText: string
  desc?: string
}

const snapshots = ref<SnapshotChoice[]>([])
const selectedSnapshot = ref<string | null>(null)
const isLoading = ref(false)
const isDiffLoading = ref(false)
const protectDescriptions = ref(true) // 默认保护当前最新业务注释
const sectionDiffList = ref<SectionDiffItem[]>([])
const isRestoring = ref(false)

const targetPath = computed(() => doc.showRestoreSectionModal?.path || '')
const targetLabel = computed(() => doc.showRestoreSectionModal?.label || '')

function formatTs(ts: number): string {
  if (!ts) return '(时间未知)'
  return new Date(ts).toLocaleString()
}

function getSnapshotShortName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

function formatVal(v: unknown): string {
  if (v === undefined) return '(无)'
  if (v === null) return 'null'
  if (typeof v === 'string') return `"${v}"`
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

async function loadSnapshotsForSection() {
  if (!doc.filePath || !targetPath.value) return
  isLoading.value = true
  selectedSnapshot.value = null
  sectionDiffList.value = []
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
    const firstAvailable = items.find((x) => x.hasSection)
    if (firstAvailable) {
      selectedSnapshot.value = firstAvailable.path
    }
  } finally {
    isLoading.value = false
  }
}

// 选中某个快照时，实时计算当前内存中的该段配置与快照中的差异对比
async function computeSectionDiff(snapPath: string) {
  if (!snapPath || !targetPath.value || doc.current === null) {
    sectionDiffList.value = []
    return
  }
  isDiffLoading.value = true
  try {
    const snapData = await window.api.file.readJson<unknown>(snapPath)
    const snapVal = get(snapData, targetPath.value)
    const currentVal = get(doc.current, targetPath.value)

    if (snapVal === undefined) {
      sectionDiffList.value = []
      return
    }

    // 比较两者的差异
    const changeMap = diff(currentVal, snapVal)
    const list: SectionDiffItem[] = []

    for (const c of changeMap.values()) {
      const displaySub = c.path || '(当前段数值)'
      const displayFull = c.path ? `${targetPath.value}.${c.path}` : targetPath.value
      const desc = doc.descriptions[displayFull] || ''
      list.push({
        subPath: displaySub,
        fullPath: displayFull,
        type: c.type,
        currentValText: formatVal(c.oldValue),
        snapshotValText: formatVal(c.newValue),
        desc: desc || undefined,
      })
    }
    sectionDiffList.value = list
  } catch {
    sectionDiffList.value = []
  } finally {
    isDiffLoading.value = false
  }
}

watch(
  () => selectedSnapshot.value,
  (val) => {
    if (val) {
      computeSectionDiff(val)
    } else {
      sectionDiffList.value = []
    }
  },
)

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

async function doRestore(goToDiffView = false) {
  if (!selectedSnapshot.value || !targetPath.value || isRestoring.value) return
  const item = snapshots.value.find((x) => x.path === selectedSnapshot.value)
  if (!item || !item.hasSection) return

  isRestoring.value = true
  try {
    const ok = await doc.restoreSectionFromSnapshot(targetPath.value, item.path, {
      overwriteMeta: !protectDescriptions.value,
    })
    if (ok && goToDiffView) {
      doc.searchQuery = targetPath.value
      doc.viewMode = 'diff'
    }
  } finally {
    isRestoring.value = false
  }
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

        <!-- 快照选择列表 -->
        <div class="section-block">
          <div class="block-title">选择历史快照版本</div>
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
        </div>

        <!-- 差异对比实时预览 (紧凑直观对比流) -->
        <div v-if="selectedSnapshot" class="section-block diff-preview-block">
          <div class="block-title-row">
            <span class="block-title">恢复变动字段预览</span>
            <span v-if="!isDiffLoading" class="diff-count-badge">
              {{ sectionDiffList.length === 0 ? '无数值差异' : `${sectionDiffList.length} 处变动` }}
            </span>
          </div>

          <div v-if="isDiffLoading" class="diff-loading">
            <span>正在对比分析字段差异...</span>
          </div>

          <div v-else-if="sectionDiffList.length === 0" class="diff-clean-hint">
            <span>✅ 快照中的此段配置与当前编辑区完全相同，无任何数值差异。</span>
          </div>

          <div v-else class="diff-table-container">
            <table class="preview-diff-table">
              <thead>
                <tr>
                  <th width="48" class="text-center">变动</th>
                  <th width="190">子字段 / 业务注释</th>
                  <th>当前编辑值</th>
                  <th width="18" class="text-center"></th>
                  <th>快照恢复值</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in sectionDiffList" :key="idx" :class="item.type">
                  <td class="text-center">
                    <span class="type-pill" :class="item.type">
                      {{ item.type === 'modify' ? '改' : item.type === 'add' ? '增' : '删' }}
                    </span>
                  </td>
                  <td class="col-field">
                    <code class="field-path-code" :title="item.fullPath">{{ item.subPath }}</code>
                    <span v-if="item.desc" class="field-desc-tag" :title="item.desc">
                      {{ item.desc }}
                    </span>
                  </td>
                  <td class="cell-val old-val">
                    <code :title="item.currentValText">{{ item.currentValText }}</code>
                  </td>
                  <td class="cell-arrow">➔</td>
                  <td class="cell-val new-val">
                    <code :title="item.snapshotValText">{{ item.snapshotValText }}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 业务注释保护选项 -->
        <div class="meta-protect-row">
          <label
            class="protect-label"
            title="还原配置参数数值，同时保留当前最新维护的中文注释与字段字典（仅增量补齐快照中存在而当前缺失的字段注释）"
          >
            <input v-model="protectDescriptions" type="checkbox" />
            <span class="protect-title">
              🛡️ 保护当前中文业务注释（推荐：仅回滚参数数值，保留已维护好的中文注释字典）
            </span>
          </label>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn secondary" @click="doc.closeRestoreSectionModal()">取消</button>
        <button
          class="btn view-diff-btn"
          :disabled="!selectedSnapshot || isRestoring"
          title="执行恢复并自动切换到改动审查视图查看全量差异"
          @click="doRestore(true)"
        >
          恢复并在更改视图中查看
        </button>
        <button
          class="btn primary"
          :disabled="!selectedSnapshot || isRestoring"
          @click="doRestore(false)"
        >
          {{ isRestoring ? '正在恢复...' : '确认恢复此段配置' }}
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
  background: var(--bg-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
}

.modal-card {
  width: 720px;
  max-width: 94vw;
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  color: var(--text-main);
  overflow: hidden;
}

.modal-header {
  padding: 12px 18px;
  background: var(--bg-drawer-header);
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-highlight);
}

.target-node-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.pill-label {
  color: var(--text-dim);
}

.pill-path {
  background: var(--bg-input);
  border: 1px solid var(--border-focus);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: 'Consolas', monospace;
  color: #f59e0b;
}

.pill-desc {
  color: var(--text-dim);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.1s;
}

.close-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-main);
}

.modal-body {
  padding: 10px 16px;
  max-height: 520px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-tip {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.4;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 6px 10px;
  border-radius: 5px;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.block-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.block-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.diff-count-badge {
  font-size: 10px;
  background: var(--bg-badge);
  color: var(--text-highlight);
  border: 1px solid var(--border-color);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.loading-state,
.empty-state {
  padding: 18px;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
}

.snapshot-selector-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 125px;
  overflow-y: auto;
  padding-right: 2px;
}

.snap-item {
  padding: 5px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.12s;
}

.snap-item:hover:not(.disabled) {
  border-color: var(--border-focus);
  background: var(--bg-btn-hover);
}

.snap-item.selected {
  border-color: var(--border-focus);
  background: rgba(56, 189, 248, 0.1);
}

.snap-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: transparent;
}

.snap-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snap-details {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.snap-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.snap-time {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-main);
}

.snap-memo-pill {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 3px;
}

.snap-lock-pill {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.35);
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 3px;
}

.snap-filename {
  font-size: 10px;
  color: var(--text-dim);
  font-family: 'Consolas', monospace;
}

.badge-available {
  font-size: 10.5px;
  color: var(--text-highlight);
  font-weight: 500;
}

.badge-missing {
  font-size: 10.5px;
  color: #ef4444;
}

/* 差异对比预览表格 (紧凑直观) */
.diff-preview-block {
  margin-top: 1px;
}

.diff-loading {
  padding: 12px;
  text-align: center;
  color: var(--text-dim);
  font-size: 11px;
}

.diff-clean-hint {
  padding: 8px 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 4px;
  color: #10b981;
  font-size: 11px;
}

.diff-table-container {
  max-height: 175px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-workspace);
}

.preview-diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.preview-diff-table th {
  position: sticky;
  top: 0;
  background: var(--bg-drawer-header);
  border-bottom: 1px solid var(--border-color);
  padding: 4px 6px;
  text-align: left;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 10.5px;
  z-index: 2;
}

.preview-diff-table th.text-center,
.preview-diff-table td.text-center {
  text-align: center;
}

.preview-diff-table td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.col-field {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.field-path-code {
  font-family: 'Consolas', monospace;
  color: var(--text-code);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-desc-tag {
  font-size: 9.5px;
  color: var(--desc-text);
  background: var(--desc-bg);
  border: 1px solid var(--desc-border);
  padding: 0 3px;
  border-radius: 3px;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.cell-arrow {
  text-align: center;
  color: var(--text-dim);
  font-size: 9px;
  padding: 0;
  user-select: none;
}

.cell-val code {
  font-family: 'Consolas', monospace;
  font-size: 10.5px;
  padding: 1px 4px;
  border-radius: 3px;
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.cell-val.old-val code {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.cell-val.new-val code {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.type-pill {
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.2;
}

.type-pill.modify {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.type-pill.add {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.type-pill.delete {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.meta-protect-row {
  margin-top: 1px;
  padding: 6px 10px;
  background: var(--bg-workspace);
  border: 1px solid var(--border-color);
  border-radius: 5px;
}

.protect-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.protect-title {
  font-size: 11px;
  color: #10b981;
  font-weight: 500;
}

.modal-footer {
  padding: 8px 16px;
  background: var(--bg-drawer-header);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.btn {
  padding: 6px 14px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
}

.btn.secondary {
  background: var(--bg-btn);
  color: var(--text-main);
  border-color: var(--border-color);
}

.btn.secondary:hover {
  background: var(--bg-btn-hover);
}

.btn.view-diff-btn {
  background: var(--bg-btn);
  border-color: var(--border-focus);
  color: var(--text-highlight);
  font-weight: 600;
}

.btn.view-diff-btn:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.15);
}

.btn.primary {
  background: #0284c7;
  color: #fff;
  border-color: #0369a1;
  font-weight: 600;
}

.btn.primary:hover:not(:disabled) {
  background: #0369a1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
