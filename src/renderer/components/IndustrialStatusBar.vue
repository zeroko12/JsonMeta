<script setup lang="ts">
import { computed, ref } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const copyHint = ref(false)

const breadcrumbs = computed<string[]>(() => {
  if (!doc.selectedPath) return []
  return doc.selectedPath.split('.')
})

function copyFullPath() {
  if (!doc.selectedPath) return
  void navigator.clipboard.writeText(doc.selectedPath)
  copyHint.value = true
  setTimeout(() => {
    copyHint.value = false
  }, 1500)
}

const descCount = computed(() => Object.keys(doc.descriptions).length)
</script>

<template>
  <footer v-if="doc.hasFile" class="industrial-status-bar">
    <!-- 左侧: 当前聚焦路径面包屑导航 -->
    <div class="status-left">
      <div
        class="breadcrumb-container"
        :class="{ active: !!doc.selectedPath }"
        :title="
          doc.selectedPath ? `当前聚焦路径: ${doc.selectedPath} (点击复制)` : '当前未选中特定节点'
        "
        @click="copyFullPath"
      >
        <span class="status-icon">⌖</span>
        <template v-if="breadcrumbs.length > 0">
          <span v-for="(crumb, idx) in breadcrumbs" :key="idx" class="crumb-item">
            <span v-if="idx > 0" class="crumb-sep">/</span>
            <span class="crumb-name" :class="{ 'last-crumb': idx === breadcrumbs.length - 1 }">
              {{ crumb }}
            </span>
          </span>
          <span v-if="copyHint" class="copy-success-badge">已复制路径</span>
        </template>
        <span v-else class="status-idle-text">根节点就绪 (点击树节点可在此处查看完整层级路径)</span>
      </div>
    </div>

    <!-- 中间: 核心工程运行参数 -->
    <div class="status-center">
      <!-- 编码格式 -->
      <span class="status-tag">UTF-8</span>
      <span class="status-divider">|</span>

      <!-- 估算文件体积 -->
      <span class="status-tag" :title="`当前内存数据估计体积: ${doc.fileSizeFormatted}`">
        {{ doc.fileSizeFormatted }}
      </span>
      <span class="status-divider">|</span>

      <!-- 节点总数 -->
      <span class="status-tag" :title="`当前配置共包含 ${doc.totalNodesCount} 个字段与节点`">
        {{ doc.totalNodesCount }} 节点
      </span>
      <span class="status-divider">|</span>

      <!-- 伴生元数据条数 -->
      <span class="status-tag" :title="`伴生元数据文件中包含 ${descCount} 条业务中文注释`">
        注解: {{ descCount }}
      </span>
      <span class="status-divider">|</span>

      <!-- 改动与待存状态指示器 (可点击直接步进跳转) -->
      <button
        v-if="doc.isDirty"
        class="status-dirty-badge clickable"
        :title="`当前存在 ${doc.totalChangesCount} 处未保存改动。点击依次跳转到下一个改动位置 (快捷键: F7)`"
        @click="doc.jumpToNextChange()"
      >
        <span class="pulse-dot">●</span>
        <span>{{ doc.changeNavText }}</span>
        <span class="nav-arrow">➔</span>
      </button>
      <span v-else class="status-clean-badge" title="配置与磁盘已完全同步">
        <span class="clean-dot">●</span>
        <span>已同步磁盘</span>
      </span>
    </div>

    <!-- 右侧: 关键快捷键指引 -->
    <div class="status-right">
      <span class="shortcut-tip">
        <kbd>F7</kbd>
        改动跳转
      </span>
      <span class="status-divider">·</span>
      <span class="shortcut-tip">
        <kbd>Ctrl+F</kbd>
        查找
      </span>
      <span class="status-divider">·</span>
      <span class="shortcut-tip">
        <kbd>Ctrl+S</kbd>
        保存
      </span>
    </div>
  </footer>
</template>

<style scoped>
.industrial-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  min-height: 26px;
  background: var(--bg-statusbar);
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Consolas', monospace;
  padding: 0 10px;
  user-select: none;
  z-index: 100;
  box-sizing: border-box;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.status-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background 0.12s;
}
.breadcrumb-container.active {
  cursor: pointer;
}
.breadcrumb-container.active:hover {
  background: var(--bg-row-hover);
  color: var(--text-main);
}

.status-icon {
  color: #38bdf8;
  font-size: 12px;
  flex-shrink: 0;
}

.crumb-item {
  display: inline-flex;
  align-items: center;
  font-family: 'Consolas', monospace;
  font-size: 11px;
}

.crumb-sep {
  color: var(--text-dim);
  margin: 0 3px;
}

.crumb-name {
  color: var(--text-muted);
}

.crumb-name.last-crumb {
  color: var(--text-highlight);
  font-weight: 600;
}

.copy-success-badge {
  background: #065f46;
  color: #a7f3d0;
  font-size: 9.5px;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 6px;
  flex-shrink: 0;
}

.status-idle-text {
  color: var(--text-dim);
  font-style: italic;
  font-size: 11px;
}

.status-center {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-tag {
  color: var(--text-muted);
  font-family: 'Consolas', monospace;
  font-size: 11px;
}

.status-divider {
  color: var(--border-color);
  font-size: 10px;
}

.status-dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 11px;
  font-family: 'Consolas', monospace;
  cursor: pointer;
  transition: all 0.12s;
}
.status-dirty-badge:hover {
  background: rgba(245, 158, 11, 0.25);
  border-color: #f59e0b;
  color: #fff;
}

.pulse-dot {
  color: #f59e0b;
  font-size: 10px;
}

.nav-arrow {
  font-size: 9px;
  opacity: 0.8;
}

.status-clean-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
  font-size: 11px;
}

.clean-dot {
  color: #10b981;
  font-size: 9px;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 12px;
  flex-shrink: 0;
}

.shortcut-tip {
  color: var(--text-dim);
  font-size: 10.5px;
}

.shortcut-tip kbd {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  color: var(--text-muted);
  padding: 1px 4px;
  font-size: 9.5px;
  font-family: 'Consolas', monospace;
}
</style>
