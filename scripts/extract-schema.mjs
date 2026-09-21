#!/usr/bin/env node
/**
 * Extracts a schema.json file describing SystemConfig.json from C# source.
 *
 * Usage:
 *   node scripts/extract-schema.mjs --src <dir> --out <file>
 *
 *   --src    Root directory containing .cs files (default: D:/project/work/develpment)
 *   --out    Output JSON path (default: ./schema.json)
 *   --entry  Entry class name (default: SystemConfigModel)
 *   --threshold  Min references for a custom type to become a template (default: 3)
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return def
  return args[i + 1] ?? def
}

const SRC = resolve(arg('src', 'D:/project/work/develpment'))
const OUT = resolve(arg('out', './schema.json'))
const ENTRY = arg('entry', 'SystemConfigModel')
const GEN_VERSION = arg('version', '1.0.0')
const TEMPLATE_THRESHOLD = Number.parseInt(arg('threshold', '3'), 10)

// Tokenizer is in TS — import via tsx runner. We dynamically import
// the compiled-on-the-fly TypeScript module.
// (Use a stub if running without tsx for unit tests.)
let tokenizer = null
let schemaBuilder = null
try {
  tokenizer = await import('../src/shared/csharp-parser/tokenizer.ts')
  schemaBuilder = await import('../src/shared/csharp-parser/schema-builder.ts')
} catch (err) {
  console.error('[extract-schema] failed to load parser modules:', err.message)
  console.error('[extract-schema] hint: run via `npx tsx scripts/extract-schema.mjs`')
  process.exit(1)
}

const { parseClass } = tokenizer
const { buildSchema } = schemaBuilder

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'bin' || e.name === 'obj' || e.name === 'node_modules' || e.name.startsWith('.')) continue
      await walk(full, acc)
    } else if (e.isFile() && e.name.endsWith('.cs')) {
      acc.push(full)
    }
  }
  return acc
}

async function main() {
  console.log(`[extract-schema] scanning ${SRC}`)
  const files = await walk(SRC)
  console.log(`[extract-schema] found ${files.length} .cs files`)

  const allClasses = []
  for (const file of files) {
    try {
      const source = await readFile(file, 'utf8')
      const names = discoverClassNames(source)
      for (const name of names) {
        const cls = parseClass(source, name, file)
        if (cls) allClasses.push(cls)
      }
    } catch (err) {
      console.warn(`[extract-schema] failed to read ${file}:`, err.message)
    }
  }
  console.log(`[extract-schema] parsed ${allClasses.length} classes`)

  const entryCls = allClasses.find((c) => c.name === ENTRY)
  if (!entryCls) {
    console.error(`[extract-schema] entry class "${ENTRY}" not found in source`)
    process.exit(1)
  }
  console.log(
    `[extract-schema] entry class "${ENTRY}" has ${entryCls.properties.length} properties`,
  )

  const schema = buildSchema(allClasses, {
    entryClass: ENTRY,
    generatorVersion: GEN_VERSION,
    templateThreshold: TEMPLATE_THRESHOLD,
  })

  const sources = [...new Set(allClasses.map((c) => relative(SRC, c.sourceFile)))].sort()
  schema._meta.sourceFiles = sources

  await writeFile(OUT, JSON.stringify(schema, null, 2), 'utf8')
  console.log(`[extract-schema] wrote ${OUT}`)
  try {
    const sr = await stat(OUT)
    console.log(`[extract-schema] ${(sr.size / 1024).toFixed(1)} KB`)
  } catch {
    // ignore
  }
}

function discoverClassNames(source) {
  const names = new Set()
  const regex = /\b(?:public\s+)?(?:partial\s+)?class\s+([A-Z]\w+)/g
  for (const m of source.matchAll(regex)) {
    names.add(m[1])
  }
  return [...names]
}

main().catch((err) => {
  console.error('[extract-schema] fatal:', err)
  process.exit(1)
})