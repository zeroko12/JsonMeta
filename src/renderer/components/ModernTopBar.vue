<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const searchInput = ref<HTMLInputElement | null>(null)
const scopeDropdownRef = ref<HTMLElement | null>(null)
const showScopeMenu = ref(false)

const scopeLabel = computed(() => {
  switch (doc.searchScope) {
    case 'key':
      return '仅键名 (Key & 路径)'
    case 'desc':
      return '仅描述 (中文说明)'
    case 'val':
      return '仅数值 (Value 数据)'
    default:
      return '全部范围'
  }
})

const scopeShortLabel = computed(() => {
  switch (doc.searchScope) {
    case 'key':
      return '键名'
    case 'desc':
      return '描述'
    case 'val':
      return '数值'
    default:
      return '全部'
  }
})

const inputPlaceholder = computed(() => {
  if (doc.searchScope === 'desc') return '搜描述...'
  if (doc.searchScope === 'key') return '搜键名...'
  if (doc.searchScope === 'val') return '搜数值...'
  return '搜索 (Ctrl+F)...'
})

function toggleScopeMenu(e: Event) {
  e.stopPropagation()
  showScopeMenu.value = !showScopeMenu.value
}

function selectScope(scope: 'all' | 'key' | 'desc' | 'val') {
  doc.searchScope = scope
  showScopeMenu.value = false
  searchInput.value?.focus()
}

function handleSearchEnter(e: KeyboardEvent) {
  e.preventDefault()
  if (e.shiftKey) {
    doc.prevSearchMatch()
  } else {
    doc.nextSearchMatch()
  }
}

const showRecentMenu = ref(false)
const recentDropdownRef = ref<HTMLElement | null>(null)

function getFileName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

function openRecent(p: string) {
  showRecentMenu.value = false
  void doc.openFile(p)
}

function clearRecent() {
  doc.clearRecentFiles()
  showRecentMenu.value = false
}

function handleDocClick(e: MouseEvent) {
  if (scopeDropdownRef.value && !scopeDropdownRef.value.contains(e.target as Node)) {
    showScopeMenu.value = false
  }
  if (recentDropdownRef.value && !recentDropdownRef.value.contains(e.target as Node)) {
    showRecentMenu.value = false
  }
}

function handleGlobalKey(e: KeyboardEvent) {
  const isCtrl = e.ctrlKey || e.metaKey
  // F7 或 Alt+N: 跳转到下一处改动
  if (e.key === 'F7' || (e.altKey && e.key.toLowerCase() === 'n')) {
    e.preventDefault()
    doc.jumpToNextChange()
  }
  // Ctrl+S: 保存
  if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void doc.saveFile()
  }
  // Ctrl+O: 打开
  if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    void doc.openFile()
  }
  // Ctrl+Z: 撤销
  if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    doc.undo()
  }
  // Ctrl+Y 或 Ctrl+Shift+Z: 重做
  if (
    (isCtrl && e.key.toLowerCase() === 'y') ||
    (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')
  ) {
    e.preventDefault()
    doc.redo()
  }
  // Ctrl+F: 搜索聚焦
  if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKey)
  document.addEventListener('click', handleDocClick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey)
  document.removeEventListener('click', handleDocClick)
})

const changeCount = computed(() => doc.totalChangesCount)
</script>

<template>
  <header class="modern-topbar">
    <!-- 左侧: 品牌 Logo + 固定尺寸的文件信息槽位 -->
    <div class="brand-section">
      <div class="logo">
        <span class="logo-icon">✨</span>
        <span class="logo-text">
          JSON
          <span class="highlight">Meta</span>
        </span>
      </div>

      <!-- 文件芯片: 弹性缩微防挤压 -->
      <div v-if="doc.hasFile" class="file-chip" :title="doc.filePath || '未命名文件'">
        <span class="file-icon">📄</span>
        <span class="file-name">{{ doc.fileName }}</span>
        <!-- 状态指示胶囊 -->
        <button
          v-if="doc.isDirty"
          class="file-status-badge dirty clickable"
          :title="`有 ${changeCount} 处未保存修改。点击跳转定位到下一个改动位置 (快捷键: F7)`"
          @click="doc.jumpToNextChange()"
        >
          <span class="dot" />
          <span class="status-label">{{ doc.changeNavText }}</span>
          <span class="jump-arrow">➔</span>
        </button>
        <span v-else class="file-status-badge" title="已同步保存">
          <span class="dot" />
          <span class="status-label">已存</span>
        </span>
      </div>
    </div>

    <!-- 中间: 核心操作区与视图切换 (紧凑微型布局) -->
    <div class="middle-section">
      <!-- 文件快捷按钮 -->
      <div ref="recentDropdownRef" class="btn-group open-btn-group">
        <button
          class="nav-btn"
          title="打开 JSON 文件 (Ctrl+O)"
          :disabled="doc.isLoading"
          @click="() => doc.openFile()"
        >
          📂 打开
        </button>
        <button
          v-if="doc.recentFiles.length > 0"
          class="nav-btn split-arrow-btn"
          title="最近打开的文件 (最多 3 个)"
          @click.stop="showRecentMenu = !showRecentMenu"
        >
          ▾
        </button>
        <button class="nav-btn" title="新建空白 JSON" @click="() => doc.newFile()">✨ 新建</button>

        <!-- 最近文件快捷弹出菜单 -->
        <Transition name="fade-popover">
          <div v-if="showRecentMenu && doc.recentFiles.length > 0" class="recent-popover">
            <div class="recent-popover-header">
              <span>🕒 最近打开的文件</span>
              <button class="clear-recent-mini" title="清空记录" @click.stop="clearRecent">
                清空
              </button>
            </div>
            <button
              v-for="p in doc.recentFiles"
              :key="p"
              class="recent-popover-item"
              :title="p"
              @click="openRecent(p)"
            >
              <span class="popover-file-icon">📄</span>
              <div class="popover-file-meta">
                <span class="popover-name">{{ getFileName(p) }}</span>
                <span class="popover-path">{{ p }}</span>
              </div>
            </button>
          </div>
        </Transition>
      </div>

      <!-- 历史撤销/重做 (精简为快捷微图标) -->
      <div v-if="doc.hasFile" class="btn-group">
        <button
          class="nav-btn icon-btn"
          :disabled="!doc.canUndo"
          title="撤销 (Ctrl+Z)"
          @click="doc.undo"
        >
          ↩
        </button>
        <button
          class="nav-btn icon-btn"
          :disabled="!doc.canRedo"
          title="重做 (Ctrl+Y)"
          @click="doc.redo"
        >
          ↪
        </button>
      </div>

      <!-- 视图模式三联切换 (紧凑标签) -->
      <div v-if="doc.hasFile" class="view-mode-tabs">
        <button
          class="mode-tab-btn"
          :class="{ active: doc.viewMode === 'visual' }"
          title="可视化树形结构视图"
          @click="doc.viewMode = 'visual'"
        >
          🌲 树形
        </button>
        <button
          class="mode-tab-btn"
          :class="{ active: doc.viewMode === 'code' }"
          title="JSON 源码编辑器"
          @click="doc.viewMode = 'code'"
        >
          📝 源码
        </button>
        <button
          class="mode-tab-btn tab-diff"
          :class="{ active: doc.viewMode === 'diff' }"
          title="审查会话内改动"
          @click="doc.viewMode = 'diff'"
        >
          ⚖️ 比对
          <!-- 悬浮角标 -->
          <span v-if="changeCount > 0" class="floating-badge">
            {{ changeCount > 99 ? '99+' : changeCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- 右侧: 全局搜索框 + 保存/备份动作组 (右侧网格对齐) -->
    <div class="right-section">
      <!-- 极简高能 5合1 搜索胶囊 -->
      <div v-if="doc.hasFile" class="search-capsule" :class="{ 'has-query': !!doc.searchQuery }">
        <!-- 范围微徽标与下拉菜单 -->
        <div ref="scopeDropdownRef" class="scope-dropdown-wrapper">
          <button
            class="scope-pill-btn"
            :title="`搜索范围: ${scopeLabel} (点击切换)`"
            @click="toggleScopeMenu"
          >
            <span class="scope-text">{{ scopeShortLabel }}</span>
            <span class="scope-arrow">▾</span>
          </button>

          <!-- 范围微浮层菜单 -->
          <Transition name="fade-popover">
            <div v-if="showScopeMenu" class="scope-menu-popover">
              <div class="popover-header">搜索匹配范围</div>
              <button
                class="scope-menu-item"
                :class="{ active: doc.searchScope === 'all' }"
                @click="selectScope('all')"
              >
                <span class="menu-icon">🌟</span>
                <span class="menu-title">全部范围</span>
                <span class="menu-desc">键/描述/值</span>
              </button>
              <button
                class="scope-menu-item"
                :class="{ active: doc.searchScope === 'key' }"
                @click="selectScope('key')"
              >
                <span class="menu-icon">🏷️</span>
                <span class="menu-title">仅键名</span>
                <span class="menu-desc">Key / 路径</span>
              </button>
              <button
                class="scope-menu-item"
                :class="{ active: doc.searchScope === 'desc' }"
                @click="selectScope('desc')"
              >
                <span class="menu-icon">📝</span>
                <span class="menu-title">仅描述</span>
                <span class="menu-desc">中文注释</span>
              </button>
              <button
                class="scope-menu-item"
                :class="{ active: doc.searchScope === 'val' }"
                @click="selectScope('val')"
              >
                <span class="menu-icon">🔢</span>
                <span class="menu-title">仅数值</span>
                <span class="menu-desc">配置值</span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- 搜索输入框 -->
        <input
          ref="searchInput"
          v-model="doc.searchQuery"
          type="text"
          class="capsule-input"
          :placeholder="inputPlaceholder"
          @keydown.enter="handleSearchEnter"
          @keydown.esc="doc.clearSearch()"
        />

        <!-- 当输入搜索词时，按需无缝展开的 IDE 级微控件组 -->
        <div v-if="doc.searchQuery" class="capsule-extra-controls">
          <!-- 命中序号与总数 1/8 -->
          <span
            class="match-counter"
            :class="{ 'zero-match': doc.searchMatchCount === 0 }"
            :title="`共匹配到 ${doc.searchMatchCount} 处`"
          >
            {{
              doc.searchMatchCount > 0
                ? `${doc.searchMatchIndex + 1}/${doc.searchMatchCount}`
                : '0/0'
            }}
          </span>

          <!-- 上一个 / 下一个导航箭头微按钮 -->
          <button
            class="micro-arrow-btn"
            :disabled="doc.searchMatchCount === 0"
            title="定位到上一个匹配项 (Shift+Enter)"
            @click="doc.prevSearchMatch()"
          >
            ▲
          </button>
          <button
            class="micro-arrow-btn"
            :disabled="doc.searchMatchCount === 0"
            title="定位到下一个匹配项 (Enter)"
            @click="doc.nextSearchMatch()"
          >
            ▼
          </button>

          <!-- 模式切换微按钮: 全量树定位 [⊞] / 过滤列表 [≡] -->
          <button
            class="mode-switch-btn"
            :class="{ 'is-tree': doc.searchMode === 'tree' }"
            :title="
              doc.searchMode === 'tree'
                ? '当前模式: 全量树定位 (点击切换为过滤列表)'
                : '当前模式: 过滤列表 (点击切换为全量树定位)'
            "
            @click="doc.toggleSearchMode()"
          >
            {{ doc.searchMode === 'tree' ? '⊞' : '≡' }}
          </button>

          <!-- 清空搜索按钮 -->
          <button class="clear-btn" title="清空搜索 (Esc)" @click="doc.clearSearch()">✕</button>
        </div>
      </div>

      <div v-if="doc.hasFile" class="actions-group">
        <button
          v-if="doc.filePath"
          class="tool-btn"
          title="历史备份版本管理"
          @click="doc.showBackupModal = true"
        >
          📦 备份
        </button>
        <button class="tool-btn" title="另存为新文件" @click="() => doc.saveAsFile()">
          另存为
        </button>
        <button
          class="save-btn"
          :class="{ active: doc.isDirty }"
          :disabled="!doc.isDirty || doc.isLoading"
          title="保存所有修改 (Ctrl+S)"
          @click="() => doc.saveFile()"
        >
          💾 保存
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* 顶栏: 采用 Flex 弹性流式排版，左右自适贴边，右侧保存组绝对永不折叠 */
.modern-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  background: #18181c;
  color: #e6e6ea;
  border-bottom: 1px solid #282830;
  padding: 0 10px;
  box-sizing: border-box;
  flex-shrink: 0;
  user-select: none;
  gap: 8px;
  overflow: visible;
}

/* 左侧品牌与文件 */
.brand-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.2px;
  white-space: nowrap;
}
.logo-icon {
  font-size: 15px;
}
.logo-text {
  color: #fff;
}
.highlight {
  color: #3b82f6;
}

/* 文件信息芯片: 弹性缩微自适应 */
.file-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #22222a;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid #32323e;
  font-size: 11px;
  max-width: 140px;
  min-width: 75px;
  box-sizing: border-box;
}
.file-icon {
  font-size: 11px;
  flex-shrink: 0;
}
.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: #e2e8f0;
}

/* 状态胶囊: 固定槽位防抖 */
.file-status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #1a2e1a;
  color: #4ade80;
  border: 1px solid #245224;
  flex-shrink: 0;
  font-family: inherit;
  transition: all 0.2s;
}
.file-status-badge .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #4ade80;
}
.file-status-badge.dirty {
  background: #3b280c;
  color: #fbbf24;
  border-color: #634212;
}
.file-status-badge.dirty .dot {
  background: #f59e0b;
  box-shadow: 0 0 5px #f59e0b;
}
.file-status-badge.clickable {
  cursor: pointer;
  user-select: none;
}
.file-status-badge.clickable:hover {
  background: rgba(245, 158, 11, 0.28);
  border-color: rgba(245, 158, 11, 0.85);
  color: #fef08a;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}
.file-status-badge.clickable:active {
  transform: translateY(0);
}
.jump-arrow {
  font-size: 8px;
  opacity: 0.75;
}

/* 中间操作与模式切换: 紧凑自适应微调 */
.middle-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 1;
  justify-content: center;
  min-width: 0;
}

.btn-group {
  display: flex;
  background: #22222a;
  border-radius: 5px;
  border: 1px solid #32323e;
  overflow: visible;
  flex-shrink: 0;
  position: relative;
}

.split-arrow-btn {
  padding: 3px 5px !important;
  font-size: 10px;
  border-left: 1px solid #32323e;
  border-right: 1px solid #32323e;
  color: #94a3b8;
}
.split-arrow-btn:hover {
  color: #fff;
  background: #2d2d38;
}

/* 最近文件快捷弹出菜单 */
.recent-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  background: #1e1e26;
  border: 1px solid #38384a;
  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.3);
  border-radius: 7px;
  padding: 6px;
  width: 250px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.recent-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10.5px;
  color: #64748b;
  font-weight: 600;
  padding: 2px 4px 5px;
  border-bottom: 1px solid #282836;
  margin-bottom: 2px;
}

.clear-recent-mini {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 10.5px;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;
  transition: all 0.1s;
}
.clear-recent-mini:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.recent-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 5px 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.1s;
  color: #e2e8f0;
}
.recent-popover-item:hover {
  background: #2a2a36;
  border-color: #3b82f6;
}

.popover-file-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.popover-file-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.popover-name {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popover-path {
  font-size: 10px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-btn {
  background: transparent;
  border: none;
  color: #cbd5e1;
  padding: 3px 7px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.nav-btn.icon-btn {
  padding: 3px 6px;
  font-size: 12px;
  line-height: 1;
  min-width: 25px;
  text-align: center;
}
.nav-btn:hover:not(:disabled) {
  background: #2d2d38;
  color: #fff;
}
.nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 模式切换 Tabs: 紧凑精简 */
.view-mode-tabs {
  display: flex;
  background: #111115;
  padding: 2px;
  border-radius: 5px;
  border: 1px solid #2a2a35;
  flex-shrink: 0;
}

.mode-tab-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-weight: 500;
  transition: all 0.15s;
  white-space: nowrap;
  position: relative;
  min-width: 60px;
  box-sizing: border-box;
}
.mode-tab-btn:hover {
  color: #f1f5f9;
}
.mode-tab-btn.active {
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}

/* 改动比对标签与其浮动小角标 (不影响标签本身尺寸) */
.tab-diff {
  position: relative;
}
.floating-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4444;
  color: white;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  box-shadow: 0 0 0 2px #18181c;
  pointer-events: none;
  animation: pulse-pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes pulse-pop {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 右侧操作区: flex-shrink: 0 强保永不折叠 */
.right-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ─── 极简高能 5合1 搜索胶囊 ─── */
.search-capsule {
  position: relative;
  display: flex;
  align-items: center;
  background: #202028;
  border: 1px solid #323240;
  border-radius: 6px;
  height: 28px;
  padding: 0 5px 0 3px;
  gap: 4px;
  width: 145px;
  box-sizing: border-box;
  flex-shrink: 0;
  transition:
    width 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.15s,
    box-shadow 0.15s;
}

.search-capsule:focus-within,
.search-capsule.has-query {
  width: 245px;
}

/* 范围下拉选择微徽标 */
.scope-dropdown-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.scope-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #282834;
  border: 1px solid #3a3a4c;
  color: #94a3b8;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;
  line-height: 1;
}

.scope-pill-btn:hover {
  background: #323242;
  color: #e2e8f0;
  border-color: #4b4b60;
}

.scope-text {
  font-weight: 500;
}

.scope-arrow {
  font-size: 9px;
  opacity: 0.7;
}

/* 范围弹出菜单微浮层 */
.scope-menu-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background: #1e1e26;
  border: 1px solid #38384a;
  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 6px;
  width: 190px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.popover-header {
  font-size: 10.5px;
  color: #64748b;
  font-weight: 600;
  padding: 3px 6px 5px 6px;
  border-bottom: 1px solid #282836;
  margin-bottom: 2px;
}

.scope-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 5px 7px;
  cursor: pointer;
  text-align: left;
  transition: all 0.1s;
}

.scope-menu-item:hover {
  background: #2a2a36;
}

.scope-menu-item.active {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.35);
}

.menu-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.menu-title {
  font-size: 12px;
  font-weight: 500;
  color: #e2e8f0;
}

.scope-menu-item.active .menu-title {
  color: #60a5fa;
  font-weight: 600;
}

.menu-desc {
  font-size: 10px;
  color: #64748b;
  margin-left: auto;
}

.fade-popover-enter-active,
.fade-popover-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fade-popover-enter-from,
.fade-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 胶囊主输入框 */
.capsule-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f1f5f9;
  font-size: 12px;
  min-width: 60px;
  padding: 0 2px;
}

.capsule-input::placeholder {
  color: #64748b;
  font-size: 11.5px;
}

/* 按需微控件组 */
.capsule-extra-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 匹配计数器 */
.match-counter {
  font-size: 10.5px;
  font-family: 'Consolas', monospace;
  background: #2b2b38;
  color: #38bdf8;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #3c3c4e;
  line-height: 1.2;
  white-space: nowrap;
}

.match-counter.zero-match {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

/* 微上下微箭头按钮 */
.micro-arrow-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  font-size: 9px;
  width: 17px;
  height: 19px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.1s;
}

.micro-arrow-btn:hover:not(:disabled) {
  background: #2e2e3c;
  color: #fff;
  border-color: #444458;
}

.micro-arrow-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 模式切换微按钮 */
.mode-switch-btn {
  background: #282834;
  border: 1px solid #3a3a4c;
  color: #94a3b8;
  font-size: 12px;
  width: 20px;
  height: 19px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.1s;
}

.mode-switch-btn:hover {
  background: #323244;
  color: #fff;
  border-color: #4c4c62;
}

.mode-switch-btn.is-tree {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

/* 清空微按钮 */
.clear-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0 1px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
}

.clear-btn:hover {
  color: #fff;
  background: #2e2e3c;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.tool-btn {
  background: #22222a;
  border: 1px solid #32323e;
  color: #cbd5e1;
  padding: 3px 7px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.tool-btn:hover {
  background: #2d2d38;
  color: #fff;
  border-color: #424250;
}

.save-btn {
  background: #2563eb;
  border: 1px solid #1d4ed8;
  color: white;
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  min-width: 62px;
  text-align: center;
  flex-shrink: 0;
}
.save-btn:hover:not(:disabled) {
  background: #1d4ed8;
}
.save-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: #2b2b36;
  border-color: #2b2b36;
  color: #808092;
}
.save-btn.active {
  background: #2563eb;
  border-color: #3b82f6;
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.4);
}
</style>
