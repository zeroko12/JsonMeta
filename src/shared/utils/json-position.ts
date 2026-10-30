/**
 * JSON 源码位置与 JSONPath 双向高精度定位工具
 *
 * 核心指标：
 * 1. LINE_HEIGHT = 22px, PADDING_TOP = 14px (严格锁定，消除万级行数下的累计像素偏差)
 * 2. findPathRange: 根据 JSONPath 查找在 JSON 源码文本中的行号与字符偏移区间（用于 树形大纲/大纲抽屉 -> 源码视图 定位光标）
 * 3. findPathAtOffset: 根据源码文本中的光标字符偏移量反查对应的 JSONPath（用于 源码视图 -> 树形大纲 同步定位）
 */

export const CODE_LINE_HEIGHT = 22
export const CODE_PADDING_TOP = 14

export interface PathLocation {
  line: number
  startOffset: number
  endOffset: number
  keyStart: number
  keyEnd: number
}

const enum TokenType {
  OpenBrace = 1, // {
  CloseBrace = 2, // }
  OpenBracket = 3, // [
  CloseBracket = 4, // ]
  Colon = 5, // :
  Comma = 6, // ,
  String = 7, // "..."
  Primitive = 8, // number / boolean / null
}

interface Token {
  type: TokenType
  start: number
  end: number
  value?: string
}

/**
 * 分割 JSONPath 路径，数字段转为 number
 */
export function splitPathSegments(path: string): Array<string | number> {
  if (!path) return []
  return path.split('.').map((seg) => (/^\d+$/.test(seg) ? Number.parseInt(seg, 10) : seg))
}

/**
 * 轻量快速 JSON 词法分词器（容错、零依赖、毫秒级响应）
 */
function tokenizeJson(text: string): Token[] {
  const tokens: Token[] = []
  const len = text.length
  let i = 0

  while (i < len) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++
      continue
    }

    if (ch === '{') {
      tokens.push({ type: TokenType.OpenBrace, start: i, end: i + 1 })
      i++
    } else if (ch === '}') {
      tokens.push({ type: TokenType.CloseBrace, start: i, end: i + 1 })
      i++
    } else if (ch === '[') {
      tokens.push({ type: TokenType.OpenBracket, start: i, end: i + 1 })
      i++
    } else if (ch === ']') {
      tokens.push({ type: TokenType.CloseBracket, start: i, end: i + 1 })
      i++
    } else if (ch === ':') {
      tokens.push({ type: TokenType.Colon, start: i, end: i + 1 })
      i++
    } else if (ch === ',') {
      tokens.push({ type: TokenType.Comma, start: i, end: i + 1 })
      i++
    } else if (ch === '"') {
      const start = i
      i++
      let strVal = ''
      while (i < len) {
        const c = text[i]
        if (c === '\\') {
          if (i + 1 < len) {
            strVal += text[i + 1]
            i += 2
          } else {
            i++
          }
        } else if (c === '"') {
          i++
          break
        } else {
          strVal += c
          i++
        }
      }
      tokens.push({ type: TokenType.String, start, end: i, value: strVal })
    } else {
      const start = i
      while (i < len && !' \t\r\n{},[]:\"'.includes(text[i]!)) {
        i++
      }
      tokens.push({ type: TokenType.Primitive, start, end: i, value: text.slice(start, i) })
    }
  }

  return tokens
}

/**
 * 根据字符偏移量计算行号 (1-based)
 */
export function getLineNumber(text: string, offset: number): number {
  let line = 1
  const max = Math.min(offset, text.length)
  for (let i = 0; i < max; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/**
 * 根据 JSONPath 在 JSON 源码文本中查找目标字段的位置
 * 支持叶子字段、对象容器模块、数组项等；若精确路径不存在则向上回退最近祖先
 */
export function findPathRange(text: string, targetPath: string): PathLocation | null {
  const fullSegments = splitPathSegments(targetPath)
  if (fullSegments.length === 0 || !text.trim()) return null

  const tokens = tokenizeJson(text)
  if (tokens.length === 0) return null

  // 尝试逐级回退匹配：从完整路径 targetPath 开始，若未命中则回退到其父级
  for (let segLen = fullSegments.length; segLen >= 1; segLen--) {
    const segments = fullSegments.slice(0, segLen)
    const match = searchTokensForPath(text, tokens, segments)
    if (match) return match
  }

  return null
}

function searchTokensForPath(
  text: string,
  tokens: Token[],
  segments: Array<string | number>,
): PathLocation | null {
  const currentStack: Array<{ isArray: boolean; index: number; currentKey: string }> = []

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]!

    if (t.type === TokenType.OpenBrace) {
      currentStack.push({ isArray: false, index: -1, currentKey: '' })
      i++
    } else if (t.type === TokenType.CloseBrace) {
      currentStack.pop()
      i++
    } else if (t.type === TokenType.OpenBracket) {
      currentStack.push({ isArray: true, index: 0, currentKey: '' })
      i++
    } else if (t.type === TokenType.CloseBracket) {
      currentStack.pop()
      i++
    } else if (t.type === TokenType.Comma) {
      const top = currentStack[currentStack.length - 1]
      if (top) {
        if (top.isArray) top.index++
        else top.currentKey = ''
      }
      i++
    } else if (!currentStack[currentStack.length - 1]?.isArray && t.type === TokenType.String) {
      // 在对象作用域内，如果下一个 token 是冒号，则当前字符串为键名 (Key)
      if (i + 1 < tokens.length && tokens[i + 1]!.type === TokenType.Colon) {
        const top = currentStack[currentStack.length - 1]
        if (top) top.currentKey = t.value || ''

        // 构建当前键对应的路径
        const curPathSegs: Array<string | number> = []
        for (const frame of currentStack) {
          if (frame.isArray) {
            curPathSegs.push(frame.index)
          } else if (frame.currentKey) {
            curPathSegs.push(frame.currentKey)
          }
        }

        if (
          curPathSegs.length === segments.length &&
          curPathSegs.every((s, idx) => String(s) === String(segments[idx]))
        ) {
          // 命中该键！计算该行的字符区间与键区间
          return {
            line: getLineNumber(text, t.start),
            startOffset: t.start,
            endOffset: t.end,
            keyStart: t.start,
            keyEnd: t.end,
          }
        }

        i += 2 // 跳过 key 和冒号
        continue
      }
      i++
    } else if (currentStack[currentStack.length - 1]?.isArray) {
      // 在数组内，当前项开始
      const curPathSegs: Array<string | number> = []
      for (const frame of currentStack) {
        if (frame.isArray) {
          curPathSegs.push(frame.index)
        } else if (frame.currentKey) {
          curPathSegs.push(frame.currentKey)
        }
      }

      if (
        curPathSegs.length === segments.length &&
        curPathSegs.every((s, idx) => String(s) === String(segments[idx]))
      ) {
        return {
          line: getLineNumber(text, t.start),
          startOffset: t.start,
          endOffset: t.end,
          keyStart: t.start,
          keyEnd: t.end,
        }
      }
      i++
    } else {
      i++
    }
  }

  return null
}

/**
 * 根据源码中的字符偏移量反查光标所在的 JSONPath
 */
export function findPathAtOffset(text: string, offset: number): string | null {
  if (!text.trim() || offset < 0) return null
  const tokens = tokenizeJson(text)
  if (tokens.length === 0) return null

  const currentStack: Array<{ isArray: boolean; index: number; currentKey: string }> = []
  let lastMatchedPath: string | null = null

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]!
    if (t.start > offset) {
      break
    }

    if (t.type === TokenType.OpenBrace) {
      currentStack.push({ isArray: false, index: -1, currentKey: '' })
      i++
    } else if (t.type === TokenType.CloseBrace) {
      currentStack.pop()
      const curPathSegs = currentStack
        .map((f) => (f.isArray ? f.index : f.currentKey))
        .filter((x) => x !== '' && x !== -1)
      lastMatchedPath = curPathSegs.length > 0 ? curPathSegs.join('.') : null
      i++
    } else if (t.type === TokenType.OpenBracket) {
      currentStack.push({ isArray: true, index: 0, currentKey: '' })
      i++
    } else if (t.type === TokenType.CloseBracket) {
      currentStack.pop()
      const curPathSegs = currentStack
        .map((f) => (f.isArray ? f.index : f.currentKey))
        .filter((x) => x !== '' && x !== -1)
      lastMatchedPath = curPathSegs.length > 0 ? curPathSegs.join('.') : null
      i++
    } else if (t.type === TokenType.Comma) {
      const top = currentStack[currentStack.length - 1]
      if (top) {
        if (top.isArray) top.index++
        else top.currentKey = ''
      }
      i++
    } else if (
      !currentStack[currentStack.length - 1]?.isArray &&
      t.type === TokenType.String &&
      i + 1 < tokens.length &&
      tokens[i + 1]!.type === TokenType.Colon
    ) {
      const top = currentStack[currentStack.length - 1]
      if (top) top.currentKey = t.value || ''
      const curPathSegs = currentStack
        .map((f) => (f.isArray ? f.index : f.currentKey))
        .filter((x) => x !== '' && x !== -1)
      if (curPathSegs.length > 0) {
        lastMatchedPath = curPathSegs.join('.')
      }
      i += 2
    } else {
      const curPathSegs = currentStack
        .map((f) => (f.isArray ? f.index : f.currentKey))
        .filter((x) => x !== '' && x !== -1)
      if (curPathSegs.length > 0) {
        lastMatchedPath = curPathSegs.join('.')
      }
      i++
    }
  }

  return lastMatchedPath
}
