<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { useUiStore } from '../stores/ui'
import { useConfigStore } from '../stores/config'

const uiStore = useUiStore()
const configStore = useConfigStore()

const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

interface CmdItem {
  id: string
  label: string
  detail?: string
  action: () => void
}

const commands = computed<CmdItem[]>(() => {
  const cmds: CmdItem[] = [
    {
      id: 'open',
      label: '打开文件',
      detail: '选择 SystemConfig.json 所在目录',
      action: async () => {
        close()
        await configStore.pickAndLoad()
      },
    },
    {
      id: 'save',
      label: '保存',
      detail: '保存当前修改(自动备份)',
      action: async () => {
        close()
        await configStore.save()
      },
    },
    {
      id: 'discard',
      label: '撤销所有修改',
      detail: '丢弃本次会话的所有编辑',
      action: () => {
        configStore.discardChanges()
        close()
      },
    },
    {
      id: 'show-modified',
      label: uiStore.showOnlyModified ? '显示全部' : '仅显示已修改',
      action: () => {
        uiStore.showOnlyModified = !uiStore.showOnlyModified
        close()
      },
    },
    {
      id: 'backup',
      label: '查看备份',
      action: () => {
        uiStore.showBackupDialog = true
        close()
      },
    },
    {
      id: 'reload',
      label: '从磁盘重新加载',
      detail: '丢弃内存中所有未保存的修改',
      action: async () => {
        await configStore.reloadFromDisk()
        close()
      },
    },
    {
      id: 'check-main',
      label: '检测主程序',
      action: async () => {
        await configStore.detectMainProgram()
        close()
      },
    },
    {
      id: 'schema-editor',
      label: '打开 schema 编辑器',
      action: () => {
        uiStore.showSchemaEditor = true
        close()
      },
    },
  ]
  return cmds
})

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return commands.value
  return commands.value.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q))
})

function close() {
  uiStore.commandPaletteOpen = false
  query.value = ''
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <div class="palette-backdrop" @click.self="close" @keydown="onKey">
    <div class="palette" role="dialog" aria-label="命令面板">
      <input ref="inputRef" v-model="query" placeholder="输入命令..." @keydown.escape="close" />
      <ul>
        <li v-for="(c, i) in filtered" :key="c.id" :class="{ active: i === 0 }">
          <button @click="c.action()">
            <span class="label">{{ c.label }}</span>
            <span v-if="c.detail" class="detail">{{ c.detail }}</span>
          </button>
        </li>
        <li v-if="filtered.length === 0" class="empty">无匹配</li>
      </ul>
      <p class="hint">Ctrl+Shift+F 打开/关闭 · Esc 退出</p>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 100px;
  z-index: 1000;
}
.palette {
  width: 560px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.palette input {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.palette ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 320px;
  overflow: auto;
}
.palette li button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.palette li.active button,
.palette li button:hover {
  background: #e6f7ff;
}
.label {
  font-size: 14px;
}
.detail {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}
.empty {
  padding: 16px;
  text-align: center;
  color: #999;
}
.hint {
  margin: 0;
  padding: 8px 16px;
  border-top: 1px solid #f0f0f0;
  color: #999;
  font-size: 11px;
}
</style>
