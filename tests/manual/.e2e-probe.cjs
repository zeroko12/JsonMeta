const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

console.log('[probe] electron module loaded:', typeof app, typeof BrowserWindow)
fs.writeFileSync(
  'D:/Temp/e2e-probe.txt',
  `electron=${typeof app} | ${typeof BrowserWindow} | pid=${process.pid}`,
)

if (typeof app === 'undefined') {
  process.exit(1)
}

app.whenReady().then(() => {
  fs.appendFileSync('D:/Temp/e2e-probe.txt', `\nready=true`)
  app.exit(0)
})