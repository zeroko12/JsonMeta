<script setup lang="ts">
import { computed } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import type { UnifiedChangeItem } from '../stores/jsonDoc'

const doc = useJsonDocStore()

const changeList = computed<UnifiedChangeItem[]>(() => {
  return doc.allChanges
})

const stats = computed(() => {
  const all = changeList.value
  return {
    total: all.length,
    modify: all.filter((c) => c.type === 'modify').length,
    add: all.filter((c) => c.type === 'add').length,
    delete: all.filter((c) => c.type === 'delete').length,
    dataCount: all.filter((c) => c.category === 'data').length,
    descCount: all.filter((c) => c.category === 'description').length,
  }
})

const filteredChanges = computed(() => {
  const q = doc.searchQuery.trim().toLowerCase()
  if (!q) return changeList.value
  return changeList.value.filter((item) => {
    if (item.path.toLowerCase().includes(q)) return true
    if (item.label && item.label.toLowerCase().includes(q)) return true
    if (JSON.stringify(item.oldValue).toLowerCase().includes(q)) return true
    if (JSON.stringify(item.newValue).toLowerCase().includes(q)) return true
    return false
  })
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

function revertAll() {
  if (confirm('确定要放弃所有未保存修改（包括数据与中文描述），全部还原为打开时的状态吗？')) {
    doc.revertAll()
  }
}
</script>

<template>
  <div class="diff-view-container">
    <!-- 统一二级子工具条 (38px, 全模式严格对齐) -->
    <div class="sub-toolbar">
      <div class="sub-left">
        <span class="sub-title">改动比对与审计</span>
        <span class="sub-badge">{{ stats.total }} 处改动</span>
        <span class="unified-change-badge live" title="实时审计会话中的数据改动与中文描述修改">
          ● 实时审计
        </span>
        <span class="stat-mini mod">{{ stats.modify }} 修改</span>
        <span class="stat-mini add">{{ stats.add }} 新增</span>
        <span class="stat-mini del">{{ stats.delete }} 删除</span>
        <span v-if="stats.descCount > 0" class="stat-mini desc">
          // {{ stats.descCount }} 描述修改
        </span>
        <span v-if="doc.searchQuery" class="sub-filter-hint">(过滤 "{{ doc.searchQuery }}")</span>
      </div>
      <div class="sub-right">
        <button
          class="sub-tool-btn danger"
          :disabled="stats.total === 0"
          title="放弃所有修改（包括数据与字段描述），全部还原为打开时的状态"
          @click="revertAll"
        >
          放弃修改并还原
        </button>
      </div>
    </div>

    <!-- 表格内容主体 -->
    <div class="diff-body">
      <div v-if="stats.total === 0" class="empty-diff">
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="#10b981"
          stroke-width="2"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <p>当前文件与打开时完全一致，未发生任何内容改动或描述修改。</p>
      </div>

      <table v-else class="diff-table">
        <thead>
          <tr>
            <th width="80">变动</th>
            <th width="90">分类</th>
            <th width="240">字段路径</th>
            <th>修改前 (旧值)</th>
            <th>修改后 (新值)</th>
            <th width="90">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filteredChanges"
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
              <code
                class="path-code clickable"
                title="点击在树形编辑器中跳转定位到此字段"
                @click="doc.jumpToSpecificChange(item.path)"
              >
                {{ item.path }}
              </code>
            </td>
            <td class="old-val">
              <code>{{ formatVal(item.oldValue) }}</code>
            </td>
            <td class="new-val">
              <code>{{ formatVal(item.newValue) }}</code>
            </td>
            <td>
              <button
                class="revert-btn"
                :title="`放弃此项${item.category === 'description' ? '描述' : '数值'}修改，还原为旧值`"
                @click="doc.revertChange(item)"
              >
                还原
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.diff-view-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-workspace);
  color: var(--text-main);
  min-height: 0;
  overflow: hidden;
}

/* 统一二级子工具条 (38px) */
.sub-toolbar {
  height: 38px;
  background: var(--bg-subbar);
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-muted);
}
.sub-badge {
  background: var(--bg-btn);
  color: var(--text-main);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

/* 全模式统一改动徽章 */
.unified-change-badge {
  background: var(--desc-bg);
  color: var(--desc-text);
  border: 1px solid var(--desc-border);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
}
.unified-change-badge.live {
  background: rgba(37, 99, 235, 0.12);
  color: var(--text-highlight);
  border-color: rgba(37, 99, 235, 0.35);
}

.stat-mini {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.stat-mini.mod {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}
.stat-mini.add {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.stat-mini.del {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.sub-filter-hint {
  font-size: 11px;
  color: var(--text-highlight);
  font-style: italic;
}

.sub-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sub-tool-btn {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.1s;
}
.sub-tool-btn.danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #ef4444;
}
.sub-tool-btn.danger:hover:not(:disabled) {
  background: #dc2626;
  color: #fff;
}
.sub-tool-btn.danger:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: var(--bg-btn);
  border-color: var(--border-subtle);
  color: var(--text-dim);
}

.diff-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.empty-diff {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-dim);
}
.empty-diff .icon {
  font-size: 32px;
}
.empty-diff p {
  margin-top: 10px;
  font-size: 14px;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.diff-table th,
.diff-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}
.diff-table th {
  background: var(--bg-subbar);
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
}

.diff-table tbody tr:hover {
  background: var(--bg-row-hover);
}

.diff-table tr.modify {
  background: rgba(245, 158, 11, 0.04);
}
.diff-table tr.add {
  background: rgba(34, 197, 94, 0.04);
}
.diff-table tr.delete {
  background: rgba(239, 68, 68, 0.04);
}

.type-pill {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.type-pill.modify {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.type-pill.add {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.type-pill.delete {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.category-pill {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.category-pill.description {
  background: var(--desc-bg);
  color: var(--desc-text);
  border: 1px solid var(--desc-border);
}
.category-pill.data {
  background: var(--bg-btn);
  color: var(--text-highlight);
  border: 1px solid var(--border-color);
}

.stat-mini.desc {
  background: var(--desc-bg);
  color: var(--desc-text);
  border: 1px solid var(--desc-border);
}

.path-code {
  font-family: 'Consolas', monospace;
  color: var(--text-code);
  font-weight: 600;
  transition: all 0.15s;
}
.path-code.clickable {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.path-code.clickable:hover {
  background: rgba(96, 165, 250, 0.15);
  color: var(--text-highlight);
  text-decoration: underline;
}

.old-val code {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.new-val code {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.revert-btn {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.1s;
}
.revert-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-main);
  border-color: var(--border-focus);
}
</style>
