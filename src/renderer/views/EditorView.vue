<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '../stores/config'
import { useSchemaStore } from '../stores/schema'
import { useUiStore } from '../stores/ui'
import ConfigTree from '../components/ConfigTree.vue'
import EditPanel from '../components/EditPanel.vue'
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
    <div class="body">
      <aside class="tree-pane">
        <SearchBar v-if="hasFile" />
        <ConfigTree v-if="hasFile" />
      </aside>
      <main class="edit-pane">
        <EditPanel v-if="hasFile" />
        <div v-else class="placeholder">
          <p>未加载文件。请在顶部菜单选择"打开"。</p>
        </div>
      </main>
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
  width: 360px;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}
.edit-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  overflow: auto;
}
.placeholder {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #999;
}
</style>
