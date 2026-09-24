import { test, expect, _electron as electron } from '@playwright/test'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

const STUB_CONFIG = {
  SoftwareConfig: {
    EnableTermPower: {
      IsFirstCtrlInvert: false,
      IsSecondCtrlInvert: false,
    },
  },
  IHCConfig: { DeviceName: '\\\\.\\MMIPAR0', Kp: 0.1, Ki: 0.01 },
  LoopMasterConfig: { Port1: 'COM1' },
  DoseControlConfig: { RemoteIPAddress: '192.168.1.16' },
  IonSourceControlConfig: {},
  PLCControlConfig: {},
  BokePumpSerialPortConfig: {},
  TemperatureControllerConfig: {},
  ChillerConfig: {},
  WarningSettingsConfig: {},
}

const DEV_ELECTRON = join('node_modules', 'electron', 'dist', 'electron.exe')

let workDir: string

test.beforeAll(async () => {
  workDir = join(tmpdir(), `e2e-${Date.now()}`)
  await mkdir(workDir, { recursive: true })
  await writeFile(join(workDir, 'SystemConfig.json'), JSON.stringify(STUB_CONFIG, null, 2), 'utf8')
})

test.afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

async function launchApp() {
  // Use unpackaged dev electron + executablePath (so Playwright skips its own loader)
  return electron.launch({
    executablePath: DEV_ELECTRON,
    args: ['.', '--remote-debugging-port=9222'],
    cwd: process.cwd(),
  })
}

test.skip(!existsSync(DEV_ELECTRON), 'electron dev binary not found')

test('full edit flow: login → load → verify tree', async () => {
  const app = await launchApp()
  const win = await app.firstWindow()

  await win.waitForSelector('input[type="password"]', { timeout: 30_000 })

  await win.fill('input[type="password"]', 'admin123')
  await win.click('button:has-text("登录")')

  await win.waitForSelector('button:has-text("浏览")', { timeout: 15_000 })

  await win.evaluate((path: string) => {
    ;(
      window as { api: { file: { pickDirectory: () => Promise<string> } } }
    ).api.file.pickDirectory = async () => path
  }, workDir)

  await win.click('button:has-text("浏览")')

  await win.waitForSelector('header.topbar', { timeout: 15_000 })

  const fileName = await win.locator('header.topbar strong').textContent()
  expect(fileName).toContain('SystemConfig.json')

  const treeKeys = await win.locator('.config-tree .node-row .key').allTextContents()
  expect(treeKeys).toContain('SoftwareConfig')
  expect(treeKeys).toContain('IHCConfig')

  await win.screenshot({ path: 'e2e-screenshot.png' })

  await app.close()
})

test('BOM file (Notepad-saved) is parsed correctly', async () => {
  const bomWorkDir = join(tmpdir(), `e2e-bom-${Date.now()}`)
  await mkdir(bomWorkDir, { recursive: true })
  const bomBytes = Buffer.from([0xef, 0xbb, 0xbf])
  const body = Buffer.from(JSON.stringify(STUB_CONFIG, null, 2), 'utf8')
  await writeFile(join(bomWorkDir, 'SystemConfig.json'), Buffer.concat([bomBytes, body]))

  const app = await launchApp()
  const win = await app.firstWindow()

  await win.waitForSelector('input[type="password"]', { timeout: 30_000 })
  await win.fill('input[type="password"]', 'admin123')
  await win.click('button:has-text("登录")')
  await win.waitForSelector('button:has-text("浏览")', { timeout: 15_000 })

  await win.evaluate((path: string) => {
    ;(
      window as { api: { file: { pickDirectory: () => Promise<string> } } }
    ).api.file.pickDirectory = async () => path
  }, bomWorkDir)

  await win.click('button:has-text("浏览")')
  await win.waitForSelector('header.topbar', { timeout: 15_000 })

  const treeKeys = await win.locator('.config-tree .node-row .key').allTextContents()
  expect(treeKeys).toContain('SoftwareConfig')

  await app.close()
  await rm(bomWorkDir, { recursive: true, force: true })
})
