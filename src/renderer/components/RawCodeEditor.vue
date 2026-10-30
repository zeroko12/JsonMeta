<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'
import { findPathRange, findPathAtOffset, getLineNumber } from '@shared/utils/json-position'

const doc = useJsonDocStore()
const codeText = ref('')
const parseError = ref<string | null>(null)
const isLocalInputting = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineGutterRef = ref<HTMLDivElement | null>(null)

// 跟踪当前高亮/光标所在的行与路径
const activePath = ref<string | null>(null)
const activeLine = ref<number | null>(null)
const flashActive = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 将视图居中滚动并聚焦到指定 JSONPath 对应的代码行与键名
 */
async function locateAndFocusPath(path: string, shouldFlash = true) {
  if (!path || !codeText.value) return
  await nextTick()
  const loc = findPathRange(codeText.value, path)
  if (!loc) return

  activeLine.value = loc.line
  activePath.value = path

  if (textareaRef.value) {
    const textarea = textareaRef.value
    textarea.focus()
    textarea.setSelectionRange(loc.keyStart, loc.keyEnd)

    // 行高 13px * 1.6 ≈ 20.8px
    const lineHeight = 20.8
    const targetScrollTop = Math.max(
      0,
      (loc.line - 1) * lineHeight - textarea.clientHeight / 2 + lineHeight / 2,
    )
    textarea.scrollTop = targetScrollTop
    if (lineGutterRef.value) {
      lineGutterRef.value.scrollTop = targetScrollTop
    }

    if (shouldFlash) {
      flashActive.value = true
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => {
        flashActive.value = false
      }, 1800)
    }
  }
}

// 载入当前数据到代码编辑器并自动定位光标
function loadFromDoc() {
  if (doc.current === null) {
    codeText.value = ''
    return
  }
  try {
    codeText.value = JSON.stringify(doc.current, null, 2)
    validateSyntax()
    if (doc.selectedPath) {
      void locateAndFocusPath(doc.selectedPath, true)
    }
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

// 当用户通过树形大纲/检索等在外部更改 selectedPath 时，在源码中即时同步定位
watch(
  () => doc.selectedPath,
  (newPath) => {
    if (
      doc.viewMode === 'code' &&
      !isLocalInputting.value &&
      newPath &&
      newPath !== activePath.value
    ) {
      void locateAndFocusPath(newPath, true)
    }
  },
)

// 当用户通过撤销/重做或外部修改引起 doc.current 变动时，实时同步代码文本
watch(
  () => doc.current,
  (newVal) => {
    if (doc.viewMode === 'code' && !isLocalInputting.value && newVal !== null) {
      try {
        const text = JSON.stringify(newVal, null, 2)
        if (text !== codeText.value) {
          codeText.value = text
          validateSyntax()
          if (doc.selectedPath) {
            void locateAndFocusPath(doc.selectedPath, false)
          }
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

// 光标位置移动触发：反向解析光标所在的 JSONPath 并同步给全局 store
function onCursorMoved() {
  if (!textareaRef.value || !codeText.value) return
  const offset = textareaRef.value.selectionStart
  const line = getLineNumber(codeText.value, offset)
  activeLine.value = line
  const path = findPathAtOffset(codeText.value, offset)
  if (path) {
    activePath.value = path
    if (path !== doc.selectedPath) {
      doc.selectedPath = path
    }
  }
}

// 保证行号栏与输入框纵向滚动绝对同步
function onTextareaScroll() {
  if (lineGutterRef.value && textareaRef.value) {
    lineGutterRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

function onCodeInput() {
  isLocalInputting.value = true
  validateSyntax()
  onCursorMoved()

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

function onCodeBlur() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
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
  }
}

function formatCode(indent: number) {
  try {
    const obj = JSON.parse(codeText.value)
    codeText.value = JSON.stringify(obj, null, indent)
    if (validateSyntax()) {
      doc.recordSnapshot('格式化源码')
      doc.current = obj
      if (doc.selectedPath) {
        void locateAndFocusPath(doc.selectedPath, false)
      }
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
        <span class="sub-title">{ } 源码模式</span>
        <span v-if="!parseError" class="sub-badge ok">● 语法正确</span>
        <span v-else class="sub-badge error">● 语法错误</span>
        <span v-if="changeCount > 0" class="unified-change-badge" title="当前存在未保存改动">
          ● {{ changeCount }} 处改动
        </span>
        <span
          v-if="activePath"
          class="sub-path-pill"
          :title="`当前聚焦字段: ${activePath} (第 ${activeLine} 行)`"
        >
          📍 {{ activePath }}
          <template v-if="activeLine">(行 {{ activeLine }})</template>
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

    <!-- 文本编辑区 (带同步滚动与行号栏) -->
    <div class="editor-main">
      <div ref="lineGutterRef" class="line-gutter">
        <div
          v-for="n in lines"
          :key="n"
          :class="[
            'line-num',
            {
              active: activeLine === n,
              flash: flashActive && activeLine === n,
            },
          ]"
        >
          {{ n }}
        </div>
      </div>
      <textarea
        ref="textareaRef"
        v-model="codeText"
        class="code-textarea"
        spellcheck="false"
        placeholder="在此输入或粘贴 JSON 源码..."
        @input="onCodeInput"
        @scroll="onTextareaScroll"
        @click="onCursorMoved"
        @keyup="onCursorMoved"
        @select="onCursorMoved"
        @blur="onCodeBlur"
      />
    </div>

    <!-- 底部错误提示栏 -->
    <div v-if="parseError" class="error-bar">
      <span class="err-icon">[!]</span>
      <span class="err-text">{{ parseError }}</span>
    </div>
  </div>
</template>

<style scoped>
.raw-code-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-workspace);
  color: var(--text-main);
  min-height: 0;
}

/* 统一二级子工具条 (38px) */
.sub-toolbar {
  height: 38px;
  background: var(--bg-subbar);
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-muted);
}
.sub-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
}
.sub-badge.ok {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.sub-badge.error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* 全模式统一改动徽章 */
.unified-change-badge {
  background: var(--desc-bg);
  color: var(--desc-text);
  border: 1px solid var(--desc-border);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
}

/* 路径定位胶囊指示器 */
.sub-path-pill {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  font-family: 'Consolas', 'Fira Code', monospace;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-filter-hint {
  font-size: 11px;
  color: var(--text-highlight);
  font-style: italic;
}

.sub-right {
  display: flex;
  gap: 6px;
}
.sub-tool-btn {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.1s;
}
.sub-tool-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-main);
  border-color: var(--border-focus);
}

.editor-main {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-workspace);
}

/* 行号栏 */
.line-gutter {
  width: 52px;
  background: var(--bg-subbar);
  border-right: 1px solid var(--border-color);
  padding: 14px 0;
  user-select: none;
  overflow: hidden;
  flex-shrink: 0;
  text-align: right;
  box-sizing: border-box;
}
.line-num {
  padding-right: 10px;
  font-family: 'Consolas', 'Fira Code', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-dim);
  transition: all 0.15s ease;
}
.line-num.active {
  color: #38bdf8;
  font-weight: 700;
  background: rgba(56, 189, 248, 0.12);
}
.line-num.flash {
  background: rgba(245, 158, 11, 0.35);
  color: #f59e0b;
}

.code-textarea {
  flex: 1;
  width: 100%;
  border: none;
  background: var(--bg-workspace);
  color: var(--text-code);
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
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border-top: 1px solid rgba(239, 68, 68, 0.25);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: monospace;
}
</style>
