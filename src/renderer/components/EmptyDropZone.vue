<script setup lang="ts">
import { ref } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const isDragging = ref(false)

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]
    // Electron 环境下 File 对象带有 path 属性
    const fullPath = (file as unknown as { path?: string }).path
    if (fullPath) {
      void doc.openFile(fullPath)
    }
  }
}

function getFileName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}
</script>

<template>
  <div
    class="dropzone-container"
    :class="{ dragging: isDragging }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="dropzone-terminal-card">
      <!-- 头部控制终端标头 -->
      <div class="terminal-badge">
        <span class="badge-dot"></span>
        <span class="badge-text">JSONMETA // CONFIGURATION TERMINAL</span>
      </div>

      <div class="terminal-icon-box">
        <svg
          viewBox="0 0 24 24"
          width="36"
          height="36"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" />
          <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" />
          <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" />
          <path d="M7 8l3 3-3 3" stroke="#38bdf8" />
          <line x1="12" y1="14" x2="16" y2="14" stroke="#38bdf8" />
        </svg>
      </div>

      <h1 class="main-title">结构化配置管理终端</h1>
      <p class="sub-desc">
        拖拽任意
        <span class="highlight-code">.json</span>
        配置文件至此，或通过快捷入口快速打开。
      </p>

      <!-- 主要操作按钮 -->
      <div class="cta-actions">
        <button class="primary-btn" @click="() => doc.openFile()">
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          打开本地配置 (Ctrl+O)
        </button>
        <button class="secondary-btn" @click="() => doc.newFile({})">
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建空白配置 (Ctrl+N)
        </button>
      </div>

      <!-- 最近打开的文件列表 -->
      <div v-if="doc.recentFiles.length > 0" class="recent-files-block">
        <div class="recent-header">
          <span class="recent-title">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            最近检视与编辑记录
          </span>
          <button class="clear-recent-btn" title="清空最近记录" @click="doc.clearRecentFiles()">
            清空历史
          </button>
        </div>
        <div class="recent-list">
          <button
            v-for="p in doc.recentFiles"
            :key="p"
            class="recent-card-btn"
            :title="`直接打开: ${p}`"
            @click="() => doc.openFile(p)"
          >
            <div class="file-icon-badge">JSON</div>
            <div class="recent-file-meta">
              <span class="recent-name">{{ getFileName(p) }}</span>
              <span class="recent-path">{{ p }}</span>
            </div>
            <span class="recent-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropzone-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-workspace);
  padding: 32px 24px;
  border: 1px dashed var(--border-muted);
  margin: 18px;
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  overflow-y: auto;
}

.dropzone-container.dragging {
  border-color: var(--border-focus);
  background: var(--bg-row-selected);
  transform: scale(1.002);
}

.dropzone-terminal-card {
  max-width: 580px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 18px;
}

/* 标头 */
.terminal-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-btn);
  border: 1px solid var(--border-muted);
  padding: 4px 12px;
  border-radius: 20px;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.badge-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.terminal-icon-box {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.main-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.3px;
}

.sub-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}

.highlight-code {
  color: var(--text-highlight);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
  background: rgba(56, 189, 248, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

/* 按钮组 */
.cta-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  width: 100%;
  justify-content: center;
}

.primary-btn,
.secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.primary-btn {
  background: #0284c7;
  color: #ffffff;
  border: 1px solid #0369a1;
}
.primary-btn:hover {
  background: #0369a1;
  border-color: #075985;
}

.secondary-btn {
  background: var(--bg-btn);
  color: var(--text-main);
  border: 1px solid var(--border-color);
}
.secondary-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-main);
  border-color: var(--border-focus);
}

/* 最近历史 */
.recent-files-block {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px 14px;
  text-align: left;
  box-sizing: border-box;
}

.recent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.recent-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.clear-recent-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}
.clear-recent-btn:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recent-card-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  color: var(--text-main);
  cursor: pointer;
  text-align: left;
  width: 100%;
  box-sizing: border-box;
  transition: all 0.15s ease;
}

.recent-card-btn:hover {
  background: var(--bg-btn-hover);
  border-color: var(--border-focus);
}

.file-icon-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-highlight);
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  padding: 2px 5px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  flex-shrink: 0;
}

.recent-file-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.recent-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-path {
  font-size: 11px;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-arrow {
  font-size: 12px;
  color: var(--text-dim);
  transition: all 0.15s;
}

.recent-card-btn:hover .recent-arrow {
  color: var(--text-highlight);
  transform: translateX(2px);
}
</style>
