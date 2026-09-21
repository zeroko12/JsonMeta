/**
 * Compare two JSON-shaped values and report every changed leaf path.
 *
 * Returns a ChangeMap (extends Map<string, Change>) that is also iterable
 * as Change[] for use in change-list dialogs.
 *
 * Semantics:
 *  - "add":    path exists in `current` but not in `original`
 *  - "delete": path exists in `original` but not in `current`
 *  - "modify": path exists in both but values differ
 *
 * For objects: position-based diff (recurse on every key in either side).
 * For arrays:  position-based diff up to common prefix, then trailing
 *              deletes (original-only indices) and trailing adds (current-only indices).
 */

import type { JsonValue } from './json-path'

export type ChangeType = 'add' | 'modify' | 'delete'

export interface Change {
  path: string
  type: ChangeType
  oldValue?: JsonValue
  newValue?: JsonValue
}

export class ChangeMap extends Map<string, Change> {
  /** Returns an array of changes in insertion order (convenience for UI lists). */
  toArray(): Change[] {
    return [...this.values()]
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function isContainer(v: unknown): boolean {
  return isObject(v) || isArray(v)
}

/**
 * Diff two JSON values. The resulting ChangeMap can be iterated directly
 * or queried by path.
 */
export function diff(original: unknown, current: unknown): ChangeMap {
  const changes = new ChangeMap()
  diffInto(original, current, '', changes)
  return changes
}

function diffInto(original: unknown, current: unknown, basePath: string, changes: ChangeMap): void {
  // Both objects — recurse on keys
  if (isObject(original) && isObject(current)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(current)])
    for (const key of keys) {
      const childPath = basePath ? `${basePath}.${key}` : key
      diffInto(original[key], current[key], childPath, changes)
    }
    return
  }

  // Both arrays — position-based diff up to common prefix, then length diff
  if (isArray(original) && isArray(current)) {
    const minLen = Math.min(original.length, current.length)
    for (let i = 0; i < minLen; i++) {
      const childPath = `${basePath}.${i}`
      diffInto(original[i], current[i], childPath, changes)
    }
    for (let i = minLen; i < original.length; i++) {
      const childPath = `${basePath}.${i}`
      changes.set(childPath, {
        path: childPath,
        type: 'delete',
        oldValue: original[i] as JsonValue,
      })
    }
    for (let i = minLen; i < current.length; i++) {
      const childPath = `${basePath}.${i}`
      changes.set(childPath, {
        path: childPath,
        type: 'add',
        newValue: current[i] as JsonValue,
      })
    }
    return
  }

  // Container kind mismatch (object→primitive, primitive→object, array→object, etc.)
  if (isContainer(original) !== isContainer(current)) {
    if (!equals(original, current)) {
      if (basePath !== '') {
        changes.set(basePath, {
          path: basePath,
          type: 'modify',
          oldValue: original as JsonValue,
          newValue: current as JsonValue,
        })
      }
      // When original was a container, every nested leaf was implicitly deleted.
      if (isContainer(original)) {
        collectLeafChanges(original, basePath, changes, 'delete')
      }
      // When current is a container, every nested leaf was implicitly added.
      if (isContainer(current)) {
        collectLeafChanges(current, basePath, changes, 'add')
      }
    }
    return
  }

  // Both leaves — compare values; distinguish "add" / "delete" / "modify" by
  // whether the key was missing on either side.
  if (basePath === '') {
    // root-level scalar vs scalar
    if (!equals(original, current)) {
      changes.set('', {
        path: '',
        type: 'modify',
        oldValue: original as JsonValue,
        newValue: current as JsonValue,
      })
    }
    return
  }

  const wasMissing = !hasValue(original)
  const isMissing = !hasValue(current)

  if (wasMissing && !isMissing) {
    changes.set(basePath, {
      path: basePath,
      type: 'add',
      newValue: current as JsonValue,
    })
    return
  }
  if (!wasMissing && isMissing) {
    changes.set(basePath, {
      path: basePath,
      type: 'delete',
      oldValue: original as JsonValue,
    })
    return
  }
  if (!equals(original, current)) {
    changes.set(basePath, {
      path: basePath,
      type: 'modify',
      oldValue: original as JsonValue,
      newValue: current as JsonValue,
    })
  }
}

/**
 * "Has a value" means the key existed at this level — `undefined` counts
 * as present, `null` counts as present, only "key not in object/array" or
 * out-of-bounds index counts as missing.
 */
function hasValue(v: unknown): boolean {
  if (v === undefined) return false
  return true
}

/**
 * Walk every leaf in `node` and record changes of the given type at the
 * combined path (basePath + relative leaf path).
 */
function collectLeafChanges(
  node: unknown,
  basePath: string,
  changes: ChangeMap,
  kind: 'add' | 'delete',
): void {
  walkLeaves(node, '', (leafPath, value) => {
    const fullPath = basePath && leafPath ? `${basePath}.${leafPath}` : basePath || leafPath
    const entry: Change =
      kind === 'add'
        ? { path: fullPath, type: 'add', newValue: value as JsonValue }
        : { path: fullPath, type: 'delete', oldValue: value as JsonValue }
    changes.set(fullPath, entry)
  })
}

function walkLeaves(
  node: unknown,
  path: string,
  visit: (path: string, value: unknown) => void,
): void {
  if (!isContainer(node)) {
    visit(path, node)
    return
  }
  if (isObject(node)) {
    for (const key of Object.keys(node)) {
      const childPath = path ? `${path}.${key}` : key
      walkLeaves(node[key], childPath, visit)
    }
    return
  }
  if (isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const childPath = `${path}.${i}`
      walkLeaves(node[i], childPath, visit)
    }
  }
}

function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  return false
}
