#!/usr/bin/env node
/**
 * Verify the BOM fix against the actual user file.
 */
import { readFile } from 'node:fs/promises'

const filePath = 'D:/IonImplantationSystemData/Config/SystemConfig.json'

const buf = await readFile(filePath)
console.log('First 10 bytes (hex):', buf.subarray(0, 10).toString('hex'))
console.log('Starts with BOM (EF BB BF)?', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)

let text = buf.toString('utf8')
if (text.charCodeAt(0) === 0xfeff) {
  text = text.slice(1)
  console.log('BOM stripped')
}

try {
  const json = JSON.parse(text)
  console.log('Parse OK. Top-level keys:', Object.keys(json).length)
  console.log('Sample:', Object.keys(json).slice(0, 5).join(', '))
} catch (err) {
  console.error('Parse failed:', (err as Error).message)
  process.exit(1)
}
