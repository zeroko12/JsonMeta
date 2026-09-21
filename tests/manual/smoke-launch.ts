#!/usr/bin/env node
/**
 * Smoke test: verify the packaged app starts without runtime errors.
 *
 * Spawns the packaged Electron EXE in background, polls for errors in
 * stdout/stderr, then kills it after N seconds. Reports OK / FAIL.
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const EXE_PATH = resolve('release/系统配置编辑工具-0.1.0-portable.exe')
const TIMEOUT_MS = 8000

console.log(`[smoke] launching: ${EXE_PATH}`)
const proc = spawn(EXE_PATH, [], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const stdout = []
const stderr = []

proc.stdout.on('data', (b) => stdout.push(b.toString()))
proc.stderr.on('data', (b) => stderr.push(b.toString()))

const errors = []
const warnings = []
const allOutput = []

proc.stdout.on('data', (b) => {
  const s = b.toString()
  allOutput.push(s)
  if (/Error:|TypeError|SyntaxError|ReferenceError|Uncaught/.test(s)) {
    errors.push(s.trim())
  }
})
proc.stderr.on('data', (b) => {
  const s = b.toString()
  allOutput.push(s)
  if (/Error|TypeError|SyntaxError|ReferenceError|Uncaught/.test(s)) {
    errors.push(s.trim())
  } else if (/WARN|warn/.test(s)) {
    warnings.push(s.trim())
  }
})

setTimeout(() => {
  console.log(`[smoke] process alive after ${TIMEOUT_MS}ms: ${!proc.killed}`)
  console.log(`[smoke] errors: ${errors.length}`)
  if (errors.length > 0) {
    console.log('[smoke] first 5 errors:')
    for (const e of errors.slice(0, 5)) console.log('  -', e.slice(0, 200))
  }
  console.log(`[smoke] warnings: ${warnings.length}`)
  if (warnings.length > 0) {
    console.log('[smoke] first 3 warnings:')
    for (const w of warnings.slice(0, 3)) console.log('  -', w.slice(0, 200))
  }

  console.log(`[smoke] killing process...`)
  proc.kill('SIGTERM')
  setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL')
    console.log('[smoke] done.')
    const ok = errors.length === 0
    console.log(ok ? '\n✓ SMOKE PASS' : '\n✗ SMOKE FAIL')
    process.exit(ok ? 0 : 1)
  }, 2000)
}, TIMEOUT_MS)

proc.on('exit', (code, signal) => {
  console.log(`[smoke] process exited early: code=${code} signal=${signal}`)
})
