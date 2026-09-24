const fs = require('node:fs')
const electron = require('electron')
fs.writeFileSync(
  'D:/Temp/e2e-pkg-probe.txt',
  `electron=${typeof electron} | app=${electron && typeof electron.app} | version=${electron && electron.app && electron.app.getVersion()}`,
)
if (electron && electron.app) {
  electron.app.whenReady().then(() => {
    fs.appendFileSync('D:/Temp/e2e-pkg-probe.txt', '\nready=true')
    electron.app.exit(0)
  })
} else {
  fs.appendFileSync('D:/Temp/e2e-pkg-probe.txt', '\nready=false')
  process.exit(1)
}