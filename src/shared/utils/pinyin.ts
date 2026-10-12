/**
 * 拼音首字母匹配与关键字高亮引擎
 * 支持中文首字母隐形检索（如 "sjk" 匹配 "数据库"）与精准子串荧光高亮
 */

const BOUNDS = [
  '啊',
  '芭',
  '擦',
  '搭',
  '蛾',
  '发',
  '噶',
  '哈',
  '击',
  '喀',
  '垃',
  '妈',
  '拿',
  '哦',
  '啪',
  '期',
  '然',
  '撒',
  '塌',
  '挖',
  '昔',
  '压',
  '匝',
]

const LETTERS = 'abcdefghjklmnopqrstwxyz'

// 常见多音字 / 常用配置词首字母优先映射表
const SPECIAL_CHAR_MAP: Record<string, string> = {
  重: 'c', // 重试 / 重置 -> c / z
  长: 'c', // 长度 -> c
  行: 'h', // 行业 / 行 -> h
  解: 'j', // 解析 -> j
  数: 's', // 数据库 / 数值 -> s
}

/** 获取单字的拼音首字母 (小写) */
export function getCharInitial(ch: string): string {
  if (!ch) return ''
  if (SPECIAL_CHAR_MAP[ch]) return SPECIAL_CHAR_MAP[ch]
  // 非汉字直接返回小写原字符
  if (!/[\u4e00-\u9fa5]/.test(ch)) {
    return ch.toLowerCase()
  }
  for (let i = BOUNDS.length - 1; i >= 0; i--) {
    if (ch.localeCompare(BOUNDS[i], 'zh-CN') >= 0) {
      return LETTERS[i]
    }
  }
  return ch.toLowerCase()
}

/** 获取整串文本的拼音首字母缩写 */
export function getPinyinInitials(str: string): string {
  if (!str) return ''
  const chars = Array.from(str)
  let res = ''
  for (let i = 0; i < chars.length; i++) {
    res += getCharInitial(chars[i])
  }
  return res
}

export interface MatchResult {
  matched: boolean
  start: number
  end: number
  isPinyin: boolean
}

/**
 * 检查文本是否匹配搜索词 (支持直接子串匹配或拼音首字母匹配)
 */
export function matchTextOrPinyin(text: string, query: string): MatchResult {
  const q = query.trim().toLowerCase()
  if (!q || !text) {
    return { matched: false, start: -1, end: -1, isPinyin: false }
  }

  const rawLower = text.toLowerCase()
  // 1. 优先直接文本子串命中
  const directIdx = rawLower.indexOf(q)
  if (directIdx !== -1) {
    return {
      matched: true,
      start: directIdx,
      end: directIdx + q.length,
      isPinyin: false,
    }
  }

  // 2. 纯英文字符搜索词时，尝试拼音首字母命中
  if (/^[a-z0-9_-]+$/i.test(q)) {
    const chars = Array.from(text)
    const initials = chars.map(getCharInitial).join('')
    const pinyinIdx = initials.indexOf(q)
    if (pinyinIdx !== -1) {
      return {
        matched: true,
        start: pinyinIdx,
        end: pinyinIdx + q.length,
        isPinyin: true,
      }
    }
  }

  return { matched: false, start: -1, end: -1, isPinyin: false }
}

/** HTML 实体安全转义 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 将匹配关键词以 `<mark class="search-kw">` 荧光标签包裹
 * 支持直接文本匹配和拼音首字母对应的中文高亮
 */
export function highlightMatch(text: unknown, query: string): string {
  if (text === null || text === undefined) return ''
  const str = String(text)
  const q = query.trim()
  if (!q) return escapeHtml(str)

  const match = matchTextOrPinyin(str, q)
  if (!match.matched) {
    return escapeHtml(str)
  }

  const before = escapeHtml(str.slice(0, match.start))
  const target = escapeHtml(str.slice(match.start, match.end))
  const after = escapeHtml(str.slice(match.end))

  return `${before}<mark class="search-kw">${target}</mark>${after}`
}
