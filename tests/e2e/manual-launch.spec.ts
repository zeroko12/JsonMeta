import { test, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const DEV_ELECTRON = join('node_modules', 'electron', 'dist', 'electron.exe')

test('connect over CDP to manually-launched Electron', async () => {
  const workDir = join(tmpdir(), `e2e-${Date.now()}`)
  await mkdir(workDir, { recursive: true })
  const TEST_DATA = {
    SoftwareConfig: { EnableTermPower: { IsFirstCtrlInvert: false } },
    IHCConfig: { Kp: 0.1 },
  }
  await writeFile(join(workDir, 'SystemConfig.json'), JSON.stringify(TEST_DATA, null, 2))

  const electron = spawn(DEV_ELECTRON, ['.', '--remote-debugging-port=9222', '--no-sandbox'], {
    cwd: process.cwd(),
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'),
    ),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  electron.stderr?.on('data', (b) => process.stderr.write(`[e-err] ${b}`))
  electron.stdout?.on('data', (b) => process.stdout.write(`[e-out] ${b}`))

  // Wait for CDP to come up
  await new Promise((r) => setTimeout(r, 5000))

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const ctx = browser.contexts()[0]!
  const page = ctx.pages()[0]!

  // Stub IPC at the moment of connect, BEFORE any user interaction.
  // The page is on LoginView; click 浏览 hasn't happened yet.
  // (No reload needed since the app is already past initial script.)
  await page.evaluate(
    ({ workDir, testJson }: { workDir: string; testJson: unknown }) => {
      const w = window as unknown as {
        api: Record<string, (...args: unknown[]) => unknown>
      }
      w.api.file.pickDirectory = async () => {
        console.log('[STUB] pickDirectory called, returning', workDir)
        return workDir
      }
      w.api.file.resolveConfigPath = async () => {
        console.log('[STUB] resolveConfigPath called, returning', workDir + '/SystemConfig.json')
        return workDir + '/SystemConfig.json'
      }
      w.api.file.readJson = async () => {
        console.log('[STUB] readJson called, returning test data')
        return testJson
      }
    },
    { workDir, testJson: TEST_DATA },
  )

  // Verify stubs are applied
  const stubCheck = await page.evaluate(() => {
    const w = window as unknown as { api: { file: Record<string, (...a: unknown[]) => unknown> } }
    return {
      pickDirectoryType: typeof w.api.file.pickDirectory,
      isOriginal: w.api.file.pickDirectory.toString().slice(0, 80),
    }
  })
  console.log('STUB CHECK:', JSON.stringify(stubCheck))

  // Check login
  console.log('password input count:', await page.locator('input[type="password"]').count())
  await page.locator('input[type="password"]').first().fill('admin123', { force: true })
  await page.locator('button:has-text("登录")').first().click({ force: true })
  await page.waitForTimeout(1500)

  console.log('browse button count:', await page.locator('button:has-text("浏览")').count())
  await page.locator('button:has-text("浏览")').first().click({ force: true })
  await page.waitForTimeout(2500)

  const flatListCount = await page.locator('.flat-list').count()
  console.log('flat-list count:', flatListCount)
  if (flatListCount === 0) {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300))
    console.log('BODY TEXT:', bodyText)
    await page.screenshot({ path: 'D:/Temp/e2e-fail.png', fullPage: true })
    const errMsg = await page.evaluate(
      () => document.querySelector('.error, .warn')?.textContent ?? 'no err element',
    )
    console.log('err element:', errMsg)
  }

  const fieldCount = await page.locator('.field').count()
  console.log('field count:', fieldCount)

  if (fieldCount > 0) {
    const firstName = await page.locator('.field .name').first().textContent()
    const firstDesc = await page.locator('.field .desc').first().textContent()
    const firstInputType = await page
      .locator('.field input, .field select')
      .first()
      .evaluate((el: Element) => `${el.tagName}:${(el as HTMLInputElement).type ?? ''}`)
    console.log('first field:', firstName, '|', firstDesc, '|', firstInputType)

    // Search filter
    await page.fill('input[placeholder*="搜索"]', 'Kp')
    await page.waitForTimeout(300)
    console.log('after Kp search:', await page.locator('.field').count())

    // Modify a bool
    await page.locator('.field input[type="checkbox"]').first().check()
    await page.waitForTimeout(300)
    console.log('modified count:', await page.locator('.field.modified').count())
  }

  await browser.close()
  electron.kill('SIGTERM')
  await rm(workDir, { recursive: true, force: true })

  console.log(fieldCount > 0 ? '\n✓ E2E PASS' : '\n✗ E2E FAIL (no fields)')
})
