<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import type { UnifiedChangeItem } from '../stores/jsonDoc'
import { diff } from '@shared/utils/diff'

const doc = useJsonDocStore()

interface BackupItem {
  path: string
  timestamp: number
  memo?: string
  size: number
}

type DialogMode = 'list' | 'diff'
const dialogMode = ref<DialogMode>('list')

const backups = ref<BackupItem[]>([])
const selectedPath = ref<string | null>(null)
const isLoading = ref(false)
const isCreating = ref(false)

// ─── 创建快照备注输入栏状态 ───
const showCreateInput = ref(false)
const snapshotMemoDraft = ref('')
const memoInputRef = ref<HTMLInputElement | null>(null)

function openCreateInput() {
  snapshotMemoDraft.value = ''
  showCreateInput.value = true
  nextTick(() => {
    memoInputRef.value?.focus()
  })
}

// ─── 修改快照备注状态 ───
const editingPath = ref<string | null>(null)
const editMemoDraft = ref('')
const editMemoInputRef = ref<HTMLInputElement | null>(null)
const isSavingMemo = ref(false)

const selectedBackupItem = computed(() => backups.value.find((b) => b.path === selectedPath.value))

function startEditMemo(b: BackupItem) {
  editingPath.value = b.path
  editMemoDraft.value = b.memo || ''
  nextTick(() => {
    editMemoInputRef.value?.focus()
    editMemoInputRef.value?.select()
  })
}

function cancelEditMemo() {
  editingPath.value = null
  editMemoDraft.value = ''
}

async function saveEditMemo(b: BackupItem) {
  if (!doc.filePath) return
  isSavingMemo.value = true
  try {
    const newMemo = editMemoDraft.value.trim()
    const res = await window.api.file.updateBackupMemo(b.path, newMemo)
    if (!res.ok) {
      doc.showToast(res.error || '修改快照备注失败', 'error')
      return
    }

    const oldPath = b.path
    const newPath = res.newPath || b.path
    b.memo = res.memo || undefined
    b.path = newPath

    if (selectedPath.value === oldPath) {
      selectedPath.value = newPath
    }
    if (diffSourceA.value === oldPath) {
      diffSourceA.value = newPath
    }
    if (diffSourceB.value === oldPath) {
      diffSourceB.value = newPath
    }

    editingPath.value = null
    editMemoDraft.value = ''
    doc.showToast(res.memo ? `快照备注已修改为【${res.memo}】` : '快照备注已清除', 'success')
    await loadBackups()
  } catch (err) {
    doc.showToast(`修改备注失败: ${(err as Error).message}`, 'error')
  } finally {
    isSavingMemo.value = false
  }
}

// ─── 快照比对状态 ───
const diffSourceA = ref<string>('') // 基准版本 (通常为某个历史快照路径)
const diffSourceB = ref<string>('__CURRENT__') // 对比目标 ('__CURRENT__' 或另一个快照路径)
const isDiffLoading = ref(false)
const diffItems = ref<UnifiedChangeItem[]>([])
const diffSearchQuery = ref('')
const diffCategoryFilter = ref<'all' | 'data' | 'description'>('all')

async function loadBackups() {
  if (!doc.filePath) return
  isLoading.value = true
  try {
    const list = await window.api.file.listBackups(doc.filePath)
    const items: BackupItem[] = await Promise.all(
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
        // 若文件名无备注，则尝试从伴生元数据文件读取
        if (!memo) {
          try {
            const meta = await window.api.file.loadMeta<{ memo?: string }>(p)
            if (meta?.memo) memo = meta.memo
          } catch {
            // ignore
          }
        }
        return { path: p, timestamp: ts, memo: memo || undefined, size: 0 }
      }),
    )
    backups.value = items
    if (items.length > 0 && !selectedPath.value) {
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
    const memo = snapshotMemoDraft.value.trim()
    const bak = await window.api.file.createBackup(doc.filePath, memo || undefined)
    const memoTag = memo ? `【${memo}】 ` : ''
    doc.showToast(`快照创建成功: ${memoTag}${bak.split(/[\\/]/).pop()}`, 'success')
    showCreateInput.value = false
    snapshotMemoDraft.value = ''
    await loadBackups()
  } catch (err) {
    doc.showToast(`创建快照失败: ${(err as Error).message}`, 'error')
  } finally {
    isCreating.value = false
  }
}

watch(
  () => doc.showBackupModal,
  (show) => {
    if (show) {
      dialogMode.value = 'list'
      showCreateInput.value = false
      snapshotMemoDraft.value = ''
      editingPath.value = null
      editMemoDraft.value = ''
      loadBackups()
    } else {
      diffItems.value = []
      diffSearchQuery.value = ''
      editingPath.value = null
      editMemoDraft.value = ''
    }
  },
)

async function confirmRestore(targetPath?: string) {
  const p = targetPath || selectedPath.value
  if (!doc.filePath || !p) return
  const item = backups.value.find((b) => b.path === p)
  const memoStr = item && item.memo ? ` (${item.memo})` : ''
  const fileName = p.split(/[\\/]/).pop()
  const ok = confirm(
    `确定从历史快照 [${fileName}]${memoStr} 恢复文件？当前本地未保存的改动将被覆盖。`,
  )
  if (!ok) return

  const res = await window.api.file.restoreBackup(p, doc.filePath)
  if (res.ok) {
    await doc.reloadFromDisk()
    doc.showToast('已成功从历史备份还原文件与中文字段描述！', 'success')
    doc.showBackupModal = false
    dialogMode.value = 'list'
  } else {
    alert(`恢复失败: ${res.error}`)
  }
}

function closeModal() {
  doc.showBackupModal = false
  dialogMode.value = 'list'
}

function formatTs(ts: number): string {
  if (!ts) return '(时间未知)'
  return new Date(ts).toLocaleString()
}

function getSnapshotShortName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

function getSnapshotLabel(p: string): string {
  if (p === '__CURRENT__') {
    return '● 当前配置 (当前编辑状态' + (doc.isDirty ? ' - 包含未保存修改' : '') + ')'
  }
  const item = backups.value.find((b) => b.path === p)
  const timeStr = item && item.timestamp ? formatTs(item.timestamp) : ''
  const name = getSnapshotShortName(p)
  const memoStr = item && item.memo ? ` 【${item.memo}】` : ''
  return timeStr ? `[${timeStr}]${memoStr} ${name}` : `${memoStr} ${name}`
}

// ─── 差异比对核心计算 ───
async function executeDiff() {
  if (!diffSourceA.value || !diffSourceB.value) {
    diffItems.value = []
    return
  }
  isDiffLoading.value = true
  try {
    // 1. 读取基准 A 数据与元数据
    let dataA: unknown
    let descsA: Record<string, string> = {}
    if (diffSourceA.value === '__CURRENT__') {
      dataA = toRaw(doc.current)
      descsA = toRaw(doc.descriptions) || {}
    } else {
      dataA = await window.api.file.readJson(diffSourceA.value)
      const metaA = await window.api.file
        .loadMeta<{ descriptions?: Record<string, string> }>(diffSourceA.value)
        .catch(() => ({ descriptions: {} }))
      descsA = metaA?.descriptions || {}
    }

    // 2. 读取对比目标 B 数据与元数据
    let dataB: unknown
    let descsB: Record<string, string> = {}
    if (diffSourceB.value === '__CURRENT__') {
      dataB = toRaw(doc.current)
      descsB = toRaw(doc.descriptions) || {}
    } else {
      dataB = await window.api.file.readJson(diffSourceB.value)
      const metaB = await window.api.file
        .loadMeta<{ descriptions?: Record<string, string> }>(diffSourceB.value)
        .catch(() => ({ descriptions: {} }))
      descsB = metaB?.descriptions || {}
    }

    // 3. 计算配置数据差异
    const dataDiffMap = diff(dataA, dataB)
    const list: UnifiedChangeItem[] = dataDiffMap.toArray().map((c) => ({
      path: c.path,
      type: c.type,
      category: 'data' as const,
      oldValue: c.oldValue,
      newValue: c.newValue,
      label: c.type === 'modify' ? '修改数值' : c.type === 'add' ? '新增字段' : '删除字段',
    }))

    // 4. 计算中文字段描述差异
    const allDescKeys = new Set([...Object.keys(descsA), ...Object.keys(descsB)])
    for (const k of allDescKeys) {
      const oldV = descsA[k]
      const newV = descsB[k]
      if (oldV === undefined && newV !== undefined && newV.trim() !== '') {
        list.push({
          path: k,
          type: 'add',
          category: 'description',
          oldValue: '(无描述)',
          newValue: newV,
          label: '新增中文描述',
        })
      } else if (oldV !== undefined && (newV === undefined || newV.trim() === '')) {
        list.push({
          path: k,
          type: 'delete',
          category: 'description',
          oldValue: oldV,
          newValue: '(已清空)',
          label: '删除中文描述',
        })
      } else if (oldV !== undefined && newV !== undefined && oldV !== newV) {
        list.push({
          path: k,
          type: 'modify',
          category: 'description',
          oldValue: oldV,
          newValue: newV,
          label: '修改中文描述',
        })
      }
    }

    diffItems.value = list
  } catch (err) {
    doc.showToast(`比对读取失败: ${(err as Error).message}`, 'error')
    diffItems.value = []
  } finally {
    isDiffLoading.value = false
  }
}

// 快速入口 1: 将指定快照与当前配置进行比对
function openDiffWithCurrent(backupPath: string) {
  diffSourceA.value = backupPath
  diffSourceB.value = '__CURRENT__'
  dialogMode.value = 'diff'
  void executeDiff()
}

// 快速入口 2: 对比两个快照
function openDiffBetweenSnapshots() {
  if (backups.value.length < 2) {
    doc.showToast('需要至少两个快照才能进行快照间对比', 'error')
    return
  }
  // 默认基准 A 取较早的快照，目标 B 取较新的快照
  diffSourceA.value = backups.value[1]!.path
  diffSourceB.value = backups.value[0]!.path
  dialogMode.value = 'diff'
  void executeDiff()
}

// 切换 A 与 B
function swapDiffSources() {
  const temp = diffSourceA.value
  diffSourceA.value = diffSourceB.value
  diffSourceB.value = temp
  void executeDiff()
}

// 监听下拉选框改变自动重新比对
watch([diffSourceA, diffSourceB], () => {
  if (dialogMode.value === 'diff') {
    void executeDiff()
  }
})

// 过滤后的差异条目
const filteredDiffItems = computed(() => {
  let list = diffItems.value
  if (diffCategoryFilter.value === 'data') {
    list = list.filter((i) => i.category === 'data')
  } else if (diffCategoryFilter.value === 'description') {
    list = list.filter((i) => i.category === 'description')
  }
  const q = diffSearchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) => {
    if (item.path.toLowerCase().includes(q)) return true
    if (item.label && item.label.toLowerCase().includes(q)) return true
    if (JSON.stringify(item.oldValue).toLowerCase().includes(q)) return true
    if (JSON.stringify(item.newValue).toLowerCase().includes(q)) return true
    return false
  })
})

const diffStats = computed(() => {
  const all = diffItems.value
  return {
    total: all.length,
    modify: all.filter((c) => c.type === 'modify').length,
    add: all.filter((c) => c.type === 'add').length,
    delete: all.filter((c) => c.type === 'delete').length,
    dataCount: all.filter((c) => c.category === 'data').length,
    descCount: all.filter((c) => c.category === 'description').length,
  }
})

function formatVal(v: unknown): string {
  if (v === undefined) return '(无)'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
</script>

<template>
  <div v-if="doc.showBackupModal" class="modal-backdrop" @click.self="closeModal">
    <!-- ─── 模式 1: 历史备份快照列表 ─── -->
    <div v-if="dialogMode === 'list'" class="modal-card list-mode">
      <header class="modal-header">
        <div class="header-main">
          <h3>历史备份与快照</h3>
          <div class="header-actions">
            <button
              v-if="backups.length >= 2"
              class="btn-tool-secondary"
              title="对比两个历史快照之间的参数与描述差异"
              @click="openDiffBetweenSnapshots"
            >
              🔍 两快照间对比
            </button>
            <button
              class="btn-snapshot"
              :disabled="isCreating || !doc.filePath"
              title="为当前配置创建快照，可添加中文工况备注"
              @click="openCreateInput"
            >
              {{ isCreating ? '正在生成...' : '+ 立即创建快照' }}
            </button>
          </div>
        </div>
      </header>

      <div class="modal-body">
        <!-- 中文工况备注创建面板 -->
        <div v-if="showCreateInput" class="create-memo-banner">
          <div class="memo-header-row">
            <span class="memo-prompt">🏷️ 创建快照 — 请输入中文工况备注（可选）:</span>
            <button class="btn-memo-close" title="取消" @click="showCreateInput = false">✕</button>
          </div>
          <div class="memo-input-row">
            <input
              ref="memoInputRef"
              v-model="snapshotMemoDraft"
              type="text"
              class="memo-text-input"
              placeholder="输入备注（如：更换灯丝后标定、真空度调参）[按回车直接创建]"
              maxlength="40"
              @keydown.enter="createManualBackup"
              @keydown.esc="showCreateInput = false"
            />
            <button
              class="btn primary btn-memo-submit"
              :disabled="isCreating"
              @click="createManualBackup"
            >
              {{ isCreating ? '创建中...' : '确认创建' }}
            </button>
          </div>
        </div>

        <div v-if="backups.length === 0" class="empty">
          <p>暂无历史备份文件。点击右上角“+ 立即创建快照”或在保存修改时将自动生成。</p>
        </div>

        <ul v-else class="backup-list">
          <li
            v-for="b in backups"
            :key="b.path"
            :class="{ active: selectedPath === b.path }"
            @click="selectedPath = b.path"
          >
            <div class="b-info">
              <div class="b-time-line">
                <span class="b-time">{{ formatTs(b.timestamp) }}</span>
                <span
                  v-if="b.memo"
                  class="b-memo-pill"
                  :title="`工况备注: ${b.memo} (点击修改)`"
                  @click.stop="startEditMemo(b)"
                >
                  🏷️ {{ b.memo }}
                </span>
                <button
                  v-else
                  class="btn-inline-add-memo"
                  title="为此快照添加备注"
                  @click.stop="startEditMemo(b)"
                >
                  + 备注
                </button>
              </div>
              <code class="b-path">{{ getSnapshotShortName(b.path) }}</code>

              <!-- 行内修改备注编辑框 -->
              <div v-if="editingPath === b.path" class="b-memo-inline-edit" @click.stop>
                <input
                  ref="editMemoInputRef"
                  v-model="editMemoDraft"
                  type="text"
                  class="memo-inline-input"
                  placeholder="输入快照备注（清空并保存则清除备注）"
                  maxlength="40"
                  @keydown.enter="saveEditMemo(b)"
                  @keydown.esc="cancelEditMemo"
                />
                <div class="inline-edit-btns">
                  <button
                    class="btn-memo-confirm"
                    :disabled="isSavingMemo"
                    @click="saveEditMemo(b)"
                  >
                    {{ isSavingMemo ? '保存中...' : '保存' }}
                  </button>
                  <button class="btn-memo-cancel" @click="cancelEditMemo">取消</button>
                </div>
              </div>
            </div>
            <div class="b-actions">
              <button
                class="btn-row-memo"
                title="修改此快照的工况备注"
                @click.stop="startEditMemo(b)"
              >
                ✏️ 备注
              </button>
              <button
                class="btn-row-diff"
                title="对比该历史快照与当前编辑中的配置差异"
                @click.stop="openDiffWithCurrent(b.path)"
              >
                与当前对比
              </button>
              <span v-if="selectedPath === b.path" class="selected-mark">● 选中</span>
            </div>
          </li>
        </ul>
      </div>

      <footer class="modal-footer">
        <div class="footer-left">
          <button
            v-if="selectedPath"
            class="btn secondary diff-btn"
            title="对比选中的快照与当前配置"
            @click="openDiffWithCurrent(selectedPath)"
          >
            与当前对比
          </button>
          <button
            v-if="selectedPath && selectedBackupItem"
            class="btn secondary"
            title="修改选中快照的工况备注"
            @click="startEditMemo(selectedBackupItem)"
          >
            ✏️ 修改备注
          </button>
        </div>
        <div class="footer-right">
          <button class="btn secondary" @click="closeModal">关闭</button>
          <button
            class="btn primary"
            :disabled="!selectedPath || backups.length === 0"
            @click="() => confirmRestore()"
          >
            从所选备份恢复
          </button>
        </div>
      </footer>
    </div>

    <!-- ─── 模式 2: 快照差异比对视窗 (快照 vs 当前 / 快照 vs 快照) ─── -->
    <div v-else class="modal-card diff-mode">
      <header class="modal-header diff-header">
        <div class="diff-header-left">
          <button class="btn-back" title="返回快照列表" @click="dialogMode = 'list'">
            ← 返回列表
          </button>
          <span class="diff-title">快照差异比对</span>
        </div>

        <!-- 差异源选择控件 -->
        <div class="diff-selectors">
          <div class="selector-group">
            <span class="selector-tag base">基准 (A):</span>
            <select v-model="diffSourceA" class="diff-select" :disabled="isDiffLoading">
              <option
                v-for="b in backups"
                :key="'a-' + b.path"
                :value="b.path"
                :disabled="b.path === diffSourceB"
              >
                {{ getSnapshotLabel(b.path) }}
              </option>
              <option value="__CURRENT__" :disabled="diffSourceB === '__CURRENT__'">
                {{ getSnapshotLabel('__CURRENT__') }}
              </option>
            </select>
          </div>

          <button class="btn-swap" title="交换基准与对比版本" @click="swapDiffSources">
            ⇄ 交换
          </button>

          <div class="selector-group">
            <span class="selector-tag target">目标 (B):</span>
            <select v-model="diffSourceB" class="diff-select" :disabled="isDiffLoading">
              <option value="__CURRENT__" :disabled="diffSourceA === '__CURRENT__'">
                {{ getSnapshotLabel('__CURRENT__') }}
              </option>
              <option
                v-for="b in backups"
                :key="'b-' + b.path"
                :value="b.path"
                :disabled="b.path === diffSourceA"
              >
                {{ getSnapshotLabel(b.path) }}
              </option>
            </select>
          </div>
        </div>

        <button class="btn-close-diff" title="关闭" @click="closeModal">✕</button>
      </header>

      <!-- 统计与过滤子工具栏 -->
      <div class="diff-subbar">
        <div class="sub-left">
          <span v-if="isDiffLoading" class="sub-loading">正在比对中...</span>
          <template v-else>
            <span class="sub-badge total">● 共 {{ diffStats.total }} 处差异</span>
            <span class="stat-mini mod">{{ diffStats.modify }} 修改</span>
            <span class="stat-mini add">{{ diffStats.add }} 新增</span>
            <span class="stat-mini del">{{ diffStats.delete }} 删除</span>
            <span v-if="diffStats.descCount > 0" class="stat-mini desc">
              // {{ diffStats.descCount }} 描述不同
            </span>
          </template>
        </div>

        <div class="sub-right">
          <div class="filter-pills">
            <button
              :class="['pill-btn', { active: diffCategoryFilter === 'all' }]"
              @click="diffCategoryFilter = 'all'"
            >
              全部 ({{ diffStats.total }})
            </button>
            <button
              :class="['pill-btn', { active: diffCategoryFilter === 'data' }]"
              @click="diffCategoryFilter = 'data'"
            >
              数据 ({{ diffStats.dataCount }})
            </button>
            <button
              v-if="diffStats.descCount > 0"
              :class="['pill-btn', { active: diffCategoryFilter === 'description' }]"
              @click="diffCategoryFilter = 'description'"
            >
              注释 ({{ diffStats.descCount }})
            </button>
          </div>
          <input
            v-model="diffSearchQuery"
            type="text"
            class="diff-filter-input"
            placeholder="过滤字段路径或数值..."
          />
        </div>
      </div>

      <!-- 比对主体表格 -->
      <div class="diff-body">
        <div v-if="isDiffLoading" class="diff-loading-state">
          <p>正在读取快照数据并进行比对，请稍候...</p>
        </div>

        <div v-else-if="diffStats.total === 0" class="empty-diff">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke="#10b981"
            stroke-width="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p class="empty-title">两版本内容完全一致</p>
          <p class="empty-sub">未发现任何配置参数或中文字段描述的差异。</p>
        </div>

        <div v-else class="table-container">
          <table class="diff-table">
            <thead>
              <tr>
                <th width="76">变动</th>
                <th width="80">分类</th>
                <th width="260">字段路径</th>
                <th>基准值 (A)</th>
                <th>对比值 (B)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in filteredDiffItems"
                :key="`${item.category}:${item.path}`"
                :class="item.type"
              >
                <td>
                  <span :class="['type-pill', item.type]">
                    {{ item.type === 'modify' ? '修改' : item.type === 'add' ? '新增' : '删除' }}
                  </span>
                </td>
                <td>
                  <span :class="['category-pill', item.category]">
                    {{ item.category === 'description' ? '// 注释' : '数据' }}
                  </span>
                </td>
                <td>
                  <code class="path-code" :title="item.path">
                    {{ item.path }}
                  </code>
                </td>
                <td class="old-val">
                  <code>{{ formatVal(item.oldValue) }}</code>
                </td>
                <td class="new-val">
                  <code>{{ formatVal(item.newValue) }}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 比对底部操作栏 -->
      <footer class="modal-footer diff-footer">
        <div class="footer-left">
          <span class="compare-mode-tag">
            {{
              diffSourceB === '__CURRENT__'
                ? '对比模式: 历史快照 与 当前配置'
                : '对比模式: 两个历史快照之间'
            }}
          </span>
        </div>
        <div class="footer-right">
          <button class="btn secondary" @click="dialogMode = 'list'">← 返回快照列表</button>
          <button
            v-if="diffSourceA !== '__CURRENT__'"
            class="btn primary"
            :title="`将文件还原到基准快照 (${getSnapshotShortName(diffSourceA)})`"
            @click="confirmRestore(diffSourceA)"
          >
            从基准快照 (A) 恢复
          </button>
          <button
            v-if="diffSourceB !== '__CURRENT__'"
            class="btn primary"
            :title="`将文件还原到对比快照 (${getSnapshotShortName(diffSourceB)})`"
            @click="confirmRestore(diffSourceB)"
          >
            从目标快照 (B) 恢复
          </button>
          <button class="btn secondary" @click="closeModal">关闭</button>
        </div>
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
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-main);
  transition:
    width 0.2s ease,
    height 0.2s ease;
}

/* 列表模式 */
.modal-card.list-mode {
  width: 580px;
  max-width: 92vw;
}

/* 比对模式 */
.modal-card.diff-mode {
  width: 1040px;
  max-width: 95vw;
  height: 86vh;
}

.modal-header {
  padding: 12px 18px;
  background: var(--bg-drawer-header);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-main h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main);
  font-weight: 600;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-tool-secondary {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 5px 11px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-tool-secondary:hover {
  background: var(--bg-btn-hover);
  border-color: var(--border-focus);
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

.modal-body {
  padding: 14px 20px;
  max-height: 420px;
  overflow-y: auto;
}

/* 中文备注输入条 */
.create-memo-banner {
  background: var(--bg-input);
  border: 1px solid var(--border-focus);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.memo-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.memo-prompt {
  font-size: 11px;
  font-weight: 600;
  color: #38bdf8;
}
.btn-memo-close {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 13px;
  border-radius: 4px;
}
.btn-memo-close:hover {
  color: var(--text-main);
  background: var(--bg-btn-hover);
}
.memo-input-row {
  display: flex;
  gap: 8px;
}
.memo-text-input {
  flex: 1;
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-main);
  outline: none;
}
.memo-text-input:focus {
  border-color: var(--border-focus);
}
.btn-memo-submit {
  padding: 6px 14px;
  font-size: 12px;
  white-space: nowrap;
}

.empty {
  text-align: center;
  padding: 30px;
  color: var(--text-dim);
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
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.1s;
}
.backup-list li:hover {
  background: var(--bg-btn-hover);
  border-color: var(--border-focus);
}
.backup-list li.active {
  background: var(--bg-row-selected);
  border-color: var(--border-focus);
}

.b-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.b-time-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.b-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}
.b-memo-pill {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}
.b-memo-pill:hover {
  background: rgba(245, 158, 11, 0.28);
  border-color: #f59e0b;
}
.btn-inline-add-memo {
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-dim);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-inline-add-memo:hover {
  border-color: #f59e0b;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}
.b-path {
  font-size: 11px;
  color: var(--text-code);
  font-family: monospace;
}

/* 行内备注编辑条 */
.b-memo-inline-edit {
  margin-top: 6px;
  padding: 6px 8px;
  background: var(--bg-modal);
  border: 1px solid var(--border-focus);
  border-radius: 5px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
.memo-inline-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-main);
  outline: none;
}
.memo-inline-input:focus {
  border-color: var(--border-focus);
}
.inline-edit-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-memo-confirm {
  background: #0284c7;
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-memo-confirm:hover:not(:disabled) {
  background: #0369a1;
}
.btn-memo-cancel {
  background: transparent;
  color: var(--text-dim);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-memo-cancel:hover {
  color: var(--text-main);
  background: var(--bg-btn-hover);
}

.b-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-row-memo {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-row-memo:hover {
  background: rgba(245, 158, 11, 0.18);
  border-color: #f59e0b;
  color: #f59e0b;
}
.btn-row-diff {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-row-diff:hover {
  background: #0284c7;
  border-color: #38bdf8;
  color: white;
}
.selected-mark {
  color: var(--text-highlight);
  font-size: 12px;
  font-weight: 700;
}

.modal-footer {
  padding: 12px 20px;
  background: var(--bg-drawer-header);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
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
.btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn.primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: var(--bg-btn);
  border-color: var(--border-subtle);
  color: var(--text-dim);
}

/* ─── Diff 视窗专用样式 ─── */
.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
}
.diff-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.btn-back {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.btn-back:hover {
  background: var(--bg-btn-hover);
}
.diff-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.diff-selectors {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 720px;
}
.selector-group {
  display: flex;
  align-items: center;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px 6px;
  flex: 1;
  min-width: 0;
}
.selector-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 6px;
  flex-shrink: 0;
}
.selector-tag.base {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
.selector-tag.target {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.diff-select {
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 12px;
  width: 100%;
  outline: none;
  cursor: pointer;
  text-overflow: ellipsis;
}
.diff-select option {
  background: var(--bg-modal);
  color: var(--text-main);
}
.btn-swap {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.btn-swap:hover {
  background: var(--bg-btn-hover);
  border-color: var(--border-focus);
}
.btn-close-diff {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.btn-close-diff:hover {
  color: var(--text-main);
  background: var(--bg-btn-hover);
}

/* 差异子工具栏 */
.diff-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-subbar);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.sub-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.sub-badge.total {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
}
.stat-mini {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.stat-mini.mod {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}
.stat-mini.add {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.stat-mini.del {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
.stat-mini.desc {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.sub-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.filter-pills {
  display: flex;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  overflow: hidden;
}
.pill-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.1s;
}
.pill-btn.active {
  background: #2563eb;
  color: white;
  font-weight: 600;
}
.diff-filter-input {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  color: var(--text-main);
  padding: 3px 8px;
  font-size: 11px;
  outline: none;
  width: 170px;
}
.diff-filter-input:focus {
  border-color: var(--border-focus);
}

/* 差异内容主体与表格 */
.diff-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.table-container {
  flex: 1;
  overflow-y: auto;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.diff-table th {
  position: sticky;
  top: 0;
  background: var(--bg-table-header, var(--bg-drawer-header));
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-muted);
  font-weight: 600;
  z-index: 10;
}
.diff-table td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.05));
  vertical-align: middle;
}
.diff-table tr:hover {
  background: var(--bg-btn-hover);
}

.type-pill {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.type-pill.modify {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}
.type-pill.add {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.type-pill.delete {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.category-pill {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}
.category-pill.data {
  background: var(--bg-btn);
  color: var(--text-dim);
}
.category-pill.description {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.path-code {
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--text-code);
  word-break: break-all;
}
.old-val code {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'Consolas', 'Fira Code', monospace;
  word-break: break-all;
}
.new-val code {
  color: #10b981;
  background: rgba(16, 185, 129, 0.08);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'Consolas', 'Fira Code', monospace;
  word-break: break-all;
}

.empty-diff {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-dim);
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #10b981;
  margin: 12px 0 4px;
}
.empty-sub {
  font-size: 12px;
  color: var(--text-dim);
}

.diff-loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 13px;
}

.compare-mode-tag {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
