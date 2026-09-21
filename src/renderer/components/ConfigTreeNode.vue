<script setup lang="ts">
import { computed } from 'vue'
import { useSchemaStore } from '../stores/schema'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'
import type { SchemaField } from '@shared/utils/validation'

interface Props {
  path: string
  value: unknown
  schemaField?: SchemaField
}

const props = defineProps<Props>()

const schemaStore = useSchemaStore()
const configStore = useConfigStore()
const uiStore = useUiStore()

const isExpanded = computed(() => uiStore.expandedKeys.has(props.path))
const isSelected = computed(() => uiStore.selectedPath === props.path)
const isModified = computed(() => configStore.changes.has(props.path))
const isDeleted = computed(() => {
  const c = configStore.changes.get(props.path)
  return c?.type === 'delete'
})

const isObject = computed(() => {
  return typeof value.value === 'object' && value.value !== null && !Array.isArray(value.value)
})
const isArray = computed(() => Array.isArray(value.value))
const isContainer = computed(() => isObject.value || isArray.value)

const value = computed(() => props.value)

const childKeys = computed(() => {
  if (isArray.value) {
    const arr = value.value as unknown[]
    return arr.map((_, i) => i.toString())
  }
  if (isObject.value) {
    return Object.keys(value.value as Record<string, unknown>)
  }
  return []
})

const schemaChildKeys = computed(() => {
  return Object.keys(props.schemaField?._fields ?? {})
})

const displayValue = computed(() => {
  if (isContainer.value) {
    if (isArray.value) return `[] ${childKeys.value.length} 项`
    return `{} ${childKeys.value.length} 个字段`
  }
  return JSON.stringify(value.value)
})

const nodeType = computed(() => {
  if (props.schemaField?._useTemplate) return `<${props.schemaField._useTemplate}>`
  if (props.schemaField?._type) return props.schemaField._type
  if (isArray.value) return 'array'
  if (isObject.value) return 'object'
  return typeof value.value
})

const description = computed(() => {
  return props.schemaField?._instanceDesc ?? props.schemaField?._desc
})

function toggle() {
  if (!isContainer.value) return
  uiStore.toggleExpanded(props.path)
}

function select() {
  uiStore.selectedPath = props.path
  uiStore.expandPath(props.path)
}

function matchesSearch(q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  if (props.path.toLowerCase().includes(lower)) return true
  if (description.value?.toLowerCase().includes(lower)) return true
  return false
}

defineExpose({ matchesSearch })
</script>

<template>
  <div class="tree-node">
    <div
      class="node-row"
      :class="{
        selected: isSelected,
        modified: isModified,
        deleted: isDeleted,
      }"
      :style="{ paddingLeft: `${(path.split('.').length - 1) * 16 + 4}px` }"
      @click="select"
    >
      <span v-if="isContainer" class="caret" @click.stop="toggle">
        {{ isExpanded ? '▼' : '▶' }}
      </span>
      <span v-else class="caret-spacer"></span>
      <span class="key">{{ path.split('.').pop() }}</span>
      <span class="type" :title="description">{{ nodeType }}</span>
      <span v-if="description" class="desc" :title="description">· {{ description }}</span>
      <span v-if="isModified" class="modified-dot" title="已修改">●</span>
      <span class="value-preview">{{ displayValue }}</span>
    </div>
    <div v-if="isExpanded && isContainer" class="children">
      <ConfigTreeNode
        v-for="key in [...new Set([...childKeys, ...schemaChildKeys])]"
        :key="key"
        :path="`${path}.${key}`"
        :value="
          isArray ? (value as unknown[])[Number(key)] : (value as Record<string, unknown>)[key]
        "
        :schema-field="props.schemaField?._fields?.[key]"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}
.node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-row:hover {
  background: #e6f7ff;
}
.node-row.selected {
  background: #91d5ff;
}
.node-row.modified {
  color: #d46b08;
  background: #fff7e6;
}
.node-row.modified.selected {
  background: #ffd591;
}
.node-row.deleted {
  color: #999;
  text-decoration: line-through;
}
.caret {
  display: inline-block;
  width: 12px;
  text-align: center;
  color: #666;
  cursor: pointer;
}
.caret-spacer {
  display: inline-block;
  width: 12px;
}
.key {
  font-weight: 500;
  color: #003eb3;
}
.type {
  color: #888;
  font-size: 11px;
  font-style: italic;
}
.desc {
  color: #666;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.modified-dot {
  color: #fa8c16;
  font-size: 14px;
}
.value-preview {
  margin-left: auto;
  color: #555;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.children {
  /* nested rendering */
}
</style>
