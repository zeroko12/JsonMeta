<script setup lang="ts">
/**
 * CategoryFilter — 左侧类别多选过滤
 *
 * 显示所有 sub-config group,checkbox 多选过滤主区。
 * 默认全选。
 */
import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'

const configStore = useConfigStore()
const uiStore = useUiStore()

interface Category {
  key: string
  count: number
}

const categories = computed<Category[]>(() => {
  // Walk the data tree to count fields per group
  if (!configStore.current) return []
  const data = configStore.current as Record<string, unknown>
  const result: Category[] = []
  for (const key of Object.keys(data)) {
    const value = data[key]
    let count = 0
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      count = countLeaves(value as Record<string, unknown>)
    }
    result.push({ key, count })
  }
  return result
})

function countLeaves(obj: Record<string, unknown>, depth = 0): number {
  if (depth > 8) return 0
  let n = 0
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      n += countLeaves(v as Record<string, unknown>, depth + 1)
    } else if (v !== null && typeof v !== 'undefined') {
      n += 1
    }
  }
  return n
}

const enabled = computed<Set<string>>(() => uiStore.enabledCategories)

function isAllOn() {
  return enabled.value.size === 0 || enabled.value.size === categories.value.length
}

function toggleAll() {
  if (isAllOn()) uiStore.enabledCategories = new Set()
  else uiStore.enabledCategories = new Set(categories.value.map((c) => c.key))
}

function toggle(key: string) {
  const next = new Set(enabled.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  uiStore.enabledCategories = next
}
</script>

<template>
  <div class="category-filter">
    <div class="header">
      <span class="title">类别</span>
      <button class="toggle-all" @click="toggleAll">
        {{ isAllOn() ? '全不选' : '全选' }}
      </button>
    </div>
    <ul class="list">
      <li v-for="c in categories" :key="c.key" class="item">
        <label>
          <input
            type="checkbox"
            :checked="isAllOn() || enabled.has(c.key)"
            @change="toggle(c.key)"
          />
          <code class="key">{{ c.key }}</code>
          <span class="count">{{ c.count }}</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.category-filter {
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  font-size: 12px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #f0f0f0;
}
.title {
  font-weight: 600;
  color: #555;
}
.toggle-all {
  padding: 2px 8px;
  border: 1px solid #d9d9d9;
  background: white;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: #1890ff;
}
.toggle-all:hover {
  background: #e6f7ff;
}
.list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 200px;
  overflow: auto;
}
.item label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  cursor: pointer;
}
.item label:hover {
  background: #f0f0f0;
}
.item input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  margin: 0;
}
.item .key {
  flex: 1;
  font-family: monospace;
  font-size: 11px;
  color: #003eb3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item .count {
  font-size: 10px;
  color: #999;
}
</style>
