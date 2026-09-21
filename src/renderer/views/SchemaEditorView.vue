<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSchemaStore } from '../stores/schema'
import type { SchemaField } from '@shared/utils/validation'

const schemaStore = useSchemaStore()
const emit = defineEmits<{ close: [] }>()

type Tab = 'subconfigs' | 'templates'
const activeTab = ref<Tab>('subconfigs')
const selectedKey = ref<string | null>(null)

const subConfigKeys = computed(() => {
  if (!schemaStore.schema) return []
  return Object.keys(schemaStore.schema).filter(
    (k) => !k.startsWith('_') && typeof schemaStore.schema?.[k] === 'object',
  )
})

const templateKeys = computed(() => Object.keys(schemaStore.templates))

const selectedField = computed<SchemaField | undefined>(() => {
  if (!selectedKey.value || !schemaStore.schema) return undefined
  if (activeTab.value === 'subconfigs') {
    const v = schemaStore.schema[selectedKey.value]
    return v as SchemaField | undefined
  }
  return schemaStore.templates[selectedKey.value]
})

async function onSave() {
  const r = await schemaStore.save()
  if ('error' in r && r.error) {
    alert(`保存失败: ${r.error}`)
  } else {
    alert('schema.json 已保存。请重启工具以使新说明生效(若改动较多)。')
  }
}

async function onReload() {
  if (!schemaStore.schemaPath) return
  await schemaStore.load(schemaStore.schemaPath)
  selectedKey.value = null
}
</script>

<template>
  <div v-if="schemaStore.schema" class="schema-editor">
    <header>
      <h2>字段说明编辑器</h2>
      <div class="header-actions">
        <button @click="onReload">🔄 重载 schema</button>
        <button class="primary" @click="onSave">💾 保存 schema</button>
        <button @click="emit('close')">关闭</button>
      </div>
    </header>

    <div class="body">
      <aside class="left-pane">
        <div class="tabs">
          <button :class="{ active: activeTab === 'subconfigs' }" @click="activeTab = 'subconfigs'">
            子配置 ({{ subConfigKeys.length }})
          </button>
          <button :class="{ active: activeTab === 'templates' }" @click="activeTab = 'templates'">
            模板 ({{ templateKeys.length }})
          </button>
        </div>
        <ul class="key-list">
          <li
            v-for="k in activeTab === 'subconfigs' ? subConfigKeys : templateKeys"
            :key="k"
            :class="{ selected: selectedKey === k }"
            @click="selectedKey = k"
          >
            {{ k }}
          </li>
        </ul>
      </aside>

      <main class="right-pane">
        <div v-if="!selectedField" class="empty">
          选择左侧一个 sub-config 或模板查看 / 编辑字段说明。
          <p class="hint">
            修改后点击右上角"保存 schema",改动会立刻生效;但工具缓存的 schema
            需重启工具才能刷新(为安全起见)。
          </p>
        </div>

        <div v-else class="field-editor">
          <header class="field-header">
            <h3>{{ selectedKey }}</h3>
            <code class="path">类型: {{ selectedField._type }}</code>
          </header>

          <section>
            <label class="lbl">中文说明</label>
            <textarea
              v-model="selectedField._desc"
              rows="3"
              placeholder="字段含义,会显示在树视图 / 编辑面板"
            />
          </section>

          <section v-if="selectedField._instanceDesc !== undefined">
            <label class="lbl">实例说明 (instance desc)</label>
            <textarea v-model="selectedField._instanceDesc" rows="2" />
          </section>

          <section class="row">
            <label class="lbl">类型 (_type)</label>
            <select v-model="selectedField._type">
              <option value="bool">bool</option>
              <option value="int">int</option>
              <option value="double">double</option>
              <option value="string">string</option>
              <option value="enum">enum</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
          </section>

          <section
            v-if="
              selectedField._min !== undefined || ['int', 'double'].includes(selectedField._type)
            "
            class="row"
          >
            <label class="lbl">最小值 (_min)</label>
            <input v-model.number="selectedField._min" type="number" />
            <label class="lbl">最大值 (_max)</label>
            <input v-model.number="selectedField._max" type="number" />
          </section>

          <section v-if="selectedField._type === 'string'">
            <label class="lbl">正则 (_pattern)</label>
            <input
              v-model="selectedField._pattern"
              type="text"
              placeholder="例如 ^(\\d{1,3}\\.){3}\\d{1,3}$"
            />
          </section>

          <section v-if="selectedField._type === 'enum'">
            <label class="lbl">枚举可选值(逗号分隔)</label>
            <input
              type="text"
              :value="(selectedField._enum ?? []).join(', ')"
              @input="
                (e) => {
                  selectedField!._enum = (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                }
              "
            />
          </section>

          <section class="flags">
            <label>
              <input v-model="selectedField._required" type="checkbox" />
              必填 (_required)
            </label>
            <label>
              <input v-model="selectedField._readOnly" type="checkbox" />
              只读 (_readOnly)
            </label>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.schema-editor {
  position: fixed;
  inset: 0;
  background: white;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}
header h2 {
  margin: 0;
  font-size: 18px;
}
.header-actions button {
  margin-left: 8px;
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 13px;
}
.header-actions .primary {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.left-pane {
  width: 320px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}
.tabs {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
}
.tabs button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 2px solid transparent;
}
.tabs button.active {
  color: #1890ff;
  border-bottom-color: #1890ff;
}
.key-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow: auto;
  flex: 1;
}
.key-list li {
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-family: 'Consolas', monospace;
}
.key-list li:hover {
  background: #e6f7ff;
}
.key-list li.selected {
  background: #91d5ff;
}
.right-pane {
  flex: 1;
  overflow: auto;
  padding: 24px;
}
.empty {
  color: #999;
  text-align: center;
  padding: 80px 40px;
}
.empty .hint {
  font-size: 12px;
  color: #aaa;
  margin-top: 16px;
}
.field-editor section {
  margin-bottom: 16px;
}
.field-editor .lbl {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}
.field-editor input[type='text'],
.field-editor input[type='number'],
.field-editor textarea,
.field-editor select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}
.field-editor .row {
  display: flex;
  gap: 16px;
  align-items: center;
}
.field-editor .row .lbl {
  margin-bottom: 0;
  white-space: nowrap;
}
.field-editor .row input[type='number'] {
  width: 120px;
}
.field-editor .flags {
  display: flex;
  gap: 16px;
}
.field-editor .flags label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.field-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.field-header h3 {
  margin: 0;
}
.path {
  color: #666;
  font-family: monospace;
  font-size: 12px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}
</style>
