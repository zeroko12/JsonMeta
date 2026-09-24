<script setup lang="ts">
/**
 * EditorView — 三栏布局
 *
 * 左: 树(导航)
 * 中: 数据树(所有字段 + 就地编辑)
 * 右: FocusedEditPanel — 选中字段后焦点编辑(描述+控件+校验+删除/还原)
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import ConfigTree from '../components/ConfigTree.vue'
import FlatFieldList from '../components/FlatFieldList.vue'
import FocusedEditPanel from '../components/FocusedEditPanel.vue'
import SearchBar from '../components/SearchBar.vue'
import CommandPalette from '../components/CommandPalette.vue'
import TopBar from '../components/TopBar.vue'
import ChangeListDialog from '../components/ChangeListDialog.vue'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog.vue'
import BackupRestoreDialog from '../components/BackupRestoreDialog.vue'
import ExternalChangeDialog from '../components/ExternalChangeDialog.vue'

const configStore = useConfigStore()
const schemaStore = useSchemaStore()
const uiStore = useUiStore()

const hasFile = computed(() => configStore.filePath !== null)
const showFocused = computed(() => !!uiStore.selectedPath && !!field.value)
const field = computed(() =>
  uiStore.selectedPath ? schemaStore.getField(uiStore.selectedPath) : undefined,
)

function handleKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    uiStore.commandPaletteOpen = true
  }
}

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
    <div v-if="hasFile" class="body">
      <aside class="tree-pane">
        <SearchBar />
        <ConfigTree />
      </aside>
      <main class="data-pane">
        <FlatFieldList />
      </main>
      <aside v-if="showFocused" class="focused-pane">
        <FocusedEditPanel />
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
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.tree-pane {
  width: 300px;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  flex-shrink: 0;
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
  width: 420px;
  border-left: 1px solid #e8e8e8;
  background: #fafbfc;
  flex-shrink: 0;
  overflow: hidden;
}
.placeholder {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #999;
}
</style>
