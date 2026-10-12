<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const codeText = ref('')
const parseError = ref<string | null>(null)
const isLocalInputting = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// 载入当前数据到代码编辑器
function loadFromDoc() {
  if (doc.current === null) {
    codeText.value = ''
    return
  }
  try {
    codeText.value = JSON.stringify(doc.current, null, 2)
    validateSyntax()
  } catch (e) {
    codeText.value = String(doc.current)
  }
}

watch(
  () => doc.viewMode,
  (mode) => {
    if (mode === 'code') {
      loadFromDoc()
    }
  },
  { immediate: true },
)

// 当用户通过顶栏撤销/重做或外部修改引起 doc.current 变动时，实时同步代码文本
watch(
  () => doc.current,
  (newVal) => {
    if (doc.viewMode === 'code' && !isLocalInputting.value && newVal !== null) {
      try {
        const text = JSON.stringify(newVal, null, 2)
        if (text !== codeText.value) {
          codeText.value = text
          validateSyntax()
        }
      } catch {
        // ignore
      }
    }
  },
  { deep: false },
)

function validateSyntax(): boolean {
  if (!codeText.value.trim()) {
    parseError.value = null
    return true
  }
  try {
    JSON.parse(codeText.value)
    parseError.value = null
    return true
  } catch (err) {
    parseError.value = (err as Error).message
    return false
  }
}

function onCodeInput() {
  isLocalInputting.value = true
  validateSyntax()

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (validateSyntax()) {
      try {
        const parsed = JSON.parse(codeText.value)
        doc.recordSnapshot('源码模式编辑')
        doc.current = parsed
      } catch {
        // ignore
      }
    }
    isLocalInputting.value = false
  }, 300)
}

function formatCode(indent: number) {
  try {
    const obj = JSON.parse(codeText.value)
    codeText.value = JSON.stringify(obj, null, indent)
    if (validateSyntax()) {
      doc.recordSnapshot('格式化源码')
      doc.current = obj
    }
  } catch (e) {
    parseError.value = '无法格式化：当前内容存在语法错误'
  }
}

function minifyCode() {
  try {
    const obj = JSON.parse(codeText.value)
    codeText.value = JSON.stringify(obj)
    if (validateSyntax()) {
      doc.recordSnapshot('压缩源码')
      doc.current = obj
    }
  } catch (e) {
    parseError.value = '无法压缩：当前内容存在语法错误'
  }
}

const changeCount = computed(() => doc.totalChangesCount)

// 计算代码行数
const lines = computed(() => {
  return codeText.value.split('\n').length || 1
})

// 全局搜索词在当前源码中的匹配计数
const matchCount = computed(() => {
  const q = doc.searchQuery.trim().toLowerCase()
  if (!q || !codeText.value) return 0
  let count = 0
  let pos = 0
  const lower = codeText.value.toLowerCase()
  while ((pos = lower.indexOf(q, pos)) !== -1) {
    count++
    pos += q.length
  }
  return count
})
</script>

<template>
  <div class="raw-code-editor">
    <!-- 统一二级子工具条 (38px, 全模式严格对齐) -->
    <div class="sub-toolbar">
      <div class="sub-left">
        <span class="sub-title">📝 源码模式</span>
        <span v-if="!parseError" class="sub-badge ok">✅ 语法正确</span>
        <span v-else class="sub-badge error">❌ 语法错误</span>
        <span v-if="changeCount > 0" class="unified-change-badge" title="当前存在未保存改动">
          ● {{ changeCount }} 处改动
        </span>
        <span v-if="doc.searchQuery" class="sub-filter-hint">
          (搜索 "{{ doc.searchQuery }}", 找到 {{ matchCount }} 处)
        </span>
      </div>
      <div class="sub-right">
        <button class="sub-tool-btn" @click="formatCode(2)">美化 (2 空格)</button>
        <button class="sub-tool-btn" @click="formatCode(4)">美化 (4 空格)</button>
        <button class="sub-tool-btn" @click="minifyCode">压缩 (Minify)</button>
      </div>
    </div>

    <!-- 文本编辑区 (带行号栏) -->
    <div class="editor-main">
      <div class="line-gutter">
        <div v-for="n in lines" :key="n" class="line-num">{{ n }}</div>
      </div>
      <textarea
        v-model="codeText"
        class="code-textarea"
        spellcheck="false"
        placeholder="在此输入或粘贴 JSON 源码..."
        @input="onCodeInput"
      />
    </div>

    <!-- 底部错误提示栏 -->
    <div v-if="parseError" class="error-bar">
      <span class="err-icon">⚠️</span>
      <span class="err-text">{{ parseError }}</span>
    </div>
  </div>
</template>

<style scoped>
.raw-code-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #141417;
  color: #f1f5f9;
  min-height: 0;
}

/* 统一二级子工具条 (38px) */
.sub-toolbar {
  height: 38px;
  background: #1a1a20;
  border-bottom: 1px solid #282832;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  flex-shrink: 0;
  user-select: none;
}
.sub-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}
.sub-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
}
.sub-badge.ok {
  background: #052e16;
  color: #4ade80;
  border: 1px solid #14532d;
}
.sub-badge.error {
  background: #450a0a;
  color: #f87171;
  border: 1px solid #7f1d1d;
}

/* 全模式统一改动徽章 */
.unified-change-badge {
  background: #3b280c;
  color: #fbbf24;
  border: 1px solid #634212;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
}

.sub-filter-hint {
  font-size: 11px;
  color: #3b82f6;
  font-style: italic;
}

.sub-right {
  display: flex;
  gap: 6px;
}
.sub-tool-btn {
  background: #262632;
  border: 1px solid #383848;
  color: #cbd5e1;
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.1s;
}
.sub-tool-btn:hover {
  background: #333342;
  color: #fff;
  border-color: #4c4c60;
}

.editor-main {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  background: #141417;
}

/* 行号栏 */
.line-gutter {
  width: 48px;
  background: #18181f;
  border-right: 1px solid #24242e;
  padding: 14px 0;
  user-select: none;
  overflow: hidden;
  flex-shrink: 0;
  text-align: right;
}
.line-num {
  padding-right: 12px;
  font-family: 'Consolas', 'Fira Code', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #475569;
}

.code-textarea {
  flex: 1;
  width: 100%;
  border: none;
  background: #141417;
  color: #38bdf8;
  padding: 14px;
  font-family: 'Consolas', 'Fira Code', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  resize: none;
  tab-size: 2;
  box-sizing: border-box;
}

.error-bar {
  background: #450a0a;
  color: #fca5a5;
  border-top: 1px solid #7f1d1d;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: monospace;
}
</style>
