const fs = require('node:fs')
fs.writeFileSync('D:/Temp/env-test-result.txt', `RAN=${process.env.ELECTRON_RUN_AS_NODE}\n`)
require('node:fs').writeFileSync(
  'D:/Temp/env-test-result.txt',
  `PID=${process.pid}\nELECTRON=${typeof require('electron')}\nRAN=${process.env.ELECTRON_RUN_AS_NODE}\nprocess.versions.electron=${process.versions.electron}\n`,
)
