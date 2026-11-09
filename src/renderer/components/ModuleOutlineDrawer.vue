<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useJsonDocStore, type ModuleOutlineItem } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const isCollapsed = ref(false)

const contextMenu = ref<{
  show: boolean
  x: number
  y: number
  mod: ModuleOutlineItem | null
}>({ show: false, x: 0, y: 0, mod: null })

function selectModule(mod: ModuleOutlineItem) {
  doc.ensurePathExpanded(mod.path)
  doc.selectedPath = mod.path
  doc.navTargetTrigger = { path: mod.path, timestamp: Date.now() }
}

function isModuleActive(mod: ModuleOutlineItem): boolean {
  if (!doc.selectedPath) return false
  return doc.selectedPath === mod.path || doc.selectedPath.startsWith(`${mod.path}.`)
}

function openModuleContextMenu(mod: ModuleOutlineItem, e: MouseEvent) {
  selectModule(mod)
  const menuWidth = 220
  const menuHeight = 160
  const winW = window.innerWidth
  const winH = window.innerHeight
  const x = e.clientX + menuWidth > winW ? winW - menuWidth - 8 : e.clientX
  const y = e.clientY + menuHeight > winH ? winH - menuHeight - 8 : e.clientY
  contextMenu.value = { show: true, x, y, mod }
}

function closeContextMenu() {
  contextMenu.value.show = false
}

function handleRestoreModule() {
  if (!contextMenu.value.mod) return
  const mod = contextMenu.value.mod
  closeContextMenu()
  doc.openRestoreSectionModal(mod.path, mod.description || mod.key)
}

function handleOpenRawJson() {
  if (!contextMenu.value.mod) return
  const mod = contextMenu.value.mod
  closeContextMenu()
  const val = doc.current ? (doc.current as Record<string, unknown>)[mod.path] : null
  doc.showRawEditModal = {
    path: mod.path,
    title: `编辑模块 ${mod.key} 源码`,
    jsonText: JSON.stringify(val, null, 2),
  }
}

function handleCopyPath() {
  if (!contextMenu.value.mod) return
  navigator.clipboard.writeText(contextMenu.value.mod.path)
  doc.showToast(`已复制模块路径: ${contextMenu.value.mod.path}`, 'info')
  closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
})
onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu)
})
</script>

<template>
  <aside
    v-if="doc.topLevelModules.length > 0"
    class="module-outline-drawer"
    :class="{ collapsed: isCollapsed }"
  >
    <!-- 折叠栏展开/收起切换按钮 -->
    <button
      class="collapse-toggle-btn"
      :title="isCollapsed ? '展开子系统模块导航' : '收起子系统模块导航'"
      @click="isCollapsed = !isCollapsed"
    >
      {{ isCollapsed ? '▶' : '◀' }}
    </button>

    <div v-show="!isCollapsed" class="outline-content">
      <!-- 模块栏头部 -->
      <div class="outline-header">
        <span class="outline-title">子系统模块大纲</span>
        <span class="outline-badge">{{ doc.topLevelModules.length }}</span>
      </div>

      <!-- 模块列表 -->
      <div class="outline-list">
        <button
          v-for="mod in doc.topLevelModules"
          :key="mod.path"
          class="outline-item-card"
          :class="{
            active: isModuleActive(mod),
            modified: mod.isModified,
          }"
          :title="`${mod.key}\n${mod.description || '无中文描述'}\n包含 ${mod.childCount} 项属性 (右键可从快照恢复)`"
          @click="selectModule(mod)"
          @contextmenu.prevent="openModuleContextMenu(mod, $event)"
        >
          <div class="card-top-row">
            <span class="mod-icon">▤</span>
            <span class="mod-name">{{ mod.key }}</span>
            <span v-if="mod.isModified" class="mod-changed-dot" title="该模块下有改动">●</span>
            <span class="mod-count">{ {{ mod.childCount }} }</span>
          </div>
          <div v-if="mod.description" class="mod-desc-line">
            {{ mod.description }}
          </div>
        </button>
      </div>
    </div>

    <!-- 模块右键上下文菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show && contextMenu.mod"
        class="mod-context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
        @contextmenu.prevent
      >
        <div class="ctx-header">
          <span class="ctx-title">{{ contextMenu.mod.key }}</span>
          <span class="ctx-type">模块</span>
        </div>
        <div class="ctx-divider" />
        <button class="ctx-item primary" @click="handleRestoreModule">
          <span class="ctx-icon">↺</span>
          <span class="ctx-label">从历史快照恢复此模块...</span>
        </button>
        <button class="ctx-item" @click="handleOpenRawJson">
          <span class="ctx-icon">{ }</span>
          <span class="ctx-label">以 JSON 源码编辑</span>
        </button>
        <button class="ctx-item" @click="handleCopyPath">
          <span class="ctx-icon">📋</span>
          <span class="ctx-label">复制模块路径</span>
        </button>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.module-outline-drawer {
  display: flex;
  position: relative;
  width: 220px;
  min-width: 220px;
  max-width: 220px;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  box-sizing: border-box;
  flex-shrink: 0;
  transition:
    width 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.module-outline-drawer.collapsed {
  width: 20px;
  min-width: 20px;
  max-width: 20px;
}

.collapse-toggle-btn {
  position: absolute;
  top: 6px;
  right: -10px;
  z-index: 20;
  width: 18px;
  height: 22px;
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  color: var(--text-muted);
  font-size: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.12s;
}
.collapse-toggle-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-main);
  border-color: var(--border-muted);
}

.outline-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-sidebar-header);
  user-select: none;
}

.outline-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}

.outline-badge {
  background: var(--bg-badge);
  color: var(--text-dim);
  font-size: 10px;
  font-family: 'Consolas', monospace;
  padding: 1px 5px;
  border-radius: 3px;
}

.outline-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.outline-list::-webkit-scrollbar {
  width: 4px;
}
.outline-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.outline-item-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  text-align: left;
  cursor: pointer;
  transition: all 0.1s;
  box-sizing: border-box;
}

.outline-item-card:hover {
  background: var(--bg-sidebar-hover);
  border-color: var(--border-subtle);
}

.outline-item-card.active {
  background: var(--bg-sidebar-active);
  border-color: var(--border-focus);
  border-left: 3px solid var(--border-focus);
}

.outline-item-card.modified {
  border-color: rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.04);
}

.card-top-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
}

.mod-icon {
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.outline-item-card.active .mod-icon {
  color: #60a5fa;
}

.mod-name {
  font-family: 'Consolas', monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.outline-item-card.active .mod-name {
  color: var(--text-highlight);
}

.mod-changed-dot {
  color: #f59e0b;
  font-size: 9px;
  flex-shrink: 0;
}

.mod-count {
  font-family: 'Consolas', monospace;
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
}

.mod-desc-line {
  font-size: 10.5px;
  color: var(--desc-prefix);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
  padding-left: 14px;
}

/* 模块卡片右键菜单 */
.mod-context-menu {
  position: fixed;
  z-index: 99999;
  width: 220px;
  background: var(--bg-modal, #1e293b);
  border: 1px solid var(--border-color, #334155);
  border-radius: 8px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.4);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;
  animation: ctxFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes ctxFadeIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.ctx-header {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--bg-drawer-header, #0f172a);
  border-radius: 5px;
  margin-bottom: 2px;
}

.ctx-title {
  font-size: 11px;
  font-family: monospace;
  color: var(--text-code, #38bdf8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.ctx-type {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-btn, #334155);
  color: var(--text-dim, #94a3b8);
}

.ctx-divider {
  height: 1px;
  background: var(--border-subtle, rgba(255, 255, 255, 0.08));
  margin: 3px 0;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--text-main, #f1f5f9);
  font-size: 11.5px;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  transition: all 0.1s;
}

.ctx-item:hover {
  background: var(--bg-btn-hover, #334155);
}

.ctx-item.primary {
  color: #38bdf8;
  font-weight: 600;
}

.ctx-item.primary:hover {
  background: rgba(56, 189, 248, 0.12);
}

.ctx-icon {
  font-size: 12px;
  width: 14px;
  text-align: center;
}

.ctx-label {
  flex: 1;
}
</style>
