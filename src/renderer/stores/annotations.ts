import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface Annotation {
  path: string
  description: string
  updatedAt: string
}

export interface HistoryEntry {
  id: string
  time: string
  path: string
  oldValue: unknown
  newValue: unknown
  type: 'add' | 'modify' | 'remove'
}

export interface AnnotationsFile {
  descriptions: Record<string, Annotation>
  history: HistoryEntry[]
}

/**
 * 用户运行时写的描述 + 改动历史。
 * 平级存成 annotations.json(独立于 schema.json)。
 */
export const useAnnotationsStore = defineStore('annotations', () => {
  const annotationsPath = ref<string | null>(null)
  const descriptions = ref<Record<string, Annotation>>({})
  const history = ref<HistoryEntry[]>([])
  const isLoaded = ref(false)

  function getDescription(path: string): string | undefined {
    return descriptions.value[path]?.description
  }

  function setDescription(path: string, description: string) {
    if (!description.trim()) {
      delete descriptions.value[path]
    } else {
      descriptions.value[path] = {
        path,
        description: description.trim(),
        updatedAt: new Date().toISOString(),
      }
    }
    void persist()
  }

  function pushHistory(entry: Omit<HistoryEntry, 'id' | 'time'>) {
    history.value.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      time: new Date().toISOString(),
      ...entry,
    })
    if (history.value.length > 200) history.value = history.value.slice(0, 200)
    void persist()
  }

  async function loadFor(jsonPath: string) {
    const annoPath = jsonPath.replace(/SystemConfig\.json$/, 'annotations.json')
    annotationsPath.value = annoPath
    try {
      const text = await window.api.file.readText(annoPath)
      const parsed = JSON.parse(text) as AnnotationsFile
      descriptions.value = parsed.descriptions || {}
      history.value = parsed.history || []
    } catch {
      // 不存在就是新文件
      descriptions.value = {}
      history.value = []
    }
    isLoaded.value = true
  }

  async function persist() {
    if (!annotationsPath.value) return
    const data: AnnotationsFile = {
      descriptions: descriptions.value,
      history: history.value,
    }
    try {
      await window.api.file.writeText(annotationsPath.value, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('保存 annotations 失败', err)
    }
  }

  function clearHistory() {
    history.value = []
    void persist()
  }

  const hasAnnotations = computed(() => Object.keys(descriptions.value).length > 0)

  return {
    annotationsPath,
    descriptions,
    history,
    isLoaded,
    hasAnnotations,
    getDescription,
    setDescription,
    pushHistory,
    persist,
    loadFor,
    clearHistory,
  }
})
