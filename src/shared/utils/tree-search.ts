import { matchTextOrPinyin } from './pinyin'

export type SearchScope = 'all' | 'key' | 'desc' | 'val'

/**
 * 高性能 JSON 树轻量级检索内核
 * - 零包装对象分配 (不构造 TreeRowItem)
 * - 不依赖也不触发 expandedPaths 响应式依赖
 * - 纯内存高效递归，毫秒级返回匹配路径列表 (按文档自然顺序)
 */
export function fastSearchTree(
  obj: unknown,
  descriptions: Record<string, string>,
  query: string,
  scope: SearchScope,
): string[] {
  const q = query.trim()
  if (!q || obj === null || typeof obj !== 'object') return []

  const results: string[] = []
  const isAscii = /^[a-z0-9_-]+$/i.test(q)
  const qLower = q.toLowerCase()

  function isMatch(text: string | null | undefined): boolean {
    if (!text) return false
    // 1. 最快速的原生子串忽略大小写匹配 (针对绝大多数直接汉字或字符搜索)
    if (text.toLowerCase().includes(qLower)) return true
    // 2. 纯英文输入词尝试拼音首字母匹配
    if (isAscii) {
      return matchTextOrPinyin(text, q).matched
    }
    return false
  }

  function walk(curr: unknown, path: string, depth: number) {
    if (depth > 60 || curr === null || typeof curr !== 'object') return

    if (Array.isArray(curr)) {
      for (let i = 0; i < curr.length; i++) {
        const item = curr[i]
        const childPath = path ? `${path}.${i}` : String(i)
        let matched = false

        if (scope === 'key' || scope === 'all') {
          if (isMatch(String(i)) || (path && isMatch(childPath))) {
            matched = true
          }
        }
        if (!matched && (scope === 'desc' || scope === 'all')) {
          const desc = descriptions[childPath]
          if (desc && isMatch(desc)) {
            matched = true
          }
        }
        if (!matched && (scope === 'val' || scope === 'all')) {
          if (item !== null && typeof item !== 'object' && isMatch(String(item))) {
            matched = true
          }
        }

        if (matched) {
          results.push(childPath)
        }

        if (item && typeof item === 'object') {
          walk(item, childPath, depth + 1)
        }
      }
    } else {
      const keys = Object.keys(curr as Record<string, unknown>)
      for (let kIdx = 0; kIdx < keys.length; kIdx++) {
        const k = keys[kIdx]
        const item = (curr as Record<string, unknown>)[k]
        const childPath = path ? `${path}.${k}` : k
        let matched = false

        if (scope === 'key' || scope === 'all') {
          if (isMatch(k) || (path && isMatch(childPath))) {
            matched = true
          }
        }
        if (!matched && (scope === 'desc' || scope === 'all')) {
          const desc = descriptions[childPath]
          if (desc && isMatch(desc)) {
            matched = true
          }
        }
        if (!matched && (scope === 'val' || scope === 'all')) {
          if (item !== null && typeof item !== 'object' && isMatch(String(item))) {
            matched = true
          }
        }

        if (matched) {
          results.push(childPath)
        }

        if (item && typeof item === 'object') {
          walk(item, childPath, depth + 1)
        }
      }
    }
  }

  walk(obj, '', 0)
  return results
}
