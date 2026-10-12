#!/usr/bin/env node
/**
 * E2E via raw CDP. Verifies login + file picker renders.
 * Cannot stub IPC dialog so we stop before triggering it.
 */
const { spawn } = require('node:child_process')
const { mkdir, writeFile, rm } = require('node:fs/promises')
const path = require('node:path')
const WebSocket = require('ws')

const PORT = 9224

let id = 1
function send(ws, method, params) {
  params = params || {}
  return new Promise((res, rej) => {
    const i = id++
    function listener(d) {
      const m = JSON.parse(d.toString())
      if (m.id === i) {
        ws.off('message', listener)
        if (m.error) rej(new Error(m.error.message))
        else res(m.result)
      }
    }
    ws.on('message', listener)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function ev(ws, expr) {
  const r = await send(ws, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}

async function waitFor(ws, expr, ms) {
  ms = ms || 12000
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const ok = await ev(ws, '(function(){ try { return !!(' + expr + ')(); } catch(_) { return false; } })()')
    if (ok) return true
    await new Promise(function(r){ setTimeout(r, 300) })
  }
  return false
}

async function main() {
  const exe = path.resolve('release/win-unpacked/系统配置编辑工具.exe')
  const proc = spawn(exe, ['.', '--remote-debugging-port=' + PORT], {
    cwd: process.cwd(),
    env: (function () {
      const out = {}
      for (const k in process.env) if (k !== 'ELECTRON_RUN_AS_NODE') out[k] = process.env[k]
      return out
    })(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stderr.on('data', function (b) { process.stderr.write('[e-err] ' + b) })
  proc.stdout.on('data', function (b) { process.stdout.write('[e-out] ' + b) })

  let target = null
  const t0 = Date.now()
  while (Date.now() - t0 < 10000) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json')
      if (r.ok) {
        const arr = await r.json()
        if (arr[0]) { target = arr[0]; break }
      }
    } catch (_) {}
    await new Promise(function (r) { setTimeout(r, 200) })
  }
  if (!target) { console.error('no CDP target'); proc.kill(); process.exit(2) }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(function (res, rej) {
    ws.once('open', res)
    ws.once('error', rej)
  })
  await send(ws, 'Runtime.enable')
  await send(ws, 'Page.enable')

  let pageErrors = []
  ws.on('Runtime.exceptionThrown', function (e) {
    pageErrors.push(e.exceptionDetails.exception && e.exceptionDetails.exception.description || 'unknown')
  })

  try {
    const hasLogin = await waitFor(
      ws,
      "document.querySelector && document.querySelector('input[type=password]')",
      15000,
    )
    if (!hasLogin) {
      await mkdir('D:/Temp', { recursive: true })
      await writeFile(
        'D:/Temp/e2e-noscript.html',
        await ev(ws, '(document.body && document.body.outerHTML) || ""'),
      )
      console.error('login never appeared, saved D:/Temp/e2e-noscript.html')
      proc.kill()
      process.exit(2)
    }
    console.log('OK login view loaded')

    await ev(
      ws,
      [
        "(function(){",
        "  const i = document.querySelector('input[type=password]');",
        "  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;",
        "  set.call(i, 'admin123'); i.dispatchEvent(new Event('input', { bubbles: true }));",
        "})()",
      ].join('\n'),
    )

    await ev(
      ws,
      [
        "(function(){",
        "  const b = Array.from(document.querySelectorAll('button')).find(function(x){return x.textContent.includes('登录')});",
        "  if (b) b.click();",
        "  return !!b;",
        "})()",
      ].join('\n'),
    )
    console.log('OK clicked 登录')

    const hasPicker = await waitFor(ws, "document.querySelector('.picker-view')", 10000)
    if (!hasPicker) {
      await mkdir('D:/Temp', { recursive: true })
      await writeFile(
        'D:/Temp/e2e-afterlogin.html',
        await ev(ws, 'document.body.outerHTML'),
      )
      console.error('picker never appeared, saved D:/Temp/e2e-afterlogin.html')
      proc.kill()
      process.exit(2)
    }
    console.log('OK file picker rendered')

    const pickerText = await ev(ws, 'document.body.innerText.slice(0, 1000)')
    console.log('PICKER:', pickerText.slice(0, 300))

    await mkdir('D:/Temp', { recursive: true })
    await writeFile('D:/Temp/e2e-picker.html', await ev(ws, 'document.body.outerHTML'))

    const fieldCount = await ev(
      ws,
      "document.querySelectorAll('.item').length",
    )
    console.log('category items:', fieldCount)

    console.log('OK snapshot saved')
    console.log('page errors:', pageErrors.slice(0, 3))
  } catch (e) {
    console.error('err:', e.message)
  } finally {
    proc.kill()
  }
}

main().catch(function (e) {
  console.error('top:', e.message)
  process.exit(1)
})