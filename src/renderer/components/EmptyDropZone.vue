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
    <div class="dropzone-card">
      <div class="icon-circle">
        <span>📂</span>
      </div>
      <h2>现代化通用 JSON 编辑器</h2>
      <p class="desc">
        拖拽任意
        <strong>.json</strong>
        文件到此处直接打开，
        <br />
        或点击下方按钮开始编辑。
      </p>

      <div class="cta-actions">
        <button class="primary-btn" @click="() => doc.openFile()">📂 打开本地 JSON 文件</button>
        <button class="secondary-btn" @click="() => doc.newFile({})">✨ 创建空 JSON 文件</button>
      </div>

      <!-- 最近打开的文件列表 (最多 3 个) -->
      <div v-if="doc.recentFiles.length > 0" class="recent-files-block">
        <div class="recent-header">
          <span class="recent-title">🕒 最近打开的文件 (点击直接打开)</span>
          <button class="clear-recent-btn" title="清空最近记录" @click="doc.clearRecentFiles()">
            清空
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
            <span class="recent-file-icon">📄</span>
            <div class="recent-file-meta">
              <span class="recent-name">{{ getFileName(p) }}</span>
              <span class="recent-path">{{ p }}</span>
            </div>
            <span class="recent-arrow">➔</span>
          </button>
        </div>
      </div>

      <div class="features-badge">
        <span>✨ 伴生中文描述</span>
        <span>⚡ 任意节点增删重排</span>
        <span>↩ 实时撤销重做</span>
        <span>⚖️ 改动对比审计</span>
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
  background: #141417;
  padding: 40px;
  border: 2px dashed #2d2d38;
  margin: 24px;
  border-radius: 12px;
  transition: all 0.2s;
}

.dropzone-container.dragging {
  border-color: #3b82f6;
  background: #172033;
  transform: scale(1.005);
}

.dropzone-card {
  max-width: 480px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.icon-circle {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: #1e293b;
  border: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
}

.desc {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.6;
}
.desc strong {
  color: #60a5fa;
}

.cta-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.primary-btn {
  background: #2563eb;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.primary-btn:hover {
  background: #1d4ed8;
}

.secondary-btn {
  background: #22222a;
  color: #cbd5e1;
  border: 1px solid #333342;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.secondary-btn:hover {
  background: #2c2c36;
  color: #fff;
  border-color: #444456;
}

.features-badge {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  flex-wrap: wrap;
  justify-content: center;
}
.features-badge span {
  background: #1c1c24;
  border: 1px solid #2a2a36;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
}

/* 最近打开的文件区域样式 */
.recent-files-block {
  width: 100%;
  margin-top: 12px;
  background: #191922;
  border: 1px solid #2b2b38;
  border-radius: 9px;
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
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}

.clear-recent-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}
.clear-recent-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
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
  padding: 7px 10px;
  background: #21212b;
  border: 1px solid #30303e;
  border-radius: 6px;
  color: #e2e8f0;
  cursor: pointer;
  text-align: left;
  width: 100%;
  box-sizing: border-box;
  transition: all 0.15s ease;
}

.recent-card-btn:hover {
  background: #282836;
  border-color: #3b82f6;
  transform: translateX(2px);
}

.recent-file-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.recent-file-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.recent-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-path {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-arrow {
  font-size: 11px;
  color: #64748b;
  opacity: 0.6;
  transition: all 0.15s;
}

.recent-card-btn:hover .recent-arrow {
  color: #3b82f6;
  opacity: 1;
  transform: translateX(2px);
}
</style>
