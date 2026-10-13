import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import { diff, type ChangeMap } from '@shared/utils/diff'
import { fastSearchTree } from '@shared/utils/tree-search'
import {
  get,
  set,
  remove,
  renameKey,
  moveKey,
  moveArrayItem,
  insertArrayItem,
  addProperty,
  reorderNode as reorderPathNode,
  type JsonValue,
} from '@shared/utils/json-path'

export function safeClone<T>(val: T): T {
  if (val === null || val === undefined) return val
  if (typeof val !== 'object') return val
  try {
    return JSON.parse(JSON.stringify(toRaw(val)))
  } catch {
    try {
      return JSON.parse(JSON.stringify(val))
    } catch {
      return val
    }
  }
}

export interface HistoryState {
  current: unknown
  descriptions: Record<string, string>
  action: string
}

export interface UnifiedChangeItem {
  path: string
  type: 'modify' | 'add' | 'delete'
  category: 'data' | 'description'
  oldValue: unknown
  newValue: unknown
  label: string
}

export interface ModuleOutlineItem {
  key: string
  path: string
  description?: string
  childCount: number
  isModified: boolean
}

export const useJsonDocStore = defineStore('jsonDoc', () => {
  const filePath = ref<string | null>(null)
  const current = ref<unknown>(null)
  const originalSnapshot = ref<unknown>(null)
  const descriptions = ref<Record<string, string>>({})
  const originalDescriptions = ref<Record<string, string>>({})

  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const externalChangePending = ref(false)
  let lastSaveTimestamp = 0

  // 全局 Toast 提示状态
  const saveToast = ref<{ show: boolean; msg: string; type: 'success' | 'error' }>({
    show: false,
    msg: '',
    type: 'success',
  })
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    saveToast.value = { show: true, msg, type }
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      saveToast.value.show = false
    }, 2800)
  }

  // 视图控制
  const viewMode = ref<'visual' | 'code' | 'diff'>('visual')
  const selectedPath = ref<string>('')
  const searchQuery = ref<string>('')
  const expandedPaths = ref<Set<string>>(new Set())

  // 对话框与右侧抽屉
  const showDetailDrawer = ref(false)
  const showDiffModal = ref(false)
  const showBackupModal = ref(false)
  const showAddNodeModal = ref<{ parentPath: string; isArray: boolean } | null>(null)
  const showRawEditModal = ref<{ path: string; title: string; jsonText: string } | null>(null)

  // ─── 黑白主题切换 (dark / light) ───
  const THEME_STORAGE_KEY = 'json_meta_theme'
  const theme = ref<'dark' | 'light'>(
    (localStorage.getItem(THEME_STORAGE_KEY) as 'dark' | 'light') || 'dark',
  )

  function applyTheme(t: 'dark' | 'light') {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t)
    }
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.value)
    } catch {
      // ignore
    }
    applyTheme(theme.value)
  }

  // 初始化应用主题
  applyTheme(theme.value)

  // ─── 最近打开的 3 个文件历史记录 ───
  const RECENT_FILES_KEY = 'json_meta_recent_files'

  function loadRecentFiles(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((p) => typeof p === 'string' && p.trim() !== '').slice(0, 3)
      }
      return []
    } catch {
      return []
    }
  }

  function saveRecentFiles(list: string[]) {
    try {
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list.slice(0, 3)))
    } catch {
      // ignore
    }
  }

  const recentFiles = ref<string[]>(loadRecentFiles())

  function addRecentFile(targetPath: string) {
    if (!targetPath || typeof targetPath !== 'string') return
    const clean = targetPath.trim()
    if (!clean) return
    const rest = recentFiles.value.filter((p) => p !== clean)
    const updated = [clean, ...rest].slice(0, 3)
    recentFiles.value = updated
    saveRecentFiles(updated)
  }

  function clearRecentFiles() {
    recentFiles.value = []
    saveRecentFiles([])
  }

  // 撤销 / 重做堆栈 (最大 80 步)
  const undoStack = ref<HistoryState[]>([])
  const redoStack = ref<HistoryState[]>([])

  const hasFile = computed(() => current.value !== null)
  const fileName = computed(() => {
    if (!filePath.value) return hasFile.value ? '未命名文件.json' : ''
    return filePath.value.split(/[\\/]/).pop() ?? ''
  })

  // 变更检测 (JSON 数值部分)
  const changes = computed<ChangeMap>(() => {
    if (originalSnapshot.value === null || current.value === null) {
      return new Map() as ChangeMap
    }
    return diff(originalSnapshot.value, current.value)
  })

  // 描述变更检测 (中文伴生描述部分)
  const descChanges = computed<UnifiedChangeItem[]>(() => {
    const list: UnifiedChangeItem[] = []
    const orig = originalDescriptions.value || {}
    const curr = descriptions.value || {}
    const allKeys = new Set([...Object.keys(orig), ...Object.keys(curr)])

    for (const k of allKeys) {
      const oldV = orig[k]
      const newV = curr[k]
      if (oldV === undefined && newV !== undefined && newV.trim() !== '') {
        list.push({
          path: k,
          type: 'add',
          category: 'description',
          oldValue: '(无描述)',
          newValue: newV,
          label: '新增中文描述',
        })
      } else if (oldV !== undefined && (newV === undefined || newV.trim() === '')) {
        list.push({
          path: k,
          type: 'delete',
          category: 'description',
          oldValue: oldV,
          newValue: '(已清空)',
          label: '删除中文描述',
        })
      } else if (oldV !== undefined && newV !== undefined && oldV !== newV) {
        list.push({
          path: k,
          type: 'modify',
          category: 'description',
          oldValue: oldV,
          newValue: newV,
          label: '修改中文描述',
        })
      }
    }
    return list
  })

  // 全量统一变更列表 (供 DiffModal 比对审查与全模式计数)
  const allChanges = computed<UnifiedChangeItem[]>(() => {
    const dataList: UnifiedChangeItem[] = changes.value.toArray().map((c) => ({
      path: c.path,
      type: c.type,
      category: 'data' as const,
      oldValue: c.oldValue,
      newValue: c.newValue,
      label: c.type === 'modify' ? '修改数值' : c.type === 'add' ? '新增字段' : '删除字段',
    }))
    return [...dataList, ...descChanges.value]
  })

  const totalChangesCount = computed(() => allChanges.value.length)
  const hasDescChanges = computed(() => descChanges.value.length > 0)
  const isDirty = computed(() => totalChangesCount.value > 0)

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  function isPathModified(path: string): boolean {
    if (changes.value.has(path)) return true
    return descChanges.value.some((d) => d.path === path)
  }

  // ─── 改动定位导航器 (支持点击徽标或快捷键在改动节点间循环跳转) ───
  const changeNavIndex = ref(-1)
  const navTargetTrigger = ref<{ path: string; timestamp: number } | null>(null)

  const modifiedPaths = computed<string[]>(() => {
    const paths = allChanges.value.map((c) => c.path)
    return Array.from(new Set(paths))
  })

  const changeNavText = computed<string>(() => {
    const total = modifiedPaths.value.length
    if (total === 0) return '已存'
    if (changeNavIndex.value >= 0 && changeNavIndex.value < total) {
      return `改动 ${changeNavIndex.value + 1}/${total}`
    }
    return `${total} 处改动`
  })

  // ─── 工业状态栏与结构大纲计算属性 ───
  const totalNodesCount = computed(() => {
    if (current.value === null || typeof current.value !== 'object') return 0
    let count = 0
    function countNodes(val: unknown, depth = 0) {
      if (depth > 60 || val === null || typeof val !== 'object') return
      if (Array.isArray(val)) {
        count += val.length
        for (let i = 0; i < val.length; i++) countNodes(val[i], depth + 1)
      } else {
        const keys = Object.keys(val as Record<string, unknown>)
        count += keys.length
        for (let i = 0; i < keys.length; i++) {
          countNodes((val as Record<string, unknown>)[keys[i]], depth + 1)
        }
      }
    }
    countNodes(current.value)
    return count
  })

  const fileSizeFormatted = computed(() => {
    if (current.value === null) return '0 B'
    try {
      const bytes = new Blob([JSON.stringify(current.value)]).size
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    } catch {
      return '-- KB'
    }
  })

  const topLevelModules = computed<ModuleOutlineItem[]>(() => {
    if (current.value === null || typeof current.value !== 'object' || Array.isArray(current.value))
      return []
    const obj = current.value as Record<string, unknown>
    return Object.keys(obj).map((k) => {
      const val = obj[k]
      const isObj = val !== null && typeof val === 'object'
      const childCount = isObj ? (Array.isArray(val) ? val.length : Object.keys(val).length) : 1
      const desc = descriptions.value[k]
      const mod =
        isPathModified(k) ||
        Array.from(changes.value.keys()).some((p) => p === k || p.startsWith(`${k}.`))
      return {
        key: k,
        path: k,
        description: desc,
        childCount,
        isModified: mod,
      }
    })
  })

  function ensurePathExpanded(path: string): boolean {
    if (!path) return false
    const segments = path.split('.')
    if (segments.length <= 1) return false
    const exp = new Set(expandedPaths.value)
    let cur = ''
    let hasAdded = false
    for (let i = 0; i < segments.length - 1; i++) {
      cur = cur ? `${cur}.${segments[i]}` : segments[i]
      if (!exp.has(cur)) {
        exp.add(cur)
        hasAdded = true
      }
    }
    if (hasAdded) {
      expandedPaths.value = exp
      return true
    }
    return false
  }

  function jumpToNextChange(): string | null {
    if (modifiedPaths.value.length === 0) return null
    if (viewMode.value !== 'visual') {
      viewMode.value = 'visual'
    }
    const list = modifiedPaths.value
    changeNavIndex.value = (changeNavIndex.value + 1) % list.length
    const targetPath = list[changeNavIndex.value]
    ensurePathExpanded(targetPath)
    selectedPath.value = targetPath
    navTargetTrigger.value = { path: targetPath, timestamp: Date.now() }
    return targetPath
  }

  function jumpToSpecificChange(path: string) {
    if (viewMode.value !== 'visual') {
      viewMode.value = 'visual'
    }
    const idx = modifiedPaths.value.indexOf(path)
    if (idx !== -1) {
      changeNavIndex.value = idx
    }
    ensurePathExpanded(path)
    selectedPath.value = path
    navTargetTrigger.value = { path, timestamp: Date.now() }
  }

  // ─── 搜索与高亮导航系统 ───
  const searchScope = ref<'all' | 'key' | 'desc' | 'val'>('desc') // 默认为按描述搜索
  const searchMode = ref<'filter' | 'tree'>('tree') // 默认为全量树定位
  const searchMatchIndex = ref(0)
  const searchTargetTrigger = ref<{ path: string; timestamp: number } | null>(null)

  // 全量搜索匹配路径列表 (内存轻量快速计算，毫秒级响应万级节点)
  const searchMatchPaths = computed<string[]>(() => {
    const q = searchQuery.value.trim()
    if (!q || current.value === null) return []
    return fastSearchTree(toRaw(current.value), descriptions.value, q, searchScope.value)
  })

  const searchMatchCount = computed(() => searchMatchPaths.value.length)

  // 监听匹配路径列表变化，仅展开并高亮当前首个焦点匹配项，避免一次性展开数十个大分支导致卡顿
  watch(
    searchMatchPaths,
    (paths) => {
      if (paths.length === 0) {
        searchMatchIndex.value = 0
        searchTargetTrigger.value = null
      } else {
        if (searchMatchIndex.value >= paths.length) {
          searchMatchIndex.value = 0
        }
        const targetPath = paths[searchMatchIndex.value]
        if (targetPath) {
          ensurePathExpanded(targetPath)
          selectedPath.value = targetPath
          searchTargetTrigger.value = { path: targetPath, timestamp: Date.now() }
        }
      }
    },
    { immediate: true },
  )

  function updateSearchMatches(paths: string[]) {
    // 兼容保留接口 (若外部调用)
    if (paths.length === 0) {
      searchMatchIndex.value = 0
      searchTargetTrigger.value = null
    } else {
      if (searchMatchIndex.value >= paths.length) {
        searchMatchIndex.value = 0
      }
      const targetPath = paths[searchMatchIndex.value]
      if (targetPath) {
        ensurePathExpanded(targetPath)
        selectedPath.value = targetPath
        searchTargetTrigger.value = { path: targetPath, timestamp: Date.now() }
      }
    }
  }

  function nextSearchMatch(): string | null {
    if (searchMatchPaths.value.length === 0) return null
    if (viewMode.value !== 'visual') {
      viewMode.value = 'visual'
    }
    const list = searchMatchPaths.value
    searchMatchIndex.value = (searchMatchIndex.value + 1) % list.length
    const targetPath = list[searchMatchIndex.value]
    ensurePathExpanded(targetPath)
    selectedPath.value = targetPath
    searchTargetTrigger.value = { path: targetPath, timestamp: Date.now() }
    return targetPath
  }

  function prevSearchMatch(): string | null {
    if (searchMatchPaths.value.length === 0) return null
    if (viewMode.value !== 'visual') {
      viewMode.value = 'visual'
    }
    const list = searchMatchPaths.value
    searchMatchIndex.value = (searchMatchIndex.value - 1 + list.length) % list.length
    const targetPath = list[searchMatchIndex.value]
    ensurePathExpanded(targetPath)
    selectedPath.value = targetPath
    searchTargetTrigger.value = { path: targetPath, timestamp: Date.now() }
    return targetPath
  }

  function toggleSearchMode() {
    searchMode.value = searchMode.value === 'filter' ? 'tree' : 'filter'
    if (searchMatchPaths.value.length > 0) {
      const targetPath = searchMatchPaths.value[searchMatchIndex.value]
      if (targetPath) {
        ensurePathExpanded(targetPath)
        selectedPath.value = targetPath
        searchTargetTrigger.value = { path: targetPath, timestamp: Date.now() }
      }
    }
  }

  function clearSearch() {
    searchQuery.value = ''
    searchMatchIndex.value = 0
    searchTargetTrigger.value = null
  }

  // ─── 撤销 / 重做内核 ───

  function recordSnapshot(action: string) {
    if (current.value === null) return
    undoStack.value.push({
      current: safeClone(current.value),
      descriptions: { ...descriptions.value },
      action,
    })
    if (undoStack.value.length > 80) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function undo() {
    if (!canUndo.value || current.value === null) return
    const prev = undoStack.value.pop()!
    redoStack.value.push({
      current: safeClone(current.value),
      descriptions: { ...descriptions.value },
      action: prev.action,
    })
    current.value = prev.current
    descriptions.value = prev.descriptions
  }

  function redo() {
    if (!canRedo.value || current.value === null) return
    const next = redoStack.value.pop()!
    undoStack.value.push({
      current: safeClone(current.value),
      descriptions: { ...descriptions.value },
      action: next.action,
    })
    current.value = next.current
    descriptions.value = next.descriptions
  }

  // ─── 展开 / 折叠控制 ───

  function toggleExpanded(path: string) {
    const s = new Set(expandedPaths.value)
    if (s.has(path)) s.delete(path)
    else s.add(path)
    expandedPaths.value = s
  }

  function expandAll() {
    const s = new Set<string>()
    const raw = toRaw(current.value)
    walkPaths(raw, '', (p) => {
      s.add(p)
    })
    expandedPaths.value = s
  }

  function collapseAll() {
    expandedPaths.value = new Set()
  }

  function walkPaths(val: unknown, currentPath: string, cb: (p: string) => void, depth = 0) {
    if (depth > 60) return
    if (val && typeof val === 'object') {
      if (currentPath) cb(currentPath)
      if (Array.isArray(val)) {
        val.forEach((item, idx) => {
          walkPaths(item, currentPath ? `${currentPath}.${idx}` : `${idx}`, cb, depth + 1)
        })
      } else {
        Object.entries(val).forEach(([k, item]) => {
          walkPaths(item, currentPath ? `${currentPath}.${k}` : k, cb, depth + 1)
        })
      }
    }
  }

  // ─── 文件与元数据加载 / 保存 ───

  async function openFile(targetPath?: string) {
    isLoading.value = true
    lastError.value = null
    try {
      let chosenPath = targetPath
      if (!chosenPath) {
        chosenPath = (await window.api.file.pickJsonFile()) ?? undefined
      }
      if (!chosenPath) return false

      const raw = await window.api.file.readJson<unknown>(chosenPath)
      filePath.value = chosenPath
      addRecentFile(chosenPath)
      current.value = raw
      originalSnapshot.value = safeClone(raw)
      undoStack.value = []
      redoStack.value = []
      changeNavIndex.value = -1
      externalChangePending.value = false

      // 加载伴生元数据
      try {
        const meta = await window.api.file.loadMeta(chosenPath)
        descriptions.value = meta?.descriptions || {}
        originalDescriptions.value = { ...descriptions.value }
      } catch {
        descriptions.value = {}
        originalDescriptions.value = {}
      }

      // 默认展开顶层
      const initExp = new Set<string>()
      if (raw && typeof raw === 'object') {
        if (Array.isArray(raw)) {
          raw.forEach((_, i) => initExp.add(String(i)))
        } else {
          Object.keys(raw).forEach((k) => initExp.add(k))
        }
      }
      expandedPaths.value = initExp

      // 启动磁盘文件监控
      try {
        await window.api.file.watchStart(chosenPath)
      } catch {
        // watch failure not fatal
      }
      return true
    } catch (err) {
      lastError.value = (err as Error).message
      return false
    } finally {
      isLoading.value = false
    }
  }

  function newFile(template: unknown = {}) {
    filePath.value = null
    current.value = template
    originalSnapshot.value = safeClone(template)
    descriptions.value = {}
    originalDescriptions.value = {}
    undoStack.value = []
    redoStack.value = []
    changeNavIndex.value = -1
    expandedPaths.value = new Set()
    viewMode.value = 'visual'
    selectedPath.value = ''
  }

  async function saveFile(): Promise<{ ok: boolean; error?: string }> {
    if (current.value === null) return { ok: false, error: '没有打开的内容' }
    if (!filePath.value) {
      return saveAsFile()
    }
    isLoading.value = true
    try {
      const cleanData = safeClone(current.value)
      const cleanDescriptions = safeClone(descriptions.value)
      const writeRes = await window.api.file.writeJson(filePath.value, cleanData, {
        backup: true,
        maxBackups: 10,
      })
      if (!writeRes.ok) {
        throw new Error(writeRes.error || '写入失败')
      }
      // 保存伴生元数据
      let metaSaved = false
      try {
        await window.api.file.saveMeta(filePath.value, {
          _version: 1,
          descriptions: cleanDescriptions,
          updatedAt: new Date().toISOString(),
        })
        metaSaved = true
      } catch (e) {
        console.warn('保存伴生 meta 失败', e)
      }

      lastSaveTimestamp = Date.now()
      if (filePath.value) {
        addRecentFile(filePath.value)
      }
      changeNavIndex.value = -1
      originalSnapshot.value = safeClone(cleanData)
      originalDescriptions.value = { ...cleanDescriptions }
      showToast(
        metaSaved ? '💾 保存成功！JSON 数据与中文字段描述已同步存盘' : '💾 JSON 数据保存成功！',
        'success',
      )
      return { ok: true }
    } catch (err) {
      lastError.value = (err as Error).message
      showToast(`❌ 保存失败: ${(err as Error).message}`, 'error')
      return { ok: false, error: (err as Error).message }
    } finally {
      isLoading.value = false
    }
  }

  async function saveAsFile(): Promise<{ ok: boolean; error?: string }> {
    if (current.value === null) return { ok: false, error: '没有打开的内容' }
    const picked = await window.api.file.saveAsJsonFile(fileName.value || 'config.json')
    if (!picked) return { ok: false, error: '用户取消' }

    filePath.value = picked
    return saveFile()
  }

  async function reloadFromDisk() {
    if (!filePath.value) return
    externalChangePending.value = false
    lastSaveTimestamp = Date.now()
    await openFile(filePath.value)
  }

  // ─── 节点增删改移核心操作 ───

  function setNodeValue(path: string, value: JsonValue, actionName = '修改字段值') {
    recordSnapshot(actionName)
    if (path === '') {
      current.value = value
    } else {
      current.value = set(current.value as JsonValue, path, value)
    }
  }

  function setNodeDescription(path: string, desc: string) {
    recordSnapshot('修改字段描述')
    const trimmed = desc.trim()
    const next = { ...descriptions.value }
    if (!trimmed) {
      delete next[path]
    } else {
      next[path] = trimmed
    }
    descriptions.value = next
  }

  function deleteNode(path: string) {
    if (!path) return
    recordSnapshot(`删除节点 ${path}`)
    current.value = remove(current.value as JsonValue, path)
    // 递归清理描述
    const nextDesc = { ...descriptions.value }
    delete nextDesc[path]
    for (const k of Object.keys(nextDesc)) {
      if (k.startsWith(`${path}.`)) {
        delete nextDesc[k]
      }
    }
    descriptions.value = nextDesc
    if (selectedPath.value === path || selectedPath.value.startsWith(`${path}.`)) {
      selectedPath.value = ''
    }
  }

  function moveNode(path: string, direction: 'up' | 'down') {
    if (!path) return
    const segments = path.split('.')
    const lastSeg = segments.pop()!
    const parentPath = segments.join('.')

    const parent = parentPath ? get(current.value, parentPath) : current.value
    if (!parent) return

    recordSnapshot(`移动节点 ${path} ${direction}`)
    if (Array.isArray(parent)) {
      const idx = Number.parseInt(lastSeg, 10)
      if (!Number.isNaN(idx)) {
        current.value = moveArrayItem(current.value, parentPath, idx, direction)
      }
    } else if (typeof parent === 'object') {
      current.value = moveKey(current.value, parentPath, lastSeg, direction)
    }
  }

  function remapArrayDescriptions(
    descMap: Record<string, string>,
    parentPath: string,
    sourceIdx: number,
    insertIdx: number,
  ): Record<string, string> {
    if (sourceIdx === insertIdx) return descMap
    const prefix = parentPath ? `${parentPath}.` : ''
    const next: Record<string, string> = {}

    for (const [k, v] of Object.entries(descMap)) {
      if (k.startsWith(prefix)) {
        const rest = k.slice(prefix.length)
        const dotPos = rest.indexOf('.')
        const idxStr = dotPos === -1 ? rest : rest.slice(0, dotPos)
        const subPath = dotPos === -1 ? '' : rest.slice(dotPos)
        const idx = Number.parseInt(idxStr, 10)

        if (!Number.isNaN(idx)) {
          let newIdx = idx
          if (idx === sourceIdx) {
            newIdx = insertIdx
          } else if (sourceIdx < insertIdx && idx > sourceIdx && idx <= insertIdx) {
            newIdx = idx - 1
          } else if (sourceIdx > insertIdx && idx >= insertIdx && idx < sourceIdx) {
            newIdx = idx + 1
          }
          const newKey = `${prefix}${newIdx}${subPath}`
          next[newKey] = v
          continue
        }
      }
      next[k] = v
    }
    return next
  }

  function reorderNode(
    sourcePath: string,
    targetPath: string,
    position: 'before' | 'after' | 'inside' = 'before',
  ) {
    if (!sourcePath || !targetPath || sourcePath === targetPath) return
    if (targetPath.startsWith(`${sourcePath}.`)) {
      showToast('⚠️ 无法将父级节点移动到其自身的子节点内部', 'error')
      return
    }

    recordSnapshot(`拖拽调整节点顺序: ${sourcePath} -> ${targetPath}`)

    const sourceSegs = sourcePath.split('.')
    const sourceKey = sourceSegs.pop()!
    const sourceParentPath = sourceSegs.join('.')

    const targetSegs = targetPath.split('.')
    const targetKey = targetSegs.pop()!
    const targetParentPath = targetSegs.join('.')

    // 同一数组父容器重排序时，智能迁移描述索引
    if (sourceParentPath === targetParentPath && position !== 'inside') {
      const parent = sourceParentPath ? get(current.value, sourceParentPath) : current.value
      if (Array.isArray(parent)) {
        const sIdx = Number.parseInt(sourceKey, 10)
        const tIdx = Number.parseInt(targetKey, 10)
        if (!Number.isNaN(sIdx) && !Number.isNaN(tIdx) && sIdx !== tIdx) {
          let destIdx =
            sIdx < tIdx
              ? position === 'before'
                ? tIdx - 1
                : tIdx
              : position === 'before'
                ? tIdx
                : tIdx + 1
          destIdx = Math.max(0, Math.min(parent.length - 1, destIdx))
          descriptions.value = remapArrayDescriptions(
            descriptions.value,
            sourceParentPath,
            sIdx,
            destIdx,
          )
        }
      }
    }

    current.value = reorderPathNode(current.value, sourcePath, targetPath, position)
    selectedPath.value = targetPath
  }

  function renameNodeKey(path: string, newKey: string) {
    if (!path || !newKey) return
    const segments = path.split('.')
    const oldKey = segments.pop()!
    const parentPath = segments.join('.')

    recordSnapshot(`重命名属性 ${oldKey} -> ${newKey}`)
    current.value = renameKey(current.value, parentPath, oldKey, newKey)

    // 更新描述映射
    const newPath = parentPath ? `${parentPath}.${newKey}` : newKey
    const nextDesc = { ...descriptions.value }
    if (nextDesc[path]) {
      nextDesc[newPath] = nextDesc[path]
      delete nextDesc[path]
    }
    for (const k of Object.keys(nextDesc)) {
      if (k.startsWith(`${path}.`)) {
        const sub = k.slice(path.length)
        nextDesc[`${newPath}${sub}`] = nextDesc[k]!
        delete nextDesc[k]
      }
    }
    descriptions.value = nextDesc
    if (selectedPath.value === path) selectedPath.value = newPath
  }

  function addChildNode(parentPath: string, key: string, initialValue: JsonValue = '') {
    recordSnapshot(`添加子节点到 ${parentPath || 'root'}`)
    const parent = parentPath ? get(current.value, parentPath) : current.value
    if (Array.isArray(parent)) {
      const targetIdx = key ? Number.parseInt(key, 10) : parent.length
      current.value = insertArrayItem(
        current.value,
        parentPath,
        Number.isNaN(targetIdx) ? parent.length : targetIdx,
        initialValue,
      )
    } else {
      current.value = addProperty(current.value, parentPath, key, initialValue)
    }
    // 确保展开父节点
    if (parentPath) {
      const s = new Set(expandedPaths.value)
      s.add(parentPath)
      expandedPaths.value = s
    }
  }

  function revertField(path: string) {
    if (originalSnapshot.value === null) return
    if (path === '(根对象属性排序)') {
      recordSnapshot('还原根属性排序')
      current.value = safeClone(originalSnapshot.value)
      return
    }
    const originalVal = get(originalSnapshot.value, path)
    recordSnapshot(`还原字段值 ${path}`)
    if (originalVal === undefined) {
      current.value = remove(current.value as JsonValue, path)
    } else {
      current.value = set(current.value as JsonValue, path, safeClone(originalVal as JsonValue))
    }
  }

  function revertDescription(path: string) {
    recordSnapshot(`还原字段描述 ${path}`)
    const next = { ...descriptions.value }
    const origVal = originalDescriptions.value[path]
    if (origVal === undefined) {
      delete next[path]
    } else {
      next[path] = origVal
    }
    descriptions.value = next
  }

  function revertChange(item: UnifiedChangeItem) {
    if (item.category === 'description') {
      revertDescription(item.path)
    } else {
      revertField(item.path)
    }
  }

  function revertAll() {
    recordSnapshot('还原全部修改')
    if (originalSnapshot.value !== null) {
      current.value = safeClone(originalSnapshot.value)
    }
    descriptions.value = { ...originalDescriptions.value }
    changeNavIndex.value = -1
  }

  function initExternalListener() {
    window.api.file.onChange(async (event) => {
      if (event.path === filePath.value && event.type === 'change') {
        // 1. 保存后的防抖时间窗口（2000ms），直接忽略自身触发的文件系统写事件
        if (Date.now() - lastSaveTimestamp < 2000) {
          return
        }
        // 2. 深度对比磁盘文件内容与当前内存，若无实质变化则直接忽略
        try {
          if (!filePath.value) return
          const diskData = await window.api.file.readJson<unknown>(filePath.value)
          if (JSON.stringify(diskData) === JSON.stringify(toRaw(current.value))) {
            return
          }
        } catch {
          // 读取失败时提示外部修改
        }
        externalChangePending.value = true
      }
    })
  }

  function changeNodeType(
    path: string,
    newType: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object',
  ) {
    const currentVal = path ? get(current.value, path) : current.value
    let convertedVal: JsonValue = ''

    if (newType === 'string') {
      convertedVal = currentVal !== null && currentVal !== undefined ? String(currentVal) : ''
    } else if (newType === 'number') {
      const num = Number(currentVal)
      convertedVal = Number.isNaN(num) ? 0 : num
    } else if (newType === 'boolean') {
      convertedVal = Boolean(currentVal)
    } else if (newType === 'null') {
      convertedVal = null
    } else if (newType === 'array') {
      convertedVal = Array.isArray(currentVal)
        ? currentVal
        : currentVal !== null && currentVal !== undefined
          ? [currentVal as JsonValue]
          : []
    } else if (newType === 'object') {
      convertedVal =
        typeof currentVal === 'object' && currentVal !== null && !Array.isArray(currentVal)
          ? (currentVal as JsonValue)
          : {}
    }

    setNodeValue(path, convertedVal, `更改类型为 ${newType}`)
  }

  return {
    filePath,
    fileName,
    current,
    originalSnapshot,
    descriptions,
    originalDescriptions,
    isLoading,
    lastError,
    viewMode,
    selectedPath,
    searchQuery,
    expandedPaths,
    isDirty,
    changes,
    descChanges,
    allChanges,
    totalChangesCount,
    isPathModified,
    saveToast,
    showToast,
    canUndo,
    canRedo,
    hasFile,
    externalChangePending,
    showDetailDrawer,
    showDiffModal,
    showBackupModal,
    showAddNodeModal,
    showRawEditModal,
    recordSnapshot,
    undo,
    redo,
    toggleExpanded,
    expandAll,
    collapseAll,
    openFile,
    newFile,
    saveFile,
    saveAsFile,
    reloadFromDisk,
    setNodeValue,
    changeNodeType,
    setNodeDescription,
    deleteNode,
    moveNode,
    reorderNode,
    renameNodeKey,
    addChildNode,
    revertField,
    revertDescription,
    revertChange,
    revertAll,
    initExternalListener,
    changeNavIndex,
    modifiedPaths,
    changeNavText,
    navTargetTrigger,
    jumpToNextChange,
    jumpToSpecificChange,
    ensurePathExpanded,
    searchScope,
    searchMode,
    searchMatchIndex,
    searchMatchCount,
    searchMatchPaths,
    searchTargetTrigger,
    updateSearchMatches,
    nextSearchMatch,
    prevSearchMatch,
    toggleSearchMode,
    clearSearch,
    recentFiles,
    addRecentFile,
    clearRecentFiles,
    totalNodesCount,
    fileSizeFormatted,
    topLevelModules,
    theme,
    toggleTheme,
    applyTheme,
  }
})
