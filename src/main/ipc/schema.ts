/**
 * Schema handler: load / save / validate.
 *
 * The schema file lives in the tool's install directory (e.g. next to the
 * packaged exe) and is owned by the tool itself. Users may edit it with
 * the in-tool editor or externally with any text editor.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SchemaDocument, SchemaMeta } from '../../shared/csharp-parser/schema-builder'
import { validate } from '../../shared/utils/validation'
import type { SchemaField, ValidationResult } from '../../shared/utils/validation'

/** Load a schema file. If missing, returns an empty schema stub. */
export async function loadSchema(schemaPath: string): Promise<SchemaDocument> {
  try {
    const text = await readFile(schemaPath, 'utf8')
    return JSON.parse(text) as SchemaDocument
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptySchema()
    }
    throw err
  }
}

/** Save a schema file with 2-space indent. */
export async function saveSchema(schemaPath: string, schema: SchemaDocument): Promise<void> {
  await mkdir(dirname(schemaPath), { recursive: true })
  const text = JSON.stringify(schema, null, 2)
  await writeFile(schemaPath, text, 'utf8')
}

/** Validate a value against a field schema. Returns validation results. */
export function validateValue(value: unknown, field: SchemaField): ValidationResult[] {
  return validate(value, field)
}

function emptySchema(): SchemaDocument {
  const meta: SchemaMeta = {
    version: 1,
    rootClass: '',
    generatedAt: new Date().toISOString(),
    generatorVersion: '0.0.0',
  }
  return { _meta: meta }
}
