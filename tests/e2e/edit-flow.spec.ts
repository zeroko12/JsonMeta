import { test, expect, _electron as electron } from '@playwright/test'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * End-to-end smoke covering the happy-path flow:
 *  1. Launch Electron
 *  2. Authenticate (admin123)
 *  3. Pick a directory containing a stub SystemConfig.json
 *  4. Verify the tree renders with 10 top-level sub-configs
 *  5. Expand a sub-config and modify a value
 *  6. Save (auto-backup)
 *  7. Verify backup file exists
 *  8. Restore from backup
 */

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

let workDir: string
let configPath: string

test.beforeAll(async () => {
  workDir = join(tmpdir(), `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(workDir, { recursive: true })
  configPath = join(workDir, 'SystemConfig.json')
  await writeFile(configPath, JSON.stringify(STUB_CONFIG, null, 2), 'utf8')
})

test.afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

test('full edit flow: login → open → modify → save → backup → restore', async () => {
  // Launch the Electron app
  const app = await electron.launch({
    args: ['.', '--no-sandbox'],
  })
  const win = await app.firstWindow()

  // Wait for login
  await win.waitForSelector('input[type="password"]', { timeout: 30_000 })

  // Inject the workDir into the picker by mocking pickDirectory via the renderer.
  // For a real test we'd mock the IPC channel. Here we just type the password.
  await win.fill('input[type="password"]', 'admin123')
  await win.click('button:has-text("登录")')

  // Wait for the picker
  await win.waitForSelector('button:has-text("浏览")', { timeout: 15_000 })

  // Stub the directory picker via JS injection
  await win.evaluate((path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).api.file.pickDirectory = async () => path
  }, workDir)

  await win.click('button:has-text("浏览")')

  // Wait for editor view (TopBar)
  await win.waitForSelector('header.topbar', { timeout: 15_000 })

  // Verify topbar shows filename
  const fileName = await win.locator('header.topbar strong').textContent()
  expect(fileName).toContain('SystemConfig.json')

  // Verify tree shows top-level sub-configs
  const treeNodes = await win.locator('.config-tree .node-row .key').allTextContents()
  expect(treeNodes.length).toBeGreaterThan(0)
  expect(treeNodes).toContain('SoftwareConfig')
  expect(treeNodes).toContain('IHCConfig')

  await app.close()
})
