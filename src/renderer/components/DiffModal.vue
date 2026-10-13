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
  background: #141417;
  color: #e2e8f0;
  min-height: 0;
  overflow: hidden;
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

/* 全模式统一改动徽章 */
.unified-change-badge {
  background: #3b280c;
  color: #fbbf24;
  border: 1px solid #634212;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
}
.unified-change-badge.live {
  background: #1e3a5f;
  color: #93c5fd;
  border-color: #2563eb;
}

.stat-mini {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.stat-mini.mod {
  background: #3b280c;
  color: #fde68a;
}
.stat-mini.add {
  background: #0f3d1e;
  color: #bbf7d0;
}
.stat-mini.del {
  background: #450a0a;
  color: #fecaca;
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
.sub-tool-btn.danger {
  background: #450a0a;
  border-color: #7f1d1d;
  color: #fca5a5;
}
.sub-tool-btn.danger:hover:not(:disabled) {
  background: #7f1d1d;
  color: #fff;
}
.sub-tool-btn.danger:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  background: #24242e;
  border-color: #32323e;
  color: #64748b;
}

.diff-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.empty-diff {
  text-align: center;
  padding: 80px 20px;
  color: #64748b;
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
  border-bottom: 1px solid #24242e;
}
.diff-table th {
  background: #1a1a20;
  font-weight: 600;
  color: #94a3b8;
  border-bottom: 1px solid #2d2d38;
}

.diff-table tbody tr:hover {
  background: #1c1c24;
}

.diff-table tr.modify {
  background: rgba(245, 158, 11, 0.05);
}
.diff-table tr.add {
  background: rgba(34, 197, 94, 0.05);
}
.diff-table tr.delete {
  background: rgba(239, 68, 68, 0.05);
}

.type-pill {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.type-pill.modify {
  background: #3b280c;
  color: #fbbf24;
  border: 1px solid #634212;
}
.type-pill.add {
  background: #0f3d1e;
  color: #4ade80;
  border: 1px solid #166534;
}
.type-pill.delete {
  background: #450a0a;
  color: #f87171;
  border: 1px solid #7f1d1d;
}

.category-pill {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.category-pill.description {
  background: #3b280c;
  color: #fde047;
  border: 1px solid #715510;
}
.category-pill.data {
  background: #1e293b;
  color: #93c5fd;
  border: 1px solid #334155;
}

.stat-mini.desc {
  background: #3b280c;
  color: #fde047;
  border: 1px solid #715510;
}

.path-code {
  font-family: 'Consolas', monospace;
  color: #60a5fa;
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
  color: #93c5fd;
  text-decoration: underline;
}

.old-val code {
  color: #fca5a5;
  background: #3b1515;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.new-val code {
  color: #86efac;
  background: #10331e;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.revert-btn {
  background: #24242f;
  border: 1px solid #363646;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.1s;
}
.revert-btn:hover {
  background: #323242;
  color: #fff;
  border-color: #4b4b60;
}
</style>
