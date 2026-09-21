<script setup lang="ts">
import { computed } from 'vue'
import { useSchemaStore } from '../stores/schema'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'
import ConfigTreeNode from './ConfigTreeNode.vue'
import type { SchemaField } from '@shared/utils/validation'

const schemaStore = useSchemaStore()
const configStore = useConfigStore()
const uiStore = useUiStore()

const topLevelKeys = computed(() => {
  if (!schemaStore.schema) return []
  return Object.keys(schemaStore.schema).filter(
    (k) => !k.startsWith('_') && typeof schemaStore.schema?.[k] === 'object',
  )
})

function getSchemaField(path: string): SchemaField | undefined {
  return schemaStore.getField(path)
}

function isModified(path: string): boolean {
  return configStore.changes.has(path)
}

function matchesSearch(value: unknown, path: string, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  if (path.toLowerCase().includes(lower)) return true
  return false
}

function showNode(path: string): boolean {
  if (!uiStore.showOnlyModified) return true
  // Show only if self or any child is modified
  if (isModified(path)) return true
  for (const changePath of configStore.changes.keys()) {
    if (changePath.startsWith(path + '.') || changePath.startsWith(path + '[')) return true
  }
  return false
}
</script>

<template>
  <div class="config-tree">
    <ConfigTreeNode
      v-for="key in topLevelKeys"
      v-show="showNode(key)"
      :key="key"
      :path="key"
      :value="(configStore.current as Record<string, unknown>)?.[key]"
      :schema-field="getSchemaField(key)"
    />
  </div>
</template>

<style scoped>
.config-tree {
  flex: 1;
  overflow: auto;
  padding: 4px;
  background: white;
}
</style>
