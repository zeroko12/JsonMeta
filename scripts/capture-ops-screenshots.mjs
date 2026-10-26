import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const DEV_ELECTRON = resolve('node_modules', 'electron', 'dist', 'electron.exe')
const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\ce83dd3b-1e0a-4d66-a7f7-701c4b7a6d4d'
const DOCS_IMG_DIR = resolve('docs', 'images')

const SAMPLE_CONFIG = {
  SoftwareConfig: {
    DeviceName: "IonBeamController",
    EnableTermPower: {
      IsFirstCtrlInvert: false,
      IsSecondCtrlInvert: true,
      IsFirstFeedbackInvert: false,
      IsSecondFeedbackInvert: false
    },
    ScanFrequencyHz: 50.0,
    TargetDoseLimit: 1.5e15,
    InterlockEnabled: true
  },
  IHCConfig: {
    DeviceName: "\\\\.\\MMIPAR0",
    Kp: 0.12,
    Ki: 0.02,
    MaxFilamentCurrent: 25.5,
    FilamentPreheatTimeSec: 120
  },
  LoopMasterConfig: {
    Port1: "COM1",
    BaudRate: 115200,
    TimeoutMs: 500,
    AutoReconnect: true
  },
  DoseControlConfig: {
    RemoteIPAddress: "192.168.1.16",
    Port: 8080,
    HeartbeatIntervalSec: 5,
    SyncMode: "DualChannel"
  },
  ChillerConfig: {
    DeviceModel: "SMC-HRS050",
    TargetTemperature: 20.0,
    TempHighAlarmThreshold: 28.5,
    TempLowAlarmThreshold: 15.0,
    CoolingWaterFlowRate: 12.8
  },
  WarningSettingsConfig: {
    EnableAudibleAlarm: true,
    AutoShutdownOnEmergency: true,
    MaxWarningLogEntries: 1000
  }
}

const SAMPLE_META = {
  descriptions: {
    SoftwareConfig: "上位机全局点位、量程、工艺参数与联锁逻辑配置",
    "SoftwareConfig.DeviceName": "主控设备标识名称",
    "SoftwareConfig.EnableTermPower": "终端电源使能与信号极性取反配置",
    "SoftwareConfig.EnableTermPower.IsFirstCtrlInvert": "一控取反 (主控输出信号极性翻转)",
    "SoftwareConfig.EnableTermPower.IsSecondCtrlInvert": "二控取反 (副控输出信号极性翻转)",
    "SoftwareConfig.EnableTermPower.IsFirstFeedbackInvert": "一反馈取反 (主状态回读信号极性翻转)",
    "SoftwareConfig.EnableTermPower.IsSecondFeedbackInvert": "二反馈取反 (副状态回读信号极性翻转)",
    "SoftwareConfig.ScanFrequencyHz": "扫描驱动频率 (Hz)",
    "SoftwareConfig.TargetDoseLimit": "目标注入剂量安全上限",
    "SoftwareConfig.InterlockEnabled": "安全互锁逻辑启用开关",
    IHCConfig: "IHC 阴极与灯丝加热闭环控制系统配置",
    "IHCConfig.DeviceName": "串口驱动设备名",
    "IHCConfig.Kp": "比例增益系数 Kp",
    "IHCConfig.Ki": "积分增益系数 Ki",
    "IHCConfig.MaxFilamentCurrent": "灯丝电流保护上限 (A)",
    "IHCConfig.FilamentPreheatTimeSec": "灯丝预热时间 (秒)",
    LoopMasterConfig: "LoopMaster 分布式总线端口映射与采集卡配置",
    "LoopMasterConfig.Port1": "主采集端口映射",
    "LoopMasterConfig.BaudRate": "串口通信波特率",
    "LoopMasterConfig.TimeoutMs": "响应超时阈值 (毫秒)",
    "LoopMasterConfig.AutoReconnect": "通信异常时自动重连",
    DoseControlConfig: "剂量控制系统上位机网络通信配置",
    "DoseControlConfig.RemoteIPAddress": "远程控制器 IP 地址",
    "DoseControlConfig.Port": "远程控制器通信端口",
    "DoseControlConfig.HeartbeatIntervalSec": "心跳保活检测周期 (秒)",
    "DoseControlConfig.SyncMode": "通道同步采集模式",
    ChillerConfig: "SMC 循环冷水机串口通信与温度监控配置",
    "ChillerConfig.DeviceModel": "冷水机硬件型号",
    "ChillerConfig.TargetTemperature": "目标设定水温 (℃)",
    "ChillerConfig.TempHighAlarmThreshold": "水温超高报警阈值 (℃)",
    "ChillerConfig.TempLowAlarmThreshold": "水温过低报警阈值 (℃)",
    "ChillerConfig.CoolingWaterFlowRate": "冷却水瞬时流量监控 (L/min)",
    WarningSettingsConfig: "全系统警告矩阵、报警阈值与安全联动动作配置",
    "WarningSettingsConfig.EnableAudibleAlarm": "发生异常时蜂鸣声警报",
    "WarningSettingsConfig.AutoShutdownOnEmergency": "触发紧急保护时自动切断束流",
    "WarningSettingsConfig.MaxWarningLogEntries": "本地告警日志保留条数"
  }
}

async function run() {
  const workDir = join(tmpdir(), `json-meta-demo-${Date.now()}`)
  mkdirSync(workDir, { recursive: true })
  mkdirSync(DOCS_IMG_DIR, { recursive: true })
  mkdirSync(ARTIFACT_DIR, { recursive: true })

  const sampleJsonPath = join(workDir, 'SystemConfig.json')
  const sampleMetaPath = join(workDir, 'SystemConfig.meta.json')
  writeFileSync(sampleJsonPath, JSON.stringify(SAMPLE_CONFIG, null, 2), 'utf8')
  writeFileSync(sampleMetaPath, JSON.stringify(SAMPLE_META, null, 2), 'utf8')

  console.log('Sample file prepared:', sampleJsonPath)

  const env = {
    ...process.env,
    E2E_DEBUG_PORT: '9255',
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.E2E_TEST

  const electronProc = spawn(DEV_ELECTRON, ['.', '--remote-debugging-port=9255', '--no-sandbox'], {
    cwd: resolve('.'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  electronProc.stderr.on('data', (d) => process.stderr.write(`[electron-err] ${d}`))
  electronProc.stdout.on('data', (d) => process.stdout.write(`[electron-out] ${d}`))

  await new Promise((r) => setTimeout(r, 4500))

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9255')
    const ctx = browser.contexts()[0]
    const page = ctx.pages()[0]
    await page.setViewportSize({ width: 1366, height: 860 })

    async function saveShot(name) {
      const p1 = join(DOCS_IMG_DIR, name)
      const p2 = join(ARTIFACT_DIR, name)
      await page.screenshot({ path: p1 })
      copyFileSync(p1, p2)
      console.log('Saved screenshot:', name)
    }

    // 1. 空状态 (Empty state)
    await page.waitForTimeout(500)
    await saveShot('01-empty-state.png')

    // 2. 加载文件
    console.log('Loading sample file via doc store...')
    const loadResult = await page.evaluate(async (p) => {
      const doc = window.__jsonDocStore
      if (!doc) return { error: 'no __jsonDocStore' }
      const ok = await doc.openFile(p)
      return { ok, lastError: doc.lastError, hasFile: doc.hasFile }
    }, sampleJsonPath)
    console.log('Load result:', loadResult)

    await page.waitForTimeout(1000)
    // 展开全部节点以便截图完整层级
    await page.evaluate(() => {
      const doc = window.__jsonDocStore
      if (doc && typeof doc.expandAll === 'function') {
        doc.expandAll()
      }
    })
    await page.waitForTimeout(800)

    // 2. 树形大纲与多列列表全景
    await saveShot('02-visual-tree-overview.png')

    // 3. 搜索与中英/拼音过滤 (检索 '取反' 并在注释中高亮匹配项)
    console.log('Searching 取反...')
    const searchInput = page.locator('.capsule-input')
    if (await searchInput.count() > 0) {
      await searchInput.fill('取反')
      await page.waitForTimeout(600)
      await saveShot('03-search-pinyin-filter.png')
      // 清空搜索框
      await searchInput.fill('')
      await page.waitForTimeout(300)
    }

    // 4. 行内编辑与开关状态修改 (修改布尔值与数值，产生改动记录)
    console.log('Triggering in-place edits...')
    await page.evaluate(() => {
      const doc = window.__jsonDocStore
      if (doc) {
        doc.setNodeValue('SoftwareConfig.EnableTermPower.IsFirstCtrlInvert', true, '切换布尔值')
        doc.setNodeValue('SoftwareConfig.ScanFrequencyHz', 60.5, '现场微调频率数值')
      }
    })
    await page.waitForTimeout(600)
    await saveShot('04-inplace-editing.png')

    // 5. 展开节点详细抽屉 (选择微调过的节点)
    console.log('Opening detail drawer...')
    await page.evaluate(() => {
      const doc = window.__jsonDocStore
      if (doc) {
        doc.selectedPath = 'SoftwareConfig.ScanFrequencyHz'
        doc.showDetailDrawer = true
      }
    })
    await page.waitForTimeout(700)
    await saveShot('05-node-detail-drawer.png')
    // 收起抽屉
    await page.evaluate(() => {
      const doc = window.__jsonDocStore
      if (doc) {
        doc.showDetailDrawer = false
      }
    })
    await page.waitForTimeout(400)

    // 6. 右键菜单
    console.log('Opening context menu...')
    const targetRow = page.locator('.tree-row:has-text("DeviceName")').first()
    if (await targetRow.count() > 0) {
      await targetRow.click({ button: 'right' })
      await page.waitForTimeout(600)
      await saveShot('06-context-menu-actions.png')
      // 点击背景关闭右键菜单
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    // 7. 差异化改动审计 (Diff 模式)
    console.log('Switching to Diff review mode...')
    const diffTab = page.locator('.mode-tab-btn:has-text("改动审查")')
    if (await diffTab.count() > 0) {
      await diffTab.click()
      await page.waitForTimeout(700)
      await saveShot('07-diff-audit-review.png')
      // 切回可视化模式
      await page.locator('.mode-tab-btn:has-text("树形大纲")').click()
      await page.waitForTimeout(500)
    }

    // 8. 历史快照与安全回滚弹窗
    console.log('Opening history snapshots modal...')
    const backupBtn = page.locator('.tool-btn:has-text("快照备份")')
    if (await backupBtn.count() > 0) {
      await backupBtn.click()
      await page.waitForTimeout(700)
      await saveShot('08-history-snapshots.png')
      // 关闭弹窗
      await page.evaluate(() => {
        if (window.__jsonDocStore) window.__jsonDocStore.showBackupModal = false
      })
      await page.waitForTimeout(400)
    }

    // 9. 切换为浅色明亮工业主题
    console.log('Switching to light theme...')
    const themeBtn = page.locator('.theme-toggle-btn')
    if (await themeBtn.count() > 0) {
      await themeBtn.click()
      await page.waitForTimeout(600)
      await saveShot('09-light-theme.png')
      // 切回深色
      await themeBtn.click()
      await page.waitForTimeout(400)
    }

    // 10. 联系开发者弹窗
    console.log('Opening contact developer modal...')
    const contactBtn = page.locator('.about-toggle-btn')
    if (await contactBtn.count() > 0) {
      await contactBtn.click()
      await page.waitForTimeout(600)
      await saveShot('10-contact-developer.png')
      await page.evaluate(() => {
        if (window.__jsonDocStore) window.__jsonDocStore.showAboutModal = false
      })
      await page.waitForTimeout(300)
    }

    console.log('🎉 ALL 10 SCREENSHOTS CAPTURED AND SAVED!')
    await browser.close()
  } catch (err) {
    console.error('Error during capture:', err)
  } finally {
    electronProc.kill()
    process.exit(0)
  }
}

run()
