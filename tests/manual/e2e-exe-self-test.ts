#!/usr/bin/env node
/**
 * E2E self-test against the BUILT EXE.
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'

const EXE = join('release', '系统配置编辑工具-0.1.0-portable.exe')
const TEST_FILE = 'D:/IonImplantationSystemData/Config/SystemConfig.json'
const RESULT = join(process.env.TEMP ?? 'D:/Temp', `e2e-result-${Date.now()}.json`)

console.log(`[e2e-exe] spawning: ${EXE}`)
console.log(`[e2e-exe] test file: ${TEST_FILE}`)
console.log(`[e2e-exe] result file: ${RESULT}`)

const proc = spawn(EXE, [], {
  env: {
    ...process.env,
    E2E_TEST: '1',
    E2E_TEST_FILE: TEST_FILE,
    E2E_TEST_RESULT: RESULT,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
proc.stdout.on('data', (b) => {
  stdout += b.toString()
})
proc.stderr.on('data', (b) => {
  stderr += b.toString()
})

const timeout = setTimeout(() => {
  console.error('[e2e-exe] TIMEOUT after 30s')
  proc.kill('SIGKILL')
  process.exit(2)
}, 30_000)

proc.on('exit', async (code, signal) => {
  clearTimeout(timeout)
  console.log('[e2e-exe] exit code:', code, 'signal:', signal)
  if (stdout.trim()) console.log('[e2e-exe] stdout:', stdout.trim())
  if (stderr.trim()) console.log('[e2e-exe] stderr:', stderr.trim())

  let result: { status: string; [k: string]: unknown } | null = null
  try {
    result = JSON.parse(await readFile(RESULT, 'utf8'))
  } catch (err) {
    console.error(`[e2e-exe] could not read result file: ${(err as Error).message}`)
  }
  try {
    await unlink(RESULT).catch(() => undefined)
  } catch {
    // ignore
  }

  if (result?.status === 'OK') {
    console.log('\n✓ E2E PASS — bundled EXE parsed your real file')
    console.log('  file:    ', result.file)
    console.log('  topKeys: ', result.topKeys)
    console.log('  sample:  ', (result.sample as string[])?.join(', '))
    process.exit(0)
  } else {
    console.error('\n✗ E2E FAIL', result)
    process.exit(1)
  }
})
