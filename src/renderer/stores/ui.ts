import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * UI state for the editor: search query, command palette visibility, dialog
 * stack, current selected JSON path, tree expansion state.
 */
export const useUiStore = defineStore('ui', () => {
  const searchQuery = ref('')
  const commandPaletteOpen = ref(false)
  const selectedPath = ref<string>('')
  const showOnlyModified = ref(false)
  const expandedKeys = ref<Set<string>>(new Set<string>())
  const showChangeListDialog = ref(false)
  const showDeleteDialog = ref(false)
  const showBackupDialog = ref(false)
  const showLoginPrompt = ref(false)
  const showSchemaEditor = ref(false)
  const schemaReloadPending = ref(false)

  function toggleExpanded(key: string) {
    const s = new Set(expandedKeys.value)
    if (s.has(key)) s.delete(key)
    else s.add(key)
    expandedKeys.value = s
  }

  function expandPath(path: string) {
    const s = new Set(expandedKeys.value)
    const segments = path.split('.')
    let cur = ''
    for (const seg of segments) {
      cur = cur ? `${cur}.${seg}` : seg
      s.add(cur)
    }
    expandedKeys.value = s
  }

  return {
    searchQuery,
    commandPaletteOpen,
    selectedPath,
    showOnlyModified,
    expandedKeys,
    showChangeListDialog,
    showDeleteDialog,
    showBackupDialog,
    showLoginPrompt,
    showSchemaEditor,
    schemaReloadPending,
    toggleExpanded,
    expandPath,
  }
})
