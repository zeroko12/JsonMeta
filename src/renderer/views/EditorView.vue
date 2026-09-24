<script setup lang="ts">
/**
 * EditorView — 4 区域固定布局
 *
 * 顶栏:文件路径 + 改动计数 + 保存/放弃/备份
 * 搜索栏:全局 Ctrl+F 聚焦
 * 左:类别过滤 + 数据树(可滚动)
 * 中:字段列表 + 选中高亮
 * 右:选中字段的详情 + 大描述 + 大输入控件 + 删除/还原
 *
 * 改值即写回 store;变化通过 diff 自动累积到 changes。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import TopBar from '../components/TopBar.vue'
import CategoryFilter from '../components/CategoryFilter.vue'
import FlatFieldList from '../components/FlatFieldList.vue'
import FocusedEditPanel from '../components/FocusedEditPanel.vue'
import CommandPalette from '../components/CommandPalette.vue'
import ChangeListDialog from '../components/ChangeListDialog.vue'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog.vue'
import BackupRestoreDialog from '../components/BackupRestoreDialog.vue'
import ExternalChangeDialog from '../components/ExternalChangeDialog.vue'
import HistoryPanel from '../components/HistoryPanel.vue'

const configStore = useConfigStore()
const schemaStore = useSchemaStore()
const uiStore = useUiStore()

const hasFile = computed(() => configStore.filePath !== null)
const showFocused = computed(() => !!uiStore.selectedPath)

const searchRef = ref<HTMLInputElement | null>(null)
const showHistory = ref(false)

function handleKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    uiStore.commandPaletteOpen = true
  }
  // Ctrl+F (no shift) → focus search bar
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    searchRef.value?.focus()
    searchRef.value?.select()
  }
  // Esc → clear search & blur
  if (e.key === 'Escape' && document.activeElement === searchRef.value) {
    uiStore.searchQuery = ''
    ;(e.target as HTMLInputElement).blur()
  }
}

function scrollToSelected() {
  // After selectedPath changes, scroll the corresponding field into view
  const el = document.querySelector(`[data-path="${CSS.escape(uiStore.selectedPath)}"]`)
  if (el) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' })
}

watch(
  () => uiStore.selectedPath,
  () => {
    // Defer to next tick so the .selected class is applied first
    setTimeout(scrollToSelected, 50)
  },
)

onMounted(() => {
  document.addEventListener('keydown', handleKey)
  configStore.detectMainProgram()
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <div class="editor-view">
    <TopBar v-if="hasFile" />

    <div v-if="hasFile" class="search-bar">
      <span class="search-icon">🔍</span>
      <input
        ref="searchRef"
        v-model="uiStore.searchQuery"
        type="text"
        placeholder="Ctrl+F 搜索 — 字段名 / 中文描述 / 路径"
      />
      <button v-if="uiStore.searchQuery" class="clear" @click="uiStore.searchQuery = ''">✕</button>
    </div>

    <div v-if="hasFile" class="body">
      <aside class="left-pane">
        <CategoryFilter />
        <button class="history-btn" @click="showHistory = !showHistory">📜 历史</button>
      </aside>
      <main class="data-pane">
        <FlatFieldList />
      </main>
      <aside v-if="showFocused" class="focused-pane">
        <FocusedEditPanel />
      </aside>
      <aside v-if="showHistory" class="history-pane">
        <HistoryPanel />
      </aside>
    </div>

    <div v-else class="placeholder">
      <p>未加载文件。请在顶部菜单选择"打开"。</p>
    </div>

    <CommandPalette v-if="uiStore.commandPaletteOpen" />
    <ChangeListDialog />
    <DeleteConfirmDialog path="" :whole-subtree="true" />
    <BackupRestoreDialog />
    <ExternalChangeDialog />
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.search-icon {
  color: #999;
  font-size: 13px;
}
.search-bar input {
  flex: 1;
  padding: 4px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.search-bar input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.15);
}
.search-bar .clear {
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 14px;
}
.search-bar .clear:hover {
  color: #333;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.left-pane {
  width: 220px;
  border-right: 1px solid #e8e8e8;
  background: white;
  flex-shrink: 0;
  overflow: auto;
}
.data-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  overflow: hidden;
  min-width: 0;
}
.focused-pane {
  width: 400px;
  border-left: 1px solid #e8e8e8;
  background: #fafbfc;
  flex-shrink: 0;
  overflow: hidden;
}
.history-pane {
  width: 360px;
  border-left: 1px solid #e8e8e8;
  flex-shrink: 0;
  overflow: hidden;
}
.history-btn {
  padding: 6px 10px;
  margin: 4px;
  border: 1px solid #d9d9d9;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: #555;
}
.history-btn:hover {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}
.placeholder {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #999;
}
</style>
