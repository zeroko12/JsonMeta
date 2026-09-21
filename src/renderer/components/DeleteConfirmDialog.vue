<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useConfigStore } from '../stores/config'
import { remove as removePath, get } from '@shared/utils/json-path'

const uiStore = useUiStore()
const configStore = useConfigStore()

interface Props {
  path: string
  /** When true, removes the entire subtree; when false, removes just the leaf key. */
  wholeSubtree?: boolean
}

const props = withDefaults(defineProps<Props>(), { wholeSubtree: true })

type Mode = 'block' | 'pattern' | 'multiSelect'
const mode = ref<Mode>('block')

const targetPaths = ref<string[]>([])

// Compute preview of what will be deleted
watch(
  () => [props.path, props.wholeSubtree, uiStore.showDeleteDialog],
  () => {
    if (!uiStore.showDeleteDialog) return
    computeTargets()
  },
  { immediate: true },
)

function computeTargets() {
  if (mode.value === 'block') {
    targetPaths.value = [props.path]
  } else if (mode.value === 'pattern') {
    const rx = new RegExp(props.path.replace(/\*/g, '.*'))
    targetPaths.value = [...configStore.changes.keys()].filter((p) => rx.test(p))
    if (targetPaths.value.length === 0) {
      // fallback: use plain path as literal
      targetPaths.value = [props.path]
    }
  } else {
    // multiSelect: use selectedPath only (extensible)
    targetPaths.value = [props.path]
  }
}

function changeMode(m: Mode) {
  mode.value = m
  computeTargets()
}

const previewValues = computed(() => {
  if (!configStore.current) return []
  return targetPaths.value.map((p) => {
    const v = get(configStore.current, p)
    return { path: p, value: v }
  })
})

function confirmDelete() {
  if (!configStore.current) return
  let next = configStore.current
  for (const p of targetPaths.value) {
    next = removePath(next, p)
  }
  configStore.current = next
  uiStore.showDeleteDialog = false
}

function cancel() {
  uiStore.showDeleteDialog = false
}
</script>

<template>
  <div v-if="uiStore.showDeleteDialog" class="backdrop" @click.self="cancel">
    <div class="dialog">
      <header>
        <h2>确认删除</h2>
        <p class="subtitle">
          以下
          <strong>{{ targetPaths.length }}</strong>
          个字段将被删除。重启主程序后会恢复为 C# 默认值。
        </p>
      </header>
      <main>
        <div class="mode-tabs">
          <button :class="{ active: mode === 'block' }" @click="changeMode('block')">
            整块删除
          </button>
          <button :class="{ active: mode === 'pattern' }" @click="changeMode('pattern')">
            按模式批量
          </button>
          <button :class="{ active: mode === 'multiSelect' }" @click="changeMode('multiSelect')">
            框选
          </button>
        </div>
        <div class="hint">
          目标:
          <code>{{ path }}</code>
        </div>
        <table v-if="previewValues.length > 0">
          <thead>
            <tr>
              <th>字段路径</th>
              <th>当前值(将被删除)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in previewValues" :key="p.path">
              <td class="path-cell">{{ p.path }}</td>
              <td class="value-cell">
                <code>{{ JSON.stringify(p.value) }}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </main>
      <footer class="actions">
        <button @click="cancel">取消</button>
        <button class="danger" @click="confirmDelete">
          🗑 确认删除({{ targetPaths.length }} 项)
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
}
.dialog {
  background: white;
  border-radius: 8px;
  width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
header {
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}
header h2 {
  margin: 0 0 8px;
}
.subtitle {
  margin: 0;
  font-size: 13px;
  color: #666;
}
main {
  flex: 1;
  overflow: auto;
  padding: 16px 24px;
}
.mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}
.mode-tabs button {
  padding: 8px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: #666;
}
.mode-tabs button.active {
  color: #1890ff;
  border-bottom-color: #1890ff;
}
.hint {
  font-size: 12px;
  color: #666;
  margin-bottom: 12px;
}
.hint code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
}
.path-cell {
  font-family: 'Consolas', monospace;
  color: #003eb3;
  max-width: 280px;
  word-break: break-all;
}
.value-cell {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.value-cell code {
  word-break: break-all;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid #f0f0f0;
}
.actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.actions .danger {
  background: #ff4d4f;
  color: white;
}
</style>
