p = 'src/renderer/views/FilePickerView.vue'
with open(p, encoding='utf-8') as f:
    txt = f.read()

# Add recent dir to ui store + load on mount
old_imp = """import { onMounted } from 'vue'"""
new_imp = """import { onMounted, ref } from 'vue'"""
if old_imp in txt:
    txt = txt.replace(old_imp, new_imp, 1)

# Replace onMounted with auto-load
old_mounted = """  configStore.initExternalChangeListener()
  // Auto-load bundled schema (in tool install dir)
  try {
    await schemaStore.loadDefault()
  } catch (err) {
    console.warn('schema.json not loaded yet:', err)
  }
})"""
new_mounted = """  configStore.initExternalChangeListener()
  // Auto-load bundled schema (in tool install dir)
  try {
    await schemaStore.loadDefault()
  } catch (err) {
    console.warn('schema.json not loaded yet:', err)
  }

  // 上次目录自动加载(localStorage 记住, 不需要用户每次选)
  const recent = localStorage.getItem('lastConfigDir')
  if (recent) {
    try {
      const r = await window.api.file.resolveConfigPath(recent)
      if (r) {
        await configStore.loadFile(r)
        emit('loaded')
        return
      }
    } catch {
      // 目录失效则要求用户重新选
    }
  }
})"""
if old_mounted in txt:
    txt = txt.replace(old_mounted, new_mounted, 1)

# Save last dir when pickAndLoad succeeds
old_pick = """async function pickAndOpen() {
  await configStore.pickAndLoad()
  if (configStore.filePath) {
    emit('loaded')
  }
}"""
new_pick = """async function pickAndOpen() {
  await configStore.pickAndLoad()
  if (configStore.filePath) {
    // 记下目录(下次启动自动打开)
    const dir = configStore.filePath.replace(/[\\/][^\\/]+$/, '')
    localStorage.setItem('lastConfigDir', dir)
    emit('loaded')
  }
}"""
if old_pick in txt:
    txt = txt.replace(old_pick, new_pick, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('ok')
