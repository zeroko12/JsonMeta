<script setup lang="ts">
/**
 * HistoryPanel — 改动历史面板
 * 列所有改动:时间 / 字段路径 / 旧值 → 新值
 * 支持:按路径过滤 + 清空历史
 */
import { computed, ref } from 'vue'
import { useAnnotationsStore } from '../stores/annotations'

const annotations = useAnnotationsStore()
const filter = ref('')
const openItems = ref<Set<string>>(new Set())

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return annotations.history
  return annotations.history.filter(
    (h) =>
      h.path.toLowerCase().includes(q) ||
      JSON.stringify(h.oldValue).toLowerCase().includes(q) ||
      JSON.stringify(h.newValue).toLowerCase().includes(q),
  )
})

function toggleItem(id: string) {
  const s = new Set(openItems.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  openItems.value = s
}

function fmtValue(v: unknown): string {
  if (v === undefined) return '(removed)'
  try {
    const s = JSON.stringify(v)
    return s.length > 80 ? s.slice(0, 77) + '...' : s
  } catch {
    return String(v)
  }
}

function fmtTime(t: string): string {
  const d = new Date(t)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<template>
  <aside class="history-panel">
    <header>
      <h3>📜 改动历史</h3>
      <span class="count">{{ annotations.history.length }}</span>
    </header>
    <div class="filter">
      <input v-model="filter" type="text" placeholder="按路径/值过滤..." />
      <button v-if="annotations.history.length > 0" class="clear" @click="annotations.clearHistory">
        清空
      </button>
    </div>
    <ul v-if="filtered.length === 0" class="empty">
      <li>暂无改动记录</li>
    </ul>
    <ul v-else class="list">
      <li v-for="entry in filtered" :key="entry.id" :class="{ open: openItems.has(entry.id) }">
        <div class="entry-head" @click="toggleItem(entry.id)">
          <span :class="['type', entry.type]">{{ entry.type }}</span>
          <code class="path">{{ entry.path.split('.').pop() }}</code>
          <span class="time">{{ fmtTime(entry.time) }}</span>
        </div>
        <div v-if="openItems.has(entry.id)" class="entry-body">
          <div class="value old">
            <span>旧</span>
            <code>{{ fmtValue(entry.oldValue) }}</code>
          </div>
          <div class="value new">
            <span>新</span>
            <code>{{ fmtValue(entry.newValue) }}</code>
          </div>
          <code class="full-path">{{ entry.path }}</code>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.history-panel {
  width: 100%;
  height: 100%;
  background: #fafafa;
  border-left: 1px solid #e8e8e8;
  overflow: auto;
  padding: 12px;
  font-size: 12px;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.count {
  background: #f5f5f5;
  color: #666;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 11px;
}
.filter {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.filter input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  font-size: 12px;
}
.clear {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  background: white;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  color: #666;
}
.empty {
  list-style: none;
  margin: 16px 0;
  padding: 0;
  text-align: center;
  color: #999;
  font-style: italic;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 6px;
  overflow: hidden;
}
.entry-head {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.entry-head:hover {
  background: #fafbfc;
}
.type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
}
.type.add {
  background: #f6ffed;
  color: #389e0d;
}
.type.modify {
  background: #fff7e6;
  color: #d46b08;
}
.type.remove {
  background: #fff1f0;
  color: #cf1322;
}
.path {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: #003eb3;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  font-size: 10px;
  color: #999;
}
.entry-body {
  padding: 8px 10px;
  background: #f9f9f9;
  border-top: 1px solid #e0e0e0;
}
.value {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 11px;
}
.value span {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  font-weight: 600;
  border-radius: 3px;
  padding: 1px 4px;
}
.value.old span {
  background: #fff1f0;
  color: #cf1322;
}
.value.new span {
  background: #f6ffed;
  color: #389e0d;
}
.value code {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: #444;
  word-break: break-all;
  flex: 1;
}
.full-path {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #888;
  font-family: 'Consolas', monospace;
  word-break: break-all;
}
</style>
