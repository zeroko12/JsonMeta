import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { diff, type ChangeMap } from '@shared/utils/diff'
import { get, set, remove, type JsonValue } from '@shared/utils/json-path'

/**
 * Holds the currently loaded SystemConfig.json (current + original snapshot),
 * tracks dirty changes, and exposes file ops through the IPC bridge.
 */
export const useConfigStore = defineStore('config', () => {
  const filePath = ref<string | null>(null)
  const current = ref<unknown>(null)
  const originalSnapshot = ref<unknown>(null)
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const mainProgramRunning = ref(false)
  const externalChangePending = ref(false)

  const isDirty = computed(() => changes.value.size > 0)

  const changes = computed<ChangeMap>(() => {
    return diff(originalSnapshot.value, current.value)
  })

  async function pickAndLoad() {
    isLoading.value = true
    lastError.value = null
    try {
      const dir = await window.api.file.pickDirectory()
      if (!dir) return false
      // Resolve SystemConfig.json — may be at <dir>/SystemConfig.json OR <dir>/Config/SystemConfig.json
      const resolved = await window.api.file.resolveConfigPath(dir)
      if (!resolved) {
        lastError.value = `在 ${dir} 或 ${dir}\\Config 下找不到 SystemConfig.json`
        return false
      }
      await loadFile(resolved)
      return true
    } catch (err) {
      lastError.value = (err as Error).message
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function loadFile(path: string) {
    isLoading.value = true
    lastError.value = null
    try {
      const data = await window.api.file.readJson<unknown>(path)
      filePath.value = path
      current.value = data
      originalSnapshot.value = structuredClone(data)
      externalChangePending.value = false
      await window.api.file.watchStart(path)
      // 同时加载该文件下平级的 annotations.json(用户运行时写的描述/历史)
      try {
        const { useAnnotationsStore } = await import('./annotations')
        await useAnnotationsStore().loadFor(path)
      } catch {
        // 加载失败不影响主流程
      }
    } catch (err) {
      lastError.value = (err as Error).message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function save(): Promise<{
    ok: boolean
    backupPath?: string
    changed: boolean
    error?: string
  }> {
    if (!filePath.value || current.value === null) {
      return { ok: false, changed: false, error: '没有打开的文件' }
    }
    const result = await window.api.file.writeJson(filePath.value, current.value, {
      backup: true,
      maxBackups: 10,
    })
    if (result.ok) {
      originalSnapshot.value = structuredClone(current.value)
    }
    return result
  }

  function discardChanges() {
    if (originalSnapshot.value !== null) {
      current.value = structuredClone(originalSnapshot.value)
    }
  }

  async function detectMainProgram() {
    const r = await window.api.process.detectMainProgram()
    mainProgramRunning.value = r.running
  }

  // Subscribe to external change events from main process
  function initExternalChangeListener() {
    window.api.file.onChange((event) => {
      if (event.path === filePath.value && event.type === 'change') {
        externalChangePending.value = true
      }
    })
  }

  async function reloadFromDisk() {
    if (!filePath.value) return
    await loadFile(filePath.value)
  }

  function revertField(path: string) {
    if (originalSnapshot.value === null) return
    const original = get(originalSnapshot.value, path)
    if (original === undefined) {
      current.value = remove(current.value as JsonValue, path)
    } else {
      current.value = set(current.value as JsonValue, path, original as JsonValue)
    }
  }

  return {
    filePath,
    current,
    originalSnapshot,
    isLoading,
    lastError,
    isDirty,
    changes,
    mainProgramRunning,
    externalChangePending,
    pickAndLoad,
    loadFile,
    save,
    discardChanges,
    revertField,
    detectMainProgram,
    initExternalChangeListener,
    reloadFromDisk,
  }
})
