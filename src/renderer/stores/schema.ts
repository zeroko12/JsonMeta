import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { mergeTemplate, type SchemaTemplateMap } from '@shared/utils/template-merge'
import { validate, type SchemaField, type ValidationResult } from '@shared/utils/validation'
import type { SchemaDocument } from '@shared/csharp-parser/schema-builder'

/**
 * Holds the loaded schema (descriptions / validation rules / templates) and
 * exposes a merged view that resolves `_useTemplate` references into the
 * actual field tree.
 */
export const useSchemaStore = defineStore('schema', () => {
  const schemaPath = ref<string | null>(null)
  const schema = ref<SchemaDocument | null>(null)
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  const templates = computed<SchemaTemplateMap>(() => {
    return schema.value?._templates ?? {}
  })

  async function load(path: string) {
    isLoading.value = true
    lastError.value = null
    try {
      const data = await window.api.schema.load<SchemaDocument>(path)
      schemaPath.value = path
      schema.value = data
    } catch (err) {
      lastError.value = (err as Error).message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get the field schema for a top-level sub-config, with `_useTemplate`
   * references already merged.
   */
  function getField(path: string): SchemaField | undefined {
    if (!schema.value) return undefined
    const field = schema.value[path]
    if (typeof field !== 'object' || field === null) return undefined
    if ('_type' in field && '_useTemplate' in field) {
      return mergeTemplate(field as SchemaField, templates.value)
    }
    return field as SchemaField
  }

  /** Validate a value against a field schema. */
  function validateValue(value: unknown, field: SchemaField): ValidationResult[] {
    return validate(value, field)
  }

  async function save() {
    if (!schemaPath.value || !schema.value) {
      return { ok: false, error: '没有打开的 schema' }
    }
    return window.api.schema.save(schemaPath.value, schema.value)
  }

  return {
    schemaPath,
    schema,
    templates,
    isLoading,
    lastError,
    load,
    save,
    getField,
    validateValue,
  }
})
