<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import type { JsonValue } from '@shared/utils/json-path'
import { escapeHtml, highlightMatch, matchTextOrPinyin } from '@shared/utils/pinyin'

const doc = useJsonDocStore()

export interface TreeRowItem {
  path: string
  keyName: string
  depth: number
  value: unknown
  type: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'
  isContainer: boolean
  childCount?: number
  isExpanded: boolean
  description?: string
  isModified: boolean
  parentIsArray: boolean
}

// 正在就地重命名键名
const renamingPath = ref<string | null>(null)
const renameDraft = ref('')

// 正在就地编辑描述
const editingDescPath = ref<string | null>(null)
const descDraft = ref('')

function inferType(val: unknown): TreeRowItem['type'] {
  if (val === null || val === undefined) return 'null'
  if (Array.isArray(val)) return 'array'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return 'number'
  if (typeof val === 'string') return 'string'
  if (typeof val === 'object') return 'object'
  return 'string'
}

/** 深度遍历生成平铺行列表 (依据 expandedPaths，或在搜索模式下全量穿透) */
function buildRows(
  obj: unknown,
  currentPath: string,
  depth: number,
  parentIsArray: boolean,
  rows: TreeRowItem[],
  forceAll = false,
) {
  if (depth > 60 || obj === null || typeof obj !== 'object') return

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const childVal = obj[i]
      const childPath = currentPath ? `${currentPath}.${i}` : String(i)
      const t = inferType(childVal)
      const isCont = t === 'array' || t === 'object'
      const isExp = doc.expandedPaths.has(childPath)
      const desc = doc.descriptions[childPath]
      const mod = doc.isPathModified(childPath)
      const childCount = isCont
        ? Array.isArray(childVal)
          ? childVal.length
          : Object.keys(childVal as object).length
        : undefined

      rows.push({
        path: childPath,
        keyName: String(i),
        depth,
        value: childVal,
        type: t,
        isContainer: isCont,
        childCount,
        isExpanded: isExp,
        description: desc,
        isModified: mod,
        parentIsArray: true,
      })

      if (isCont && (forceAll || isExp)) {
        buildRows(childVal, childPath, depth + 1, t === 'array', rows, forceAll)
      }
    }
  } else {
    const keys = Object.keys(obj)
    for (const k of keys) {
      const childVal = (obj as Record<string, unknown>)[k]
      const childPath = currentPath ? `${currentPath}.${k}` : k
      const t = inferType(childVal)
      const isCont = t === 'array' || t === 'object'
      const isExp = doc.expandedPaths.has(childPath)
      const desc = doc.descriptions[childPath]
      const mod = doc.isPathModified(childPath)
      const childCount = isCont
        ? Array.isArray(childVal)
          ? childVal.length
          : Object.keys(childVal as object).length
        : undefined

      rows.push({
        path: childPath,
        keyName: k,
        depth,
        value: childVal,
        type: t,
        isContainer: isCont,
        childCount,
        isExpanded: isExp,
        description: desc,
        isModified: mod,
        parentIsArray: false,
      })

      if (isCont && (forceAll || isExp)) {
        buildRows(childVal, childPath, depth + 1, t === 'array', rows, forceAll)
      }
    }
  }
}

function checkRowMatch(r: TreeRowItem, q: string, scope: 'all' | 'key' | 'desc' | 'val'): boolean {
  if (!q) return false
  const matchKey = () =>
    matchTextOrPinyin(r.keyName, q).matched || matchTextOrPinyin(r.path, q).matched
  const matchDesc = () => Boolean(r.description && matchTextOrPinyin(r.description, q).matched)
  const matchVal = () =>
    r.value !== null && typeof r.value !== 'object' && matchTextOrPinyin(String(r.value), q).matched

  if (scope === 'key') return matchKey()
  if (scope === 'desc') return matchDesc()
  if (scope === 'val') return matchVal()
  // 'all'
  return matchKey() || matchDesc() || matchVal()
}

const allRows = computed<TreeRowItem[]>(() => {
  if (doc.current === null) return []
  const list: TreeRowItem[] = []
  buildRows(toRaw(doc.current), '', 0, Array.isArray(doc.current), list, false)
  return list
})

// 缓存全量搜索结果匹配路径
const matchedPaths = computed<string[]>(() => {
  const q = doc.searchQuery.trim()
  if (!q || doc.current === null) return []
  const allDocList: TreeRowItem[] = []
  buildRows(toRaw(doc.current), '', 0, Array.isArray(doc.current), allDocList, true)
  return allDocList.filter((r) => checkRowMatch(r, q, doc.searchScope)).map((r) => r.path)
})

const matchedPathSet = computed(() => new Set(matchedPaths.value))

// 及时同步匹配结果列表至 store 供顶栏计数器与步进定位消费
watch(
  matchedPaths,
  (paths) => {
    doc.updateSearchMatches(paths)
  },
  { immediate: true },
)

// 视图展示行：
// - 无搜索词：展示当前展开状态树 (allRows)
// - 搜索模式为 'tree' (全量树定位)：依然展示当前树形结构，配合高亮
// - 搜索模式为 'filter' (过滤列表)：全量穿透展开展示所有匹配项
const displayRows = computed<TreeRowItem[]>(() => {
  const q = doc.searchQuery.trim()
  if (!q) return allRows.value

  if (doc.searchMode === 'tree') {
    return allRows.value
  }

  // filter 过滤模式
  if (doc.current === null) return []
  const allDocList: TreeRowItem[] = []
  buildRows(toRaw(doc.current), '', 0, Array.isArray(doc.current), allDocList, true)
  return allDocList.filter((r) => checkRowMatch(r, q, doc.searchScope))
})

const activeSearchPath = computed(() => {
  if (!doc.searchQuery.trim() || doc.searchMatchPaths.length === 0) return null
  return doc.searchMatchPaths[doc.searchMatchIndex] || null
})

function selectRow(path: string) {
  doc.selectedPath = path
}

function startRename(row: TreeRowItem, e: Event) {
  e.stopPropagation()
  if (row.parentIsArray) return // 数组索引不可重命名
  renamingPath.value = row.path
  renameDraft.value = row.keyName
}

function commitRename(row: TreeRowItem) {
  if (!renamingPath.value) return
  const newName = renameDraft.value.trim()
  if (newName && newName !== row.keyName) {
    doc.renameNodeKey(row.path, newName)
  }
  renamingPath.value = null
}

function startEditDesc(row: TreeRowItem, e: Event) {
  e.stopPropagation()
  editingDescPath.value = row.path
  descDraft.value = row.description || ''
}

function commitEditDesc(row: TreeRowItem) {
  if (!editingDescPath.value) return
  doc.setNodeDescription(row.path, descDraft.value)
  editingDescPath.value = null
}

function updateStringVal(path: string, e: Event) {
  const val = (e.target as HTMLInputElement).value
  doc.setNodeValue(path, val, '修改文本值')
}

function updateNumberVal(path: string, e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const num = Number(raw)
  if (!Number.isNaN(num)) {
    doc.setNodeValue(path, num, '修改数字值')
  }
}

function toggleBool(path: string, currentVal: unknown) {
  doc.setNodeValue(path, !currentVal, '切换布尔值')
}

function openAddModal(row: TreeRowItem, e: Event) {
  e.stopPropagation()
  doc.showAddNodeModal = {
    parentPath: row.path,
    isArray: row.type === 'array',
  }
}

function openAddAtRoot() {
  doc.showAddNodeModal = {
    parentPath: '',
    isArray: Array.isArray(doc.current),
  }
}

function openRawEdit(row: TreeRowItem, e: Event) {
  e.stopPropagation()
  doc.showRawEditModal = {
    path: row.path,
    title: `编辑节点: ${row.path}`,
    jsonText: JSON.stringify(row.value, null, 2),
  }
}

function quickChangeType(row: TreeRowItem, newType: TreeRowItem['type']) {
  if (row.type === newType) return
  let defVal: JsonValue = ''
  if (newType === 'number') defVal = 0
  else if (newType === 'boolean') defVal = false
  else if (newType === 'null') defVal = null
  else if (newType === 'array') defVal = []
  else if (newType === 'object') defVal = {}
  doc.setNodeValue(row.path, defVal, `更改类型为 ${newType}`)
}

// ─── 高性能虚拟滚动内核 (支持万级节点 60fps 极速展开与滚动) ───
const ROW_HEIGHT = 34
const BUFFER = 6
const treeListRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

onMounted(() => {
  if (treeListRef.value) {
    viewportHeight.value = treeListRef.value.clientHeight || 600
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        viewportHeight.value = entry.contentRect.height
      }
    })
    observer.observe(treeListRef.value)
  }
})

const totalCount = computed(() => displayRows.value.length)
const totalHeight = computed(() => totalCount.value * ROW_HEIGHT)

const startIndex = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER)
})

const endIndex = computed(() => {
  const visible = Math.ceil(viewportHeight.value / ROW_HEIGHT)
  return Math.min(totalCount.value, startIndex.value + visible + BUFFER * 2)
})

const offsetY = computed(() => {
  return startIndex.value * ROW_HEIGHT
})

const visibleRows = computed(() => {
  return displayRows.value.slice(startIndex.value, endIndex.value)
})

const changeCount = computed(() => doc.totalChangesCount)

const flashNavPath = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => doc.navTargetTrigger,
  async (trigger) => {
    if (!trigger || !treeListRef.value) return
    await nextTick()
    const idx = displayRows.value.findIndex((r) => r.path === trigger.path)
    if (idx !== -1) {
      const targetTop = Math.max(0, idx * ROW_HEIGHT - viewportHeight.value / 2 + ROW_HEIGHT / 2)
      treeListRef.value.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      })
      flashNavPath.value = trigger.path
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => {
        flashNavPath.value = null
      }, 1800)
    }
  },
  { deep: true },
)

const flashSearchPath = ref<string | null>(null)
let flashSearchTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => doc.searchTargetTrigger,
  async (trigger) => {
    if (!trigger || !treeListRef.value) return
    await nextTick()
    const idx = displayRows.value.findIndex((r) => r.path === trigger.path)
    if (idx !== -1) {
      const targetTop = Math.max(0, idx * ROW_HEIGHT - viewportHeight.value / 2 + ROW_HEIGHT / 2)
      treeListRef.value.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      })
      flashSearchPath.value = trigger.path
      if (flashSearchTimer) clearTimeout(flashSearchTimer)
      flashSearchTimer = setTimeout(() => {
        flashSearchPath.value = null
      }, 1800)
    }
  },
  { deep: true },
)
</script>

<template>
  <div class="visual-tree-container">
    <!-- 统一二级子工具条 (38px, 全模式严格对齐) -->
    <div class="sub-toolbar">
      <div class="sub-left">
        <span class="sub-title">🌲 树形模式</span>
        <span class="sub-badge">{{ displayRows.length }} 节点</span>
        <button
          v-if="changeCount > 0"
          class="unified-change-badge clickable"
          :title="`当前共有 ${changeCount} 处未保存改动。点击依次跳转到下一个改动位置 (快捷键: F7)`"
          @click="doc.jumpToNextChange()"
        >
          <span class="badge-dot">●</span>
          <span class="badge-text">{{ doc.changeNavText }}</span>
          <span class="badge-arrow">➔</span>
        </button>
        <span v-if="doc.searchQuery" class="sub-filter-hint">
          (已检索到 {{ doc.searchMatchCount }} 处 ·
          {{ doc.searchMode === 'filter' ? '过滤模式' : '全量树定位' }})
        </span>
      </div>
      <div class="sub-right">
        <button class="sub-tool-btn" title="展开所有嵌套对象与数组" @click="doc.expandAll">
          展开全部
        </button>
        <button class="sub-tool-btn" title="折叠所有嵌套对象与数组" @click="doc.collapseAll">
          折叠全部
        </button>
        <button class="sub-tool-btn highlight" title="在根节点添加新属性" @click="openAddAtRoot">
          ➕ 根属性
        </button>
      </div>
    </div>

    <div v-if="allRows.length === 0" class="empty-state">
      <p>当前 JSON 根对象为空</p>
      <button class="primary-btn" @click="openAddAtRoot">➕ 添加根节点属性</button>
    </div>

    <!-- 虚拟滚动容器: 仅渲染当前视口 30~40 行，彻底根除万级节点展开时的卡死问题 -->
    <div v-else ref="treeListRef" class="tree-list" @scroll="onScroll">
      <div class="virtual-spacer" :style="{ height: `${totalHeight}px`, position: 'relative' }">
        <div :style="{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }">
          <!-- 列表行 -->
          <div
            v-for="row in visibleRows"
            :key="row.path"
            class="tree-row"
            :class="{
              selected: doc.selectedPath === row.path,
              modified: row.isModified,
              'nav-target-flash': flashNavPath === row.path,
              'search-target-flash': flashSearchPath === row.path,
              'active-search-match': activeSearchPath === row.path,
              'tree-search-match': doc.searchMode === 'tree' && matchedPathSet.has(row.path),
            }"
            :data-path="row.path"
            @click="selectRow(row.path)"
          >
            <!-- 层级缩进占位 -->
            <div class="indent-block" :style="{ width: `${row.depth * 22}px` }">
              <span
                v-for="d in row.depth"
                :key="d"
                class="guide-line"
                :style="{ left: `${(d - 1) * 22 + 8}px` }"
              />
            </div>

            <!-- 展开 / 折叠小箭头 -->
            <button
              v-if="row.isContainer"
              class="caret-btn"
              @click.stop="doc.toggleExpanded(row.path)"
            >
              {{ row.isExpanded ? '▼' : '▶' }}
            </button>
            <span v-else class="caret-placeholder" />

            <!-- 键名 Key 区域 -->
            <div class="key-section">
              <!-- 重命名输入框 -->
              <input
                v-if="renamingPath === row.path"
                v-model="renameDraft"
                class="rename-input"
                autofocus
                @click.stop
                @keydown.enter="commitRename(row)"
                @keydown.esc="renamingPath = null"
                @blur="commitRename(row)"
              />
              <span
                v-else
                class="key-name"
                :class="{ isIndex: row.parentIsArray }"
                :title="`完整路径: ${row.path} (双击重命名键名)`"
                @dblclick="startRename(row, $event)"
                v-html="
                  doc.searchQuery && (doc.searchScope === 'all' || doc.searchScope === 'key')
                    ? highlightMatch(row.keyName, doc.searchQuery)
                    : escapeHtml(row.keyName)
                "
              />
              <span
                v-if="doc.searchQuery && row.path !== row.keyName"
                class="search-path-hint"
                :title="`所在路径: ${row.path}`"
                v-html="'[' + highlightMatch(row.path, doc.searchQuery) + ']'"
              />
              <span class="colon">:</span>
            </div>

            <!-- 类型选择下拉框 (可自由切换数据类型) -->
            <div class="type-selector-wrapper" @click.stop>
              <select
                :value="row.type"
                class="type-select-dropdown"
                :class="row.type"
                :title="`当前类型: ${row.type} (点击下拉可切换为其他数据类型)`"
                @change="
                  doc.changeNodeType(row.path, ($event.target as HTMLSelectElement).value as any)
                "
              >
                <option value="string">str 文本</option>
                <option value="number">num 数字</option>
                <option value="boolean">bool 布尔</option>
                <option value="array">arr 数组</option>
                <option value="object">obj 对象</option>
                <option value="null">null 空值</option>
              </select>
            </div>

            <!-- 中文描述胶囊 -->
            <div class="desc-section">
              <!-- 编辑描述状态 -->
              <div v-if="editingDescPath === row.path" class="desc-editor-inline" @click.stop>
                <input
                  v-model="descDraft"
                  class="desc-input"
                  placeholder="输入中文描述/备注..."
                  autofocus
                  @keydown.enter="commitEditDesc(row)"
                  @keydown.esc="editingDescPath = null"
                  @blur="commitEditDesc(row)"
                />
              </div>
              <span
                v-else-if="row.description"
                class="desc-pill"
                :title="`中文描述: ${row.description} (点击修改)`"
                @click="startEditDesc(row, $event)"
              >
                📝
                <span
                  v-html="
                    doc.searchQuery && (doc.searchScope === 'all' || doc.searchScope === 'desc')
                      ? highlightMatch(row.description, doc.searchQuery)
                      : escapeHtml(row.description)
                  "
                />
              </span>
              <button
                v-else
                class="add-desc-hover"
                title="为此字段添加中文说明"
                @click="startEditDesc(row, $event)"
              >
                + 描述
              </button>
            </div>

            <!-- 值编辑控件 -->
            <div class="val-section" @click.stop>
              <!-- 布尔值切换 -->
              <label v-if="row.type === 'boolean'" class="bool-toggle">
                <input
                  type="checkbox"
                  :checked="row.value === true"
                  @change="toggleBool(row.path, row.value)"
                />
                <span class="switch-slider" />
                <span class="bool-text">{{ row.value ? 'true' : 'false' }}</span>
              </label>

              <!-- 数字输入框 -->
              <input
                v-else-if="row.type === 'number'"
                type="number"
                class="val-input num-input"
                step="any"
                :value="row.value"
                @change="updateNumberVal(row.path, $event)"
              />

              <!-- 文本输入框 -->
              <input
                v-else-if="row.type === 'string'"
                type="text"
                class="val-input str-input"
                :value="row.value"
                @change="updateStringVal(row.path, $event)"
              />

              <!-- Null 徽标 -->
              <span v-else-if="row.type === 'null'" class="null-tag">null</span>

              <!-- 容器子项提示 -->
              <span v-else-if="row.type === 'array'" class="container-summary">
                [ {{ row.childCount }} 项 ]
              </span>
              <span v-else-if="row.type === 'object'" class="container-summary">
                { {{ row.childCount }} 个属性 }
              </span>
            </div>

            <!-- 改动小圆点标记 -->
            <span v-if="row.isModified" class="mod-dot" title="该字段已被修改">●</span>

            <!-- 悬浮操作胶囊栏 (带清晰汉字说明) -->
            <div class="row-actions" @click.stop>
              <button
                class="act-btn"
                title="上移一行 (调整在 JSON 中的次序)"
                @click="doc.moveNode(row.path, 'up')"
              >
                ▲ 上移
              </button>
              <button
                class="act-btn"
                title="下移一行 (调整在 JSON 中的次序)"
                @click="doc.moveNode(row.path, 'down')"
              >
                ▼ 下移
              </button>
              <button
                v-if="row.isContainer"
                class="act-btn highlight"
                :title="row.type === 'array' ? '追加数组子项' : '添加子属性'"
                @click="openAddModal(row, $event)"
              >
                ➕ 添加
              </button>
              <button
                class="act-btn"
                title="以 Raw JSON 代码直接编辑此节点内容"
                @click="openRawEdit(row, $event)"
              >
                📝 代码
              </button>
              <button
                class="act-btn danger"
                title="删除此节点 (可 Ctrl+Z 撤销)"
                @click="doc.deleteNode(row.path)"
              >
                🗑 删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.visual-tree-container {
  flex: 1;
  overflow: hidden;
  background: #141417;
  color: #e2e8f0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 统一二级子工具条 (38px) */
.sub-toolbar {
  height: 38px;
  background: #1a1a20;
  border-bottom: 1px solid #282832;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  flex-shrink: 0;
  user-select: none;
}
.sub-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}
.sub-badge {
  background: #252530;
  color: #cbd5e1;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  border: 1px solid #363644;
}

/* 全模式统一的改动徽章 (支持交互点击跳转) */
.unified-change-badge {
  background: rgba(245, 158, 11, 0.16);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.45);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.unified-change-badge.clickable {
  cursor: pointer;
  user-select: none;
}
.unified-change-badge.clickable:hover {
  background: rgba(245, 158, 11, 0.28);
  border-color: rgba(245, 158, 11, 0.85);
  color: #fef08a;
  transform: translateY(-1px);
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
}
.unified-change-badge.clickable:active {
  transform: translateY(0);
}
.badge-dot {
  color: #f59e0b;
  font-size: 9px;
  animation: badgeDotPulse 2s infinite ease-in-out;
}
.badge-arrow {
  font-size: 9px;
  opacity: 0.75;
}
@keyframes badgeDotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.85);
  }
}

/* 目标定位脉冲高亮 */
.tree-row.nav-target-flash {
  animation: navPulse 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  z-index: 5;
}
@keyframes navPulse {
  0% {
    background: rgba(245, 158, 11, 0.38) !important;
    outline: 2px solid rgba(245, 158, 11, 1);
    box-shadow:
      inset 0 0 12px rgba(245, 158, 11, 0.5),
      0 0 12px rgba(245, 158, 11, 0.4);
  }
  60% {
    background: rgba(245, 158, 11, 0.2) !important;
    outline: 2px solid rgba(245, 158, 11, 0.7);
    box-shadow: inset 0 0 6px rgba(245, 158, 11, 0.3);
  }
  100% {
    background: inherit;
    outline: 1px solid transparent;
    box-shadow: none;
  }
}

/* 搜索关键词荧光高亮 (无论在 keyName 还是 description 中) */
:deep(mark.search-kw) {
  background: rgba(250, 204, 21, 0.45);
  color: #fef08a;
  border-radius: 2px;
  padding: 0 1px;
  font-weight: 700;
  box-shadow: 0 0 4px rgba(250, 204, 21, 0.3);
}

/* 全景树模式下命中的行样式 */
.tree-row.tree-search-match {
  background: rgba(234, 179, 8, 0.08);
  border-left: 2px solid #eab308;
}

/* 当前焦点选中的搜索命中行 */
.tree-row.active-search-match {
  background: rgba(59, 130, 246, 0.22) !important;
  outline: 1px solid #3b82f6;
  border-left: 3px solid #60a5fa;
}

/* 搜索定位跳转瞬间波浪脉冲动画 */
.tree-row.search-target-flash {
  animation: searchFlashPulse 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  z-index: 5;
}
@keyframes searchFlashPulse {
  0% {
    background: rgba(59, 130, 246, 0.45) !important;
    outline: 2px solid #60a5fa;
    box-shadow:
      inset 0 0 14px rgba(59, 130, 246, 0.6),
      0 0 14px rgba(59, 130, 246, 0.4);
  }
  60% {
    background: rgba(59, 130, 246, 0.22) !important;
    outline: 2px solid rgba(96, 165, 250, 0.8);
    box-shadow: inset 0 0 6px rgba(59, 130, 246, 0.3);
  }
  100% {
    background: inherit;
    outline: 1px solid transparent;
    box-shadow: none;
  }
}

.sub-filter-hint {
  font-size: 11px;
  color: #3b82f6;
  font-style: italic;
}
.sub-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sub-tool-btn {
  background: #262632;
  border: 1px solid #383848;
  color: #cbd5e1;
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.1s;
}
.sub-tool-btn:hover {
  background: #333342;
  color: #fff;
  border-color: #4c4c60;
}
.sub-tool-btn.highlight {
  background: #1e3a8a;
  border-color: #2563eb;
  color: #93c5fd;
}
.sub-tool-btn.highlight:hover {
  background: #2563eb;
  color: #fff;
}

.empty-state {
  margin: auto;
  text-align: center;
  padding: 60px;
  color: #64748b;
}
.primary-btn {
  background: #2563eb;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 12px;
  font-weight: 500;
}

.tree-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-row {
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid #1e1e26;
  font-size: 13px;
  height: 34px;
  min-height: 34px;
  max-height: 34px;
  box-sizing: border-box;
  gap: 8px;
  transition: background 0.1s;
  cursor: default;
  background: #141417;
  overflow: hidden;
}

.tree-row:hover {
  background: #1c1c24;
}
.tree-row.selected {
  background: #1e293b !important;
  border-left: 3px solid #3b82f6;
}
.tree-row.modified {
  background: rgba(245, 158, 11, 0.08);
}
.tree-row.modified.selected {
  background: rgba(245, 158, 11, 0.16) !important;
}

/* 缩进导线 */
.indent-block {
  position: relative;
  flex-shrink: 0;
  height: 100%;
}
.guide-line {
  position: absolute;
  top: -8px;
  bottom: -8px;
  width: 1px;
  background: #282834;
}

/* 展开箭头 */
.caret-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 10px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 3px;
  flex-shrink: 0;
}
.caret-btn:hover {
  background: #282834;
  color: #e2e8f0;
}
.caret-placeholder {
  width: 18px;
  flex-shrink: 0;
}

/* Key 键名 */
.key-section {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.key-name {
  font-family: 'Consolas', 'Monaco', monospace;
  font-weight: 600;
  color: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
}
.key-name:hover {
  background: #282834;
}
.key-name.isIndex {
  color: #60a5fa;
  font-style: italic;
}
.search-path-hint {
  font-size: 10.5px;
  color: #38bdf8;
  opacity: 0.85;
  margin-left: 4px;
  font-family: 'Consolas', monospace;
  background: rgba(56, 189, 248, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(56, 189, 248, 0.25);
}
.colon {
  color: #64748b;
  font-weight: bold;
}
.rename-input {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: #1c1c24;
  color: #f1f5f9;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  outline: none;
  width: 110px;
}

/* 类型选择下拉框 (深色现代样式) */
.type-selector-wrapper {
  display: flex;
  align-items: center;
}
.type-select-dropdown {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  outline: none;
  cursor: pointer;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  font-family: inherit;
  transition: all 0.1s;
}
.type-select-dropdown:hover {
  border-color: #64748b;
}
.type-select-dropdown.string {
  background: #1e3a5f;
  color: #93c5fd;
}
.type-select-dropdown.number {
  background: #064e3b;
  color: #6ee7b7;
}
.type-select-dropdown.boolean {
  background: #4c1d95;
  color: #d8b4fe;
}
.type-select-dropdown.array {
  background: #7c2d12;
  color: #fdba74;
}
.type-select-dropdown.object {
  background: #134e4a;
  color: #5eead4;
}
.type-select-dropdown.null {
  background: #27272a;
  color: #a1a1aa;
}

/* 描述胶囊 */
.desc-section {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.desc-pill {
  background: #2e2612;
  color: #fde047;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #5a4515;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.desc-pill:hover {
  background: #423617;
  border-color: #85631b;
}
.add-desc-hover {
  background: transparent;
  border: 1px dashed #475569;
  color: #64748b;
  border-radius: 12px;
  font-size: 10px;
  padding: 1px 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;
}
.tree-row:hover .add-desc-hover {
  opacity: 1;
}
.add-desc-hover:hover {
  border-color: #3b82f6;
  color: #60a5fa;
  background: #172554;
}
.desc-input {
  font-size: 12px;
  padding: 2px 6px;
  background: #1e1e26;
  color: #f1f5f9;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  outline: none;
  width: 160px;
}

/* 值输入区域 */
.val-section {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 120px;
}
.val-input {
  padding: 3px 8px;
  border: 1px solid #333342;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  font-family: 'Consolas', monospace;
  background: #1b1b22;
  color: #f1f5f9;
  transition: border-color 0.15s;
}
.val-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
.str-input {
  width: 100%;
  max-width: 320px;
  color: #86efac;
}
.num-input {
  width: 130px;
  color: #38bdf8;
}

/* 布尔 Toggle */
.bool-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.bool-toggle input {
  display: none;
}
.switch-slider {
  width: 28px;
  height: 16px;
  background: #334155;
  border-radius: 16px;
  position: relative;
  transition: background 0.2s;
}
.switch-slider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}
.bool-toggle input:checked + .switch-slider {
  background: #3b82f6;
}
.bool-toggle input:checked + .switch-slider::before {
  transform: translateX(12px);
}
.bool-text {
  font-family: monospace;
  font-size: 12px;
  color: #c084fc;
  font-weight: 600;
}

.null-tag {
  color: #64748b;
  font-family: monospace;
  font-style: italic;
  font-size: 12px;
}
.container-summary {
  color: #64748b;
  font-size: 11px;
  font-family: monospace;
}

.mod-dot {
  color: #f59e0b;
  font-size: 12px;
  margin-right: 4px;
}

/* 悬浮操作栏 */
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.1s;
  margin-left: auto;
}
.tree-row:hover .row-actions {
  opacity: 1;
}
.act-btn {
  background: #24242f;
  border: 1px solid #363646;
  color: #cbd5e1;
  border-radius: 4px;
  padding: 2px 7px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.1s;
}
.act-btn:hover {
  background: #323242;
  color: #fff;
  border-color: #4b4b60;
}
.act-btn.highlight:hover {
  background: #1e3a8a;
  color: #93c5fd;
  border-color: #2563eb;
}
.act-btn.danger:hover {
  background: #450a0a;
  color: #fca5a5;
  border-color: #7f1d1d;
}
</style>
