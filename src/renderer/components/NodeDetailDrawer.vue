<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import { get, type JsonValue } from '@shared/utils/json-path'

const doc = useJsonDocStore()

const currentPath = computed(() => doc.selectedPath)
const value = computed(() => {
  if (!currentPath.value) return undefined
  return get(doc.current, currentPath.value)
})

const isModified = computed(() => doc.changes.has(currentPath.value))
const descText = ref('')

watch(
  () => [currentPath.value, doc.descriptions[currentPath.value]],
  () => {
    descText.value = doc.descriptions[currentPath.value] || ''
  },
  { immediate: true },
)

function saveDesc() {
  if (!currentPath.value) return
  doc.setNodeDescription(currentPath.value, descText.value)
}

function copyPath() {
  navigator.clipboard.writeText(currentPath.value)
}

const valueJsonStr = computed(() => {
  try {
    return JSON.stringify(value.value, null, 2)
  } catch {
    return String(value.value)
  }
})

const nodeType = computed(() => {
  const v = value.value
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
})

function openRawEdit() {
  if (!currentPath.value) return
  doc.showRawEditModal = {
    path: currentPath.value,
    title: `编辑节点: ${currentPath.value}`,
    jsonText: JSON.stringify(value.value, null, 2),
  }
}

function openAddChild() {
  if (!currentPath.value) return
  doc.showAddNodeModal = {
    parentPath: currentPath.value,
    isArray: nodeType.value === 'array',
  }
}

function closeDrawer() {
  doc.selectedPath = ''
}
</script>

<template>
  <aside v-if="currentPath" class="node-detail-drawer">
    <header class="drawer-header">
      <div class="title-row">
        <h3>📌 节点详情</h3>
        <button class="close-btn" @click="closeDrawer">✕</button>
      </div>
      <div class="path-box" title="点击复制路径" @click="copyPath">
        <code>{{ currentPath }}</code>
        <span class="copy-hint">复制</span>
      </div>
      <div v-if="isModified" class="mod-alert">● 该节点在本次会话中已发生改动</div>
    </header>

    <div class="drawer-body">
      <!-- 数据类型切换 -->
      <section class="section-card">
        <div class="section-title">
          <span>🔠 数据类型 (Type)</span>
          <small>点击直接切换类型</small>
        </div>
        <select
          :value="nodeType"
          class="type-select-large"
          @change="
            doc.changeNodeType(currentPath, ($event.target as HTMLSelectElement).value as any)
          "
        >
          <option value="string">String (文本)</option>
          <option value="number">Number (数字)</option>
          <option value="boolean">Boolean (布尔)</option>
          <option value="array">Array (数组)</option>
          <option value="object">Object (对象)</option>
          <option value="null">Null (空值)</option>
        </select>
      </section>

      <!-- 中文业务描述编辑 -->
      <section class="section-card">
        <div class="section-title">
          <span>📝 字段中文描述 / 备注</span>
          <small>伴生存储于同级 .meta.json</small>
        </div>
        <textarea
          v-model="descText"
          class="desc-textarea"
          rows="3"
          placeholder="为此字段填写中文说明、业务含义或调机说明..."
          @input="saveDesc"
        />
      </section>

      <!-- 节点值 JSON 预览与快捷编辑 -->
      <section class="section-card">
        <div class="section-title">
          <span>📄 当前值预览</span>
        </div>
        <pre class="json-preview"><code>{{ valueJsonStr }}</code></pre>
      </section>

      <!-- 节点快捷操作 -->
      <section class="section-card">
        <div class="section-title">
          <span>⚡ 快捷操作</span>
        </div>
        <div class="actions-grid">
          <button
            class="action-card-btn"
            title="上移一行 (在父容器中调整先后排序)"
            @click="doc.moveNode(currentPath, 'up')"
          >
            ▲ 上移一行
          </button>
          <button
            class="action-card-btn"
            title="下移一行 (在父容器中调整先后排序)"
            @click="doc.moveNode(currentPath, 'down')"
          >
            ▼ 下移一行
          </button>
          <button
            class="action-card-btn highlight"
            title="以 JSON 代码弹窗直接修改此节点"
            @click="openRawEdit"
          >
            📝 代码编辑
          </button>
          <button
            v-if="nodeType === 'array' || nodeType === 'object'"
            class="action-card-btn highlight"
            title="添加子项或属性"
            @click="openAddChild"
          >
            ➕ 添加子项
          </button>
          <button
            v-if="isModified"
            class="action-card-btn warn"
            title="还原为打开时的原始值"
            @click="doc.revertField(currentPath)"
          >
            ↩ 还原修改
          </button>
          <button
            class="action-card-btn danger"
            title="彻底删除此节点 (可随时 Ctrl+Z 撤销)"
            @click="doc.deleteNode(currentPath)"
          >
            🗑 删除节点
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.node-detail-drawer {
  width: 340px;
  background: #18181f;
  border-left: 1px solid #282834;
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
  color: #e2e8f0;
}

.drawer-header {
  padding: 14px 16px;
  background: #1a1a22;
  border-bottom: 1px solid #282834;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title-row h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.close-btn:hover {
  background: #282834;
  color: #f1f5f9;
}

.path-box {
  background: #202028;
  border: 1px solid #2e2e3a;
  padding: 4px 8px;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.path-box code {
  font-size: 11px;
  color: #60a5fa;
  word-break: break-all;
  font-family: monospace;
}
.copy-hint {
  font-size: 10px;
  color: #64748b;
  margin-left: 6px;
  flex-shrink: 0;
}
.path-box:hover .copy-hint {
  color: #93c5fd;
}

.mod-alert {
  font-size: 11px;
  color: #fbbf24;
  font-weight: 500;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-card {
  background: #1e1e26;
  border: 1px solid #2c2c38;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}
.section-title small {
  font-size: 10px;
  color: #64748b;
  font-weight: normal;
}

.desc-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid #323240;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  background: #16161c;
  color: #f1f5f9;
}
.desc-textarea:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.json-preview {
  margin: 0;
  padding: 8px;
  background: #121216;
  color: #38bdf8;
  font-size: 11px;
  border-radius: 4px;
  max-height: 200px;
  overflow: auto;
  font-family: 'Consolas', monospace;
  border: 1px solid #262632;
}

.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.action-card-btn {
  background: #262632;
  border: 1px solid #363646;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.1s;
}
.action-card-btn:hover {
  background: #323242;
  color: #fff;
  border-color: #4b4b60;
}
.action-card-btn.warn {
  border-color: #634212;
  color: #fbbf24;
  background: #3b280c;
}
.action-card-btn.warn:hover {
  background: #4d3510;
}
.type-select-large {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #323240;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: #16161c;
  color: #f1f5f9;
  cursor: pointer;
  font-weight: 500;
}
.type-select-large:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.action-card-btn.highlight {
  background: #1e3a8a;
  border-color: #2563eb;
  color: #93c5fd;
}
.action-card-btn.highlight:hover {
  background: #2563eb;
  color: #fff;
}
.action-card-btn.danger {
  border-color: #7f1d1d;
  color: #fca5a5;
  background: #450a0a;
}
.action-card-btn.danger:hover {
  background: #7f1d1d;
  color: #fff;
}
</style>
