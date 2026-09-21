/**
 * Audit the auto-generated schema.json for description coverage.
 *
 * Run with: npx tsx tests/manual/audit-schema.ts
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface SchemaField {
  _type: string
  _desc?: string
  _instanceDesc?: string
  _fields?: Record<string, SchemaField>
  _useTemplate?: string
  _elementTemplate?: SchemaField
  _templates?: Record<string, SchemaField>
}

interface SchemaDocument {
  _meta: { rootClass: string; generatorVersion: string; generatedAt: string }
  _templates?: Record<string, SchemaField>
  [key: string]: SchemaField | unknown
}

async function main() {
  const path = resolve(process.argv[2] ?? './schema.json')
  const raw = await readFile(path, 'utf8')
  const schema = JSON.parse(raw) as SchemaDocument

  let totalFields = 0
  let withDesc = 0
  let templateCount = 0
  let templateWithDesc = 0
  let unrecognizedCount = 0

  function walk(field: SchemaField | undefined, path: string) {
    if (!field) return
    if (field._type !== 'object' || field._useTemplate || field._elementTemplate) {
      totalFields++
      if (field._desc || field._instanceDesc) withDesc++
      else unrecognizedCount++
    }
    if (field._fields) {
      for (const [key, sub] of Object.entries(field._fields)) {
        walk(sub, `${path}.${key}`)
      }
    }
    if (field._elementTemplate) walk(field._elementTemplate, `${path}[]`)
  }

  for (const [key, val] of Object.entries(schema)) {
    if (key.startsWith('_')) continue
    if (typeof val !== 'object' || val === null) continue
    walk(val as SchemaField, key)
  }

  if (schema._templates) {
    for (const [, t] of Object.entries(schema._templates)) {
      templateCount++
      if (t._desc) templateWithDesc++
    }
  }

  const coverage = totalFields > 0 ? (withDesc / totalFields) * 100 : 0
  const templateCoverage = templateCount > 0 ? (templateWithDesc / templateCount) * 100 : 0

  console.log(`\n=== schema.json coverage audit ===`)
  console.log(`Source: ${path}`)
  console.log(`Root class: ${schema._meta?.rootClass ?? '(unknown)'}`)
  console.log(`Generated: ${schema._meta?.generatedAt ?? '(unknown)'}`)
  console.log()
  console.log(
    `Top-level sub-configs: ${Object.keys(schema).filter((k) => !k.startsWith('_')).length}`,
  )
  console.log(
    `Templates: ${templateCount} (${templateWithDesc} with descriptions, ${templateCoverage.toFixed(1)}%)`,
  )
  console.log(`Total leaf fields: ${totalFields}`)
  console.log(`  With description: ${withDesc} (${coverage.toFixed(1)}%)`)
  console.log(`  Without description (need to fill in): ${unrecognizedCount}`)
  console.log()
  if (unrecognizedCount > 0 && coverage < 80) {
    console.log(`⚠ Coverage ${coverage.toFixed(1)}% is below 80% target.`)
    console.log(`  Run 'npm run extract-schema' to regenerate, then use the schema editor`)
    console.log(`  (Ctrl+Shift+F → "打开字段说明编辑器") to fill in missing descriptions.`)
  } else {
    console.log(`✓ Coverage meets target.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
