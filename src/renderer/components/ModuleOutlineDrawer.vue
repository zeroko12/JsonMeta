<script setup lang="ts">
import { ref } from 'vue'
import { useJsonDocStore, type ModuleOutlineItem } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const isCollapsed = ref(false)

function selectModule(mod: ModuleOutlineItem) {
  doc.ensurePathExpanded(mod.path)
  doc.selectedPath = mod.path
  doc.navTargetTrigger = { path: mod.path, timestamp: Date.now() }
}

function isModuleActive(mod: ModuleOutlineItem): boolean {
  if (!doc.selectedPath) return false
  return doc.selectedPath === mod.path || doc.selectedPath.startsWith(`${mod.path}.`)
}
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
          :title="`${mod.key}\n${mod.description || '无中文描述'}\n包含 ${mod.childCount} 项属性`"
          @click="selectModule(mod)"
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
</style>
