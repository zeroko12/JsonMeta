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

/**
 * Rename a key in an object at parentPath while preserving the key order.
 */
export function renameKey<T>(root: T, parentPath: string, oldKey: string, newKey: string): T {
  if (!oldKey || !newKey || oldKey === newKey) return root
  const parent = get(root, parentPath)
  if (!isObject(parent) || !(oldKey in parent)) return root

  const newObj: JsonObject = {}
  for (const k of Object.keys(parent)) {
    if (k === oldKey) {
      newObj[newKey] = parent[oldKey] as JsonValue
    } else {
      newObj[k] = parent[k] as JsonValue
    }
  }
  return set(root, parentPath, newObj as JsonValue)
}

/**
 * Reorder a key up or down within an object at parentPath while preserving other keys.
 */
export function moveKey<T>(root: T, parentPath: string, key: string, direction: 'up' | 'down'): T {
  const parent = get(root, parentPath)
  if (!isObject(parent) || !(key in parent)) return root

  const keys = Object.keys(parent)
  const idx = keys.indexOf(key)
  if (idx === -1) return root
  if (direction === 'up' && idx === 0) return root
  if (direction === 'down' && idx === keys.length - 1) return root

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  const swapped = [...keys]
  const temp = swapped[idx]!
  swapped[idx] = swapped[targetIdx]!
  swapped[targetIdx] = temp

  const newObj: JsonObject = {}
  for (const k of swapped) {
    newObj[k] = parent[k] as JsonValue
  }
  return set(root, parentPath, newObj as JsonValue)
}

/**
 * Move an array element up or down by index.
 */
export function moveArrayItem<T>(
  root: T,
  arrayPath: string,
  index: number,
  direction: 'up' | 'down',
): T {
  const target = get(root, arrayPath)
  if (!isArray(target)) return root
  if (direction === 'up' && index <= 0) return root
  if (direction === 'down' && index >= target.length - 1) return root

  const nextIdx = direction === 'up' ? index - 1 : index + 1
  const nextArr = [...target]
  const temp = nextArr[index]!
  nextArr[index] = nextArr[nextIdx]!
  nextArr[nextIdx] = temp

  return set(root, arrayPath, nextArr as JsonValue)
}

/**
 * Insert an item into an array at the given index.
 */
export function insertArrayItem<T>(root: T, arrayPath: string, index: number, item: JsonValue): T {
  const target = get(root, arrayPath)
  const arr = isArray(target) ? [...target] : []
  const safeIdx = Math.max(0, Math.min(index, arr.length))
  arr.splice(safeIdx, 0, item)
  return set(root, arrayPath, arr as JsonValue)
}

/**
 * Add or overwrite a property in an object at objectPath.
 */
export function addProperty<T>(root: T, objectPath: string, key: string, value: JsonValue): T {
  if (!key) return root
  const parent = get(root, objectPath)
  const obj = isObject(parent) ? { ...parent } : {}
  obj[key] = value
  return set(root, objectPath, obj as JsonValue)
}

/**
 * Reorder a node relative to a target node.
 * If both share the same parent, reorders them within that parent container.
 * If position is 'inside', moves source into target (if target is container).
 */
export function reorderNode<T>(
  root: T,
  sourcePath: string,
  targetPath: string,
  position: 'before' | 'after' | 'inside' = 'before',
): T {
  if (!sourcePath || !targetPath || sourcePath === targetPath) return root
  if (targetPath.startsWith(`${sourcePath}.`)) return root // Can't move into descendant

  const sourceSegs = splitPath(sourcePath)
  const sourceKey = sourceSegs.pop()!
  const sourceParentPath = sourceSegs.join('.')

  const targetSegs = splitPath(targetPath)
  const targetKey = targetSegs.pop()!
  const targetParentPath = targetSegs.join('.')

  // Same parent reorder
  if (sourceParentPath === targetParentPath && position !== 'inside') {
    const parent = sourceParentPath ? get(root, sourceParentPath) : root
    if (isArray(parent)) {
      const sIdx = Number.parseInt(sourceKey, 10)
      const tIdx = Number.parseInt(targetKey, 10)
      if (Number.isNaN(sIdx) || Number.isNaN(tIdx) || sIdx === tIdx) return root
      if (sIdx < 0 || sIdx >= parent.length || tIdx < 0 || tIdx >= parent.length) return root

      const nextArr = [...parent]
      const [moved] = nextArr.splice(sIdx, 1)
      let insertIdx =
        sIdx < tIdx
          ? position === 'before'
            ? tIdx - 1
            : tIdx
          : position === 'before'
            ? tIdx
            : tIdx + 1
      insertIdx = Math.max(0, Math.min(nextArr.length, insertIdx))
      nextArr.splice(insertIdx, 0, moved)
      return set(root, sourceParentPath, nextArr as JsonValue)
    }

    if (isObject(parent) && sourceKey in parent && targetKey in parent) {
      const keys = Object.keys(parent).filter((k) => k !== sourceKey)
      const tIdx = keys.indexOf(targetKey)
      if (tIdx === -1) return root
      const insertIdx = position === 'before' ? tIdx : tIdx + 1
      keys.splice(insertIdx, 0, sourceKey)
      const nextObj: JsonObject = {}
      for (const k of keys) {
        nextObj[k] = parent[k] as JsonValue
      }
      return set(root, sourceParentPath, nextObj as JsonValue)
    }
  }

  // Cross parent move or move inside container
  const sourceVal = get(root, sourcePath)
  if (sourceVal === undefined) return root
  const targetVal = get(root, targetPath)
  const targetIsContainer = isArray(targetVal) || isObject(targetVal)

  const nextDoc = remove(root, sourcePath)

  if (position === 'inside' && targetIsContainer) {
    if (isArray(targetVal)) {
      return insertArrayItem(nextDoc, targetPath, targetVal.length, sourceVal as JsonValue)
    } else {
      return addProperty(nextDoc, targetPath, sourceKey, sourceVal as JsonValue)
    }
  }

  // Insert relative to target in target's parent
  const destParent = targetParentPath ? get(nextDoc, targetParentPath) : nextDoc
  if (isArray(destParent)) {
    const tIdx = Number.parseInt(targetKey, 10)
    const insertIdx = position === 'before' ? Math.max(0, tIdx) : tIdx + 1
    return insertArrayItem(nextDoc, targetParentPath, insertIdx, sourceVal as JsonValue)
  }

  if (isObject(destParent)) {
    const keys = Object.keys(destParent).filter((k) => k !== sourceKey)
    const tIdx = keys.indexOf(targetKey)
    const insertIdx = position === 'before' ? Math.max(0, tIdx) : tIdx + 1
    keys.splice(insertIdx, 0, sourceKey)
    const nextObj: JsonObject = {}
    for (const k of keys) {
      if (k === sourceKey) {
        nextObj[k] = sourceVal as JsonValue
      } else {
        nextObj[k] = destParent[k] as JsonValue
      }
    }
    return set(nextDoc, targetParentPath, nextObj as JsonValue)
  }

  return root
}
