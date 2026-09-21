/**
 * Regex-based tokenizer for the C# source we care about (configuration
 * models in this project). Not a full parser — just enough to extract
 * class ranges, property declarations, attributes and comments.
 */

import type { CSharpAttribute, CSharpClass, CSharpProperty } from './types'

interface ClassRange {
  startLine: number
  endLine: number
}

/**
 * Locate a class declaration and its matching closing brace, returning
 * the 1-indexed start/end line numbers. Tracks braces while ignoring
 * braces inside string literals and comments.
 */
export function findClassRange(source: string, className: string): ClassRange | null {
  const lines = source.split(/\r?\n/)
  const classRegex = new RegExp(
    `\\b(?:public\\s+)?(?:partial\\s+)?class\\s+${escapeRegex(className)}\\b`,
  )
  let openBraceLine = -1
  let startLine = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (openBraceLine === -1) {
      if (classRegex.test(line)) {
        startLine = i + 1
      }
      const openIdx = line.indexOf('{')
      if (openIdx !== -1 && startLine !== 0) {
        openBraceLine = i
        // If the class body opens and closes on the same line (e.g. `class X {}`),
        // we can early-return.
        if (matchingCloseExistsOnSameLine(line, openIdx)) {
          return { startLine, endLine: i + 1 }
        }
        break
      }
    }
  }
  if (openBraceLine === -1) return null

  // Walk forward from openBraceLine scanning the rest of the file as a single stream
  const remaining = lines.slice(openBraceLine).join('\n')

  let depth = 0
  let i = 0
  while (i < remaining.length) {
    const ch = remaining[i]!
    // Skip strings (handle escape sequences minimally)
    if (ch === '"') {
      i++
      while (i < remaining.length && remaining[i] !== '"') {
        if (remaining[i] === '\\') i++ // skip escaped char
        i++
      }
      i++
      continue
    }
    if (ch === "'") {
      // char literal
      i++
      while (i < remaining.length && remaining[i] !== "'") {
        if (remaining[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    // Skip line comments
    if (ch === '/' && remaining[i + 1] === '/') {
      while (i < remaining.length && remaining[i] !== '\n') i++
      continue
    }
    // Skip block comments
    if (ch === '/' && remaining[i + 1] === '*') {
      i += 2
      while (i < remaining.length - 1 && !(remaining[i] === '*' && remaining[i + 1] === '/')) {
        i++
      }
      i += 2
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
    i++
  }
  if (depth !== 0) return null

  // closedOffset points just after the `}` that brought depth to 0.
  const closedLine = openBraceLine + (remaining.slice(0, i).match(/\n/g)?.length ?? 0) + 1
  return { startLine, endLine: closedLine }
}

function matchingCloseExistsOnSameLine(line: string, openIdx: number): boolean {
  let depth = 0
  for (let i = openIdx; i < line.length; i++) {
    if (line[i] === '{') depth++
    else if (line[i] === '}') {
      depth--
      if (depth === 0) return true
    }
  }
  return false
}

/**
 * Extract the substring between `openIdx` and `closeIdx` (exclusive).
 * Used for trimming the outer class braces from the body before parsing.
 */
export function extractClassBody(source: string, openIdx: number, closeIdx: number): string {
  return source.slice(openIdx + 1, closeIdx)
}

/**
 * Extract /// XML comment lines immediately preceding a property. Returns
 * the joined summary text, or undefined if none.
 */
function captureXmlCommentBefore(lines: string[], propLineIdx: number): string | undefined {
  const captured: string[] = []
  let i = propLineIdx - 1
  while (i >= 0) {
    const line = lines[i]!.trim()
    if (line.startsWith('///')) {
      // Strip the leading /// and any leading whitespace
      captured.unshift(line.replace(/^\/\/\/\s?/, ''))
      i--
    } else if (line === '') {
      // Blank line interrupts the doc block
      break
    } else {
      break
    }
  }
  if (captured.length === 0) return undefined

  // Extract <summary>...</summary> if present, else return joined text
  const joined = captured.join(' ').trim()
  const summaryMatch = joined.match(/<summary>([\s\S]*?)<\/summary>/i)
  if (summaryMatch) {
    return summaryMatch[1]!.trim()
  }
  return joined
}

function captureInlineComment(line: string): string | undefined {
  // Find // outside of strings
  let inString = false
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i]!
    if (ch === '"' && line[i - 1] !== '\\') inString = !inString
    if (!inString && ch === '/' && line[i + 1] === '/') {
      return line.slice(i + 2).trim()
    }
  }
  return undefined
}

const ATTR_REGEX = /\[([A-Za-z_][\w.]*)\s*(?:\(([^)]*)\))?\s*\]/g

function captureAttributes(line: string): { attrs: CSharpAttribute[]; rest: string } {
  const attrs: CSharpAttribute[] = []
  let rest = line
  for (const m of line.matchAll(ATTR_REGEX)) {
    attrs.push({ name: m[1]!, args: m[2] })
    rest = rest.replace(m[0], '')
  }
  return { attrs, rest: rest.trimStart() }
}

/**
 * Regex capturing a property declaration. Allows leading attributes,
 * access modifiers, generic types, and { get; (set|init); } accessors.
 *
 * Group 1: type (e.g. "List<ImplantElementConfig>")
 * Group 2: name
 * Group 3: "set" or "init" or absent
 * Group 4: default-value expression (text between `=` and `;`)
 */
/**
 * Regex capturing a property OR public field declaration. The actual
 * type/name extraction is done by `splitTypeAndName` (more robust than a
 * single regex for generic types).
 *
 * Form 1 (auto-property):  `public T Name { get; set; } = initializer;`
 * Form 2 (public field):   `public T Name = initializer;`
 */
const PROP_REGEX =
  /(?:public|private|internal|protected)\s+(?:readonly\s+)?(\S+(?:\s+\S+)*?)\s+_?(\w+)(?:\s*\{\s*get;\s*(set|init)?\s*;\s*\})?(?:\s*=\s*([^;]+))?;?/

/**
 * Parse all properties from a class body. Returns one entry per matched
 * declaration (with attributes, /// comment, and inline comment if present).
 */
export function parsePropertiesFromBody(body: string, _sourceFile: string): CSharpProperty[] {
  const lines = body.split(/\r?\n/)
  const props: CSharpProperty[] = []
  // Accumulator for attributes / leading decorators from preceding lines.
  // Cleared after each consumed property.
  let pendingAttrs: CSharpAttribute[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()
    // Attribute-only line: accumulate and continue.
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const { attrs } = captureAttributes(trimmed)
      pendingAttrs.push(...attrs)
      continue
    }
    const fullLine = collectContinuation(lines, i)
    const { attrs: lineAttrs, rest } = captureAttributes(fullLine.text)
    const combinedAttrs = pendingAttrs.length > 0 ? [...pendingAttrs, ...lineAttrs] : lineAttrs
    const propMatch = rest.match(PROP_REGEX)
    if (!propMatch) {
      // Not a property — reset accumulator and skip.
      pendingAttrs = []
      continue
    }

    const split = splitTypeAndName(rest)
    if (!split) {
      pendingAttrs = []
      continue
    }
    const { type, name } = split
    const accessor = propMatch[3]
    const defaultValue = propMatch[4]?.trim()
    const isInitOnly = accessor === 'init'
    const inlineComment = captureInlineComment(fullLine.text)

    const xmlComment = captureXmlCommentBefore(lines, i)

    props.push({
      name,
      type,
      isInitOnly,
      defaultValue,
      attributes: combinedAttrs,
      xmlComment,
      inlineComment,
      line: i + 1,
    })

    pendingAttrs = []

    // Skip the continuation lines we already consumed
    i += fullLine.consumed - 1
  }
  return props
}

/**
 * Robustly split a property declaration line into type and name. Handles
 * generic types like `Dictionary<string, double>` whose V-name cannot be
 * matched by simple whitespace splitting.
 *
 * Returns null if the line doesn't look like a property declaration.
 */
export function splitTypeAndName(line: string): { type: string; name: string } | null {
  // Strip leading whitespace
  const trimmed = line.trim()
  // Skip access modifier and optional readonly
  const m = trimmed.match(/^(?:public|private|internal|protected)\s+(?:readonly\s+)?/)
  if (!m) return null
  let i = m[0].length

  // Read the type. An identifier (with optional `?`), then optionally a
  // balanced `<...>` block (no nested angle brackets to keep it simple).
  if (!/[A-Za-z_]/.test(trimmed[i] ?? '')) return null
  const typeStart = i
  while (i < trimmed.length && /[\w?]/.test(trimmed[i]!)) i++
  if (trimmed[i] === '<') {
    let depth = 1
    i++
    while (i < trimmed.length && depth > 0) {
      const ch = trimmed[i]!
      if (ch === '<') depth++
      else if (ch === '>') depth--
      i++
    }
  }
  // Optionally allow trailing `[` for arrays like `int[]`
  while (i < trimmed.length && trimmed[i] === '[') {
    i++
    if (trimmed[i] === ']') i++
  }

  const type = trimmed.slice(typeStart, i).trim()

  // Skip whitespace
  while (i < trimmed.length && /\s/.test(trimmed[i]!)) i++

  // Optional leading underscore on private backing fields
  if (trimmed[i] === '_') i++

  // Read the name (identifier)
  const nameStart = i
  if (!/[A-Za-z_]/.test(trimmed[i] ?? '')) return null
  while (i < trimmed.length && /\w/.test(trimmed[i]!)) i++
  const name = trimmed.slice(nameStart, i)

  return { type, name }
}

/**
 * Collect a logical statement that may span multiple lines (e.g. property
 * with new initializer that spans 3 lines).
 */
function collectContinuation(
  lines: string[],
  startIdx: number,
): { text: string; consumed: number } {
  let text = lines[startIdx] ?? ''
  let consumed = 1
  let openBraces = (text.match(/\{/g) ?? []).length
  let closeBraces = (text.match(/\}/g) ?? []).length
  let openParens = (text.match(/\(/g) ?? []).length
  let closeParens = (text.match(/\)/g) ?? []).length

  while (
    (openBraces > closeBraces || openParens > closeParens) &&
    startIdx + consumed < lines.length
  ) {
    const next = lines[startIdx + consumed] ?? ''
    text += '\n' + next
    consumed++
    openBraces += (next.match(/\{/g) ?? []).length
    closeBraces += (next.match(/\}/g) ?? []).length
    openParens += (next.match(/\(/g) ?? []).length
    closeParens += (next.match(/\)/g) ?? []).length
  }
  return { text, consumed }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Convenience: locate a class and parse all its properties.
 */
export function parseClass(
  source: string,
  className: string,
  sourceFile: string,
): CSharpClass | null {
  const range = findClassRange(source, className)
  if (!range) return null
  const lines = source.split(/\r?\n/)
  const classStartLine = lines.findIndex(
    (l, idx) => idx + 1 === range.startLine && l.includes(`class ${className}`),
  )
  const classDeclLine = classStartLine >= 0 ? classStartLine : range.startLine - 1
  const xmlComment = captureXmlCommentBefore(lines, classDeclLine)
  const openIdx = source.indexOf('{', source.indexOf(`class ${className}`))
  const closeIdx = findMatchingBrace(source, openIdx)
  if (closeIdx === -1) return null
  const body = source.slice(openIdx + 1, closeIdx)
  const properties = parsePropertiesFromBody(body, sourceFile)
  return {
    name: className,
    xmlComment,
    properties,
    sourceFile,
    startLine: range.startLine,
    endLine: range.endLine,
  }
}

function findMatchingBrace(source: string, openIdx: number): number {
  if (openIdx === -1) return -1
  let depth = 0
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i]!
    const next = source[i + 1]
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}
