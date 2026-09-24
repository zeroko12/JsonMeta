<script setup lang="ts">
/**
 * FlatFieldList — 走 JSON 实际内容,递归平铺所有字段
 *
 * 性能关键:
 * - 平铺成单个线性 FlatRow[] 数组(任何深度)
 * - 子字段不嵌套渲染,直接挂 parent 的 indent
 * - 用单一 computed 重建,FieldRow 组件无递归调用
 */
import { computed } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import FieldRow from './FieldRow.vue'
import type { JsonValue } from '@shared/utils/json-path'
import type { SchemaField } from '@shared/utils/validation'

const configStore = useConfigStore()
const schemaStore = useSchemaStore()
const uiStore = useUiStore()

interface FlatRow {
  fieldName: string
  fieldPath: string
  fieldType: SchemaField['_type']
  description?: string
  enumValues?: JsonValue[]
  enumStrValues?: string[]
  isReadOnly: boolean
  isModified: boolean
  depth: number
  hasChildren: boolean
}

/** Recursively flatten any JSON shape into a linear list of FlatRow. */
function flattenJson(
  groupPath: string,
  childFields: Record<string, unknown> | undefined,
  groupValue: unknown,
  depth: number,
  out: FlatRow[],
) {
  const jsonKeys =
    groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue)
      ? Object.keys(groupValue as Record<string, unknown>)
      : []
  const schemaKeys = childFields ? Object.keys(childFields).filter((k) => !k.startsWith('_')) : []
  const allKeysSet = new Set<string>([...jsonKeys, ...schemaKeys])
  const allKeys = [...allKeysSet].sort()

  for (const fieldName of allKeys) {
    const fieldPath = `${groupPath}.${fieldName}`
    const fieldValue =
      groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue)
        ? (groupValue as Record<string, unknown>)[fieldName]
        : undefined
    if (fieldValue === undefined) continue
    const schema = childFields?.[fieldName] as SchemaField | undefined

    // Determine if this field has children to expand
    const isObject = fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)
    const hasChildren = isObject === true

    out.push({
      fieldName,
      fieldPath,
      fieldType: (schema?._type ?? inferType(fieldValue)) as SchemaField['_type'],
      description: schema?._desc,
      enumValues: schema?._enum,
      enumStrValues: (schema?._enum ?? []).map((v) => String(v)),
      isReadOnly: schema?._readOnly === true,
      isModified: configStore.changes.has(fieldPath),
      depth,
      hasChildren,
    })

    // Recurse into nested object
    if (isObject) {
      const innerSchema = schema?._fields as Record<string, unknown> | undefined
      flattenJson(fieldPath, innerSchema, fieldValue, depth + 1, out)
    }
  }
}

function inferType(v: unknown): SchemaField['_type'] {
  if (v === null || v === undefined) return 'string'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'object') return 'object'
  return 'string'
}

/** Build the flat row list from the actual JSON + schema. */
const flatRows = computed<FlatRow[]>(() => {
  if (!schemaStore.schema || configStore.current === null) return []
  const out: FlatRow[] = []
  const schema = schemaStore.schema as unknown as Record<string, unknown>
  for (const key of Object.keys(schema)) {
    if (key.startsWith('_')) continue
    const topSchema = schema[key] as SchemaField | null | undefined
    if (!topSchema || typeof topSchema !== 'object') continue
    const topValue = (configStore.current as Record<string, unknown>)[key]
    flattenJson(key, (topSchema as { _fields?: Record<string, unknown> })._fields, topValue, 0, out)
  }
  return out
})

/** Search filter (recursive-aware). */
const filteredRows = computed<FlatRow[]>(() => {
  const q = uiStore.searchQuery.trim().toLowerCase()
  if (!q) return flatRows.value
  return flatRows.value.filter(
    (f) => f.fieldName.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q),
  )
})

const totalCount = computed(() => filteredRows.value.length)
</script>

<template>
  <div class="flat-list">
    <div v-if="totalCount === 0" class="empty">
      <p v-if="uiStore.searchQuery">未找到匹配 "{{ uiStore.searchQuery }}" 的字段</p>
      <p v-else>没有字段可显示</p>
    </div>
    <div v-else class="rows-scroller">
      <RecycleScroller
        v-slot="{ item }"
        :items="filteredRows"
        :item-size="62"
        key-field="fieldPath"
      >
        <FieldRow
          :field-name="item.fieldName"
          :field-path="item.fieldPath"
          :field-type="item.fieldType"
          :description="item.description"
          :enum-values="item.enumValues"
          :enum-str-values="item.enumStrValues"
          :is-read-only="item.isReadOnly"
          :is-modified="item.isModified"
          :depth="item.depth"
          :has-children="item.hasChildren"
        />
      </RecycleScroller>
    </div>
  </div>
</template>

<style scoped>
.flat-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  min-height: 0;
}
.empty {
  padding: 80px 40px;
  text-align: center;
  color: #999;
}
.rows-scroller {
  flex: 1;
  min-height: 0;
}
</style>
