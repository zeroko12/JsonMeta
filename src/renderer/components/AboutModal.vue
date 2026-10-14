<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const copied = ref(false)

const DEVELOPER_EMAIL = 'zeroko12@foxmail.com'

function closeModal() {
  doc.showAboutModal = false
}

async function copyEmail() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(DEVELOPER_EMAIL)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = DEVELOPER_EMAIL
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    copied.value = true
    doc.showToast(`邮箱已复制: ${DEVELOPER_EMAIL}`, 'success')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    doc.showToast('复制失败，请手动复制', 'error')
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && doc.showAboutModal) {
    closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div v-if="doc.showAboutModal" class="about-backdrop" @click.self="closeModal">
    <div class="about-card" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title">
      <!-- 模态框顶部 -->
      <header class="about-header">
        <div class="header-left">
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="header-icon"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <h3 id="contact-dialog-title">联系开发者</h3>
        </div>
        <button class="about-close-btn" title="关闭 (Esc)" @click="closeModal">✕</button>
      </header>

      <!-- 模态框主体内容 -->
      <div class="about-body">
        <div class="contact-box">
          <div class="email-display">
            <span class="email-label">开发者邮箱</span>
            <a
              class="email-address"
              :href="`mailto:${DEVELOPER_EMAIL}`"
              title="点击调用邮件客户端发送邮件"
            >
              {{ DEVELOPER_EMAIL }}
            </a>
          </div>

          <div class="action-buttons">
            <button
              class="btn-copy"
              :class="{ active: copied }"
              :title="copied ? '已复制' : '复制邮箱地址'"
              @click="copyEmail"
            >
              <svg
                v-if="!copied"
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span v-if="!copied">复制邮箱</span>
              <span v-else>✓ 已复制到剪贴板</span>
            </button>

            <a
              class="btn-send"
              :href="`mailto:${DEVELOPER_EMAIL}`"
              title="调用系统邮件客户端发送邮件"
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>发送邮件</span>
            </a>
          </div>
        </div>
      </div>

      <!-- 模态框底部 -->
      <footer class="about-footer">
        <button class="close-confirm-btn" @click="closeModal">关闭</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.about-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-modal-backdrop);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1300;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.about-card {
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 18px 30px -8px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-main);
  animation: scaleUp 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleUp {
  from {
    transform: scale(0.96);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* 顶部导航条 */
.about-header {
  padding: 10px 16px;
  background: var(--bg-drawer-header);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #38bdf8;
}

.about-header h3 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-main);
}

.about-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}

.about-close-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-main);
}

/* 主体内容 */
.about-body {
  padding: 20px 20px;
  display: flex;
  flex-direction: column;
}

.contact-box {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.email-display {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.email-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.email-address {
  color: #38bdf8;
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
  word-break: break-all;
  transition: color 0.15s;
}

.email-address:hover {
  text-decoration: underline;
  color: #0284c7;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-copy,
.btn-send {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s;
  box-sizing: border-box;
}

.btn-copy {
  background: var(--bg-btn-hover);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}

.btn-copy:hover {
  background: var(--border-muted);
  border-color: var(--border-muted);
}

.btn-copy.active {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.35);
  color: #22c55e;
}

.btn-send {
  background: #2563eb;
  border: 1px solid #1d4ed8;
  color: #ffffff;
}

.btn-send:hover {
  background: #1d4ed8;
}

/* 底部操作 */
.about-footer {
  padding: 8px 16px;
  background: var(--bg-drawer-header);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.close-confirm-btn {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 4px 16px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.close-confirm-btn:hover {
  background: var(--bg-btn-hover);
  border-color: var(--border-muted);
}
</style>
