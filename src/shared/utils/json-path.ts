/**
 * Pure utilities for reading, writing and traversing JSON-shaped values
 * via dotted paths (e.g. "SoftwareConfig.DoorLock1.IsFirstCtrlInvert" or
 * "SoftwareConfig.ImplantElementConfigs.0.Element").
 *
 * All mutating helpers preserve immutability: original references are
 * never touched, new objects are returned when values change.
 */

export type JsonPrimitive = string | number | boolean | null
export type JsonArray = JsonValue[]
export type JsonObject = { [key: string]: JsonValue }
export type JsonValue = JsonPrimitive | JsonArray | JsonObject

export type WalkSignal = 'continue' | 'stop'

export type WalkVisitor = (path: string, value: JsonValue, isLeaf: boolean) => WalkSignal | void

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isArray(v: unknown): v is JsonArray {
  return Array.isArray(v)
}

function splitPath(path: string): string[] {
  if (path === '') return []
  return path.split('.')
}

function parseSegment(segment: string): { kind: 'key' | 'index'; key: string; index: number } {
  // Pure-digit segment = array index
  if (/^\d+$/.test(segment)) {
    return { kind: 'index', key: segment, index: Number.parseInt(segment, 10) }
  }
  return { kind: 'key', key: segment, index: -1 }
}

/**
 * Get a value at the given dotted path. Returns undefined when any
 * intermediate segment is missing or traverses through a non-container.
 */
export function get(root: JsonValue | unknown, path: string): JsonValue | unknown | undefined {
  if (path === '') return root
  const segments = splitPath(path)
  let cur: unknown = root
  for (const seg of segments) {
    if (cur == null) return undefined
    const parsed = parseSegment(seg)
    if (parsed.kind === 'key') {
      if (!isObject(cur)) return undefined
      cur = cur[parsed.key]
    } else {
      if (!isArray(cur)) return undefined
      if (parsed.index >= cur.length) return undefined
      cur = cur[parsed.index]
    }
  }
  return cur
}

/**
 * Test whether a path exists in the object (treats falsy values as existing).
 */
export function has(root: JsonValue | unknown, path: string): boolean {
  if (path === '') return root !== undefined
  const segments = splitPath(path)
  let cur: unknown = root
  for (let i = 0; i < segments.length; i++) {
    if (cur == null) return false
    const parsed = parseSegment(segments[i]!)
    if (parsed.kind === 'key') {
      if (!isObject(cur)) return false
      if (!(parsed.key in cur)) return false
      cur = cur[parsed.key]
    } else {
      if (!isArray(cur)) return false
      if (parsed.index >= cur.length) return false
      cur = cur[parsed.index]
    }
    // Last segment: if we reached here, the key existed (even if value is undefined)
    if (i === segments.length - 1) return true
  }
  return true
}

/**
 * Return a new object with `value` set at `path`. Creates intermediate
 * containers when missing. Original root and any unchanged branches are
 * referenced (not deep-copied).
 */
export function set<T>(root: T, path: string, value: JsonValue): T {
  if (path === '') {
    return value as unknown as T
  }
  const segments = splitPath(path)
  return setAt(root as unknown, segments, 0, value) as T
}

function setAt(node: unknown, segments: string[], depth: number, value: JsonValue): unknown {
  const seg = segments[depth]!
  const parsed = parseSegment(seg)
  const isLast = depth === segments.length - 1

  if (parsed.kind === 'index') {
    const arr = isArray(node) ? [...node] : []
    if (isLast) {
      arr[parsed.index] = value
      return arr
    }
    const next = node && isArray(node) ? node[parsed.index] : undefined
    arr[parsed.index] = setAt(next, segments, depth + 1, value) as JsonValue
    return arr
  }

  // Object branch
  const obj = isObject(node) ? { ...node } : ({} as JsonObject)
  if (isLast) {
    obj[parsed.key] = value
    return obj
  }
  const next = node && isObject(node) ? node[parsed.key] : undefined
  obj[parsed.key] = setAt(next, segments, depth + 1, value) as JsonValue
  return obj
}

/**
 * Return a new object with the path removed. If the path doesn't exist,
 * the original reference is returned unchanged.
 */
export function remove<T>(root: T, path: string): T {
  if (path === '') return root
  const segments = splitPath(path)
  if (!has(root, path)) return root
  return removeAt(root as unknown, segments, 0) as T
}

function removeAt(node: unknown, segments: string[], depth: number): unknown {
  const seg = segments[depth]!
  const parsed = parseSegment(seg)
  const isLast = depth === segments.length - 1

  if (parsed.kind === 'index') {
    if (!isArray(node)) return node
    const arr = [...node]
    if (isLast) {
      arr.splice(parsed.index, 1)
      return arr
    }
    const next = arr[parsed.index]
    arr[parsed.index] = removeAt(next, segments, depth + 1) as JsonValue
    return arr
  }

  if (!isObject(node)) return node
  const obj = { ...node }
  if (isLast) {
    delete obj[parsed.key]
    return obj
  }
  const next = obj[parsed.key]
  obj[parsed.key] = removeAt(next, segments, depth + 1) as JsonValue
  return obj
}

/**
 * Depth-first walk. Calls the visitor at every node (including non-leaves).
 * Returning 'stop' halts traversal. Default signal is 'continue'.
 */
export function walk(root: JsonValue | unknown, visitor: WalkVisitor): void {
  visit(root as unknown, '', true)
  function visit(node: unknown, path: string, isLeaf: boolean): boolean {
    const signal = visitor(path, (node ?? null) as JsonValue, isLeaf)
    if (signal === 'stop') return false

    if (isObject(node)) {
      for (const key of Object.keys(node)) {
        const child = node[key]
        const childPath = path ? `${path}.${key}` : key
        const childLeaf = !isObject(child) && !isArray(child)
        const cont = visit(child, childPath, childLeaf)
        if (!cont) return false
      }
    } else if (isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const child = node[i]
        const childPath = `${path}.${i}`
        const childLeaf = !isObject(child) && !isArray(child)
        const cont = visit(child, childPath, childLeaf)
        if (!cont) return false
      }
    }
    return true
  }
}
