/**
 * Merge instance schema fields with their referenced templates.
 *
 * An instance can reference a template via `_useTemplate`. The merge
 * - Inlines all template fields
 * - Preserves the instance's `_instanceDesc`
 * - Applies `_override` on top of template fields (per-field replacement / addition)
 * - Preserves the template's `_desc` on the merged object
 *
 * Pure / immutable: never mutates the inputs.
 */

import type { SchemaField } from './validation'

export type SchemaTemplateMap = Record<string, SchemaField>

/**
 * Merge a single instance against its referenced template(s). Returns a
 * new SchemaField; never mutates inputs.
 */
export function mergeTemplate(instance: SchemaField, templates: SchemaTemplateMap): SchemaField {
  const templateName = instance._useTemplate
  if (!templateName) {
    return instance
  }
  const template = templates[templateName]
  if (!template) {
    return instance
  }

  const templateFields = template._fields ?? {}
  const overrideFields = instance._override ?? {}

  // Merge: start with template fields, then apply overrides.
  const mergedFields: Record<string, SchemaField> = {}
  for (const [key, field] of Object.entries(templateFields)) {
    mergedFields[key] = { ...field }
  }
  for (const [key, override] of Object.entries(overrideFields)) {
    const existing = mergedFields[key]
    mergedFields[key] = existing ? { ...existing, ...override } : { ...override }
  }

  const result: SchemaField = {
    _type: template._type,
    _fields: mergedFields,
  }
  if (template._desc !== undefined) result._desc = template._desc
  if (instance._instanceDesc !== undefined) result._instanceDesc = instance._instanceDesc
  if (instance._required !== undefined) result._required = instance._required
  if (instance._readOnly !== undefined) result._readOnly = instance._readOnly

  return result
}
