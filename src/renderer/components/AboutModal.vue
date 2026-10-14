<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useJsonDocStore } from '../stores/jsonDoc'

const doc = useJsonDocStore()
const copied = ref(false)

const DEVELOPER_EMAIL = 'zeroko12@foxmail.com'
const GITHUB_REPO_URL = 'https://github.com/zeroko12/JsonMeta'

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
  } catch (err) {
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
    <div class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <!-- 模态框顶部导航条 -->
      <header class="about-header">
        <div class="header-left">
          <span class="header-dot"></span>
          <h3 id="about-dialog-title">关于应用</h3>
        </div>
        <button class="about-close-btn" title="关闭 (Esc)" @click="closeModal">✕</button>
      </header>

      <!-- 模态框主体内容 -->
      <div class="about-body">
        <!-- 应用 Logo 与名称 -->
        <div class="brand-hero">
          <div class="logo-wrapper">
            <svg class="brand-svg" viewBox="0 0 48 48" fill="none">
              <rect
                x="4"
                y="4"
                width="40"
                height="40"
                rx="10"
                fill="url(#brand-grad)"
                stroke="#38bdf8"
                stroke-width="1.5"
              />
              <path
                d="M17 16C15 16 13 18 13 21V23C13 24.5 11.5 25 10 25C11.5 25 13 25.5 13 27V29C13 32 15 34 17 34"
                stroke="#ffffff"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M31 16C33 16 35 18 35 21V23C35 24.5 36.5 25 38 25C36.5 25 35 25.5 35 27V29C35 32 33 34 31 34"
                stroke="#ffffff"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="20" cy="25" r="2" fill="#38bdf8" />
              <circle cx="28" cy="25" r="2" fill="#38bdf8" />
              <defs>
                <linearGradient id="brand-grad" x1="4" y1="4" x2="44" y2="44">
                  <stop stop-color="#0f172a" />
                  <stop offset="1" stop-color="#1e3a8a" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div class="brand-info">
            <div class="name-version-row">
              <span class="app-name">JsonMeta</span>
              <span class="version-tag">v0.1.0</span>
              <span class="status-badge">Release</span>
            </div>
            <p class="app-tagline">通用结构化配置检视与双轨元数据伴生注释工具</p>
          </div>
        </div>

        <!-- 核心特性卡片网格 -->
        <div class="features-grid">
          <div class="feature-item">
            <span class="feature-icon">🛡</span>
            <div class="feature-text">
              <span class="feature-title">双轨伴生存储</span>
              <span class="feature-desc">原始配置零侵入，中文字段描述隔离存储于 .meta.json</span>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">⚡</span>
            <div class="feature-text">
              <span class="feature-title">极速渲染性能</span>
              <span class="feature-desc">支持海量测点与节点渲染，提供层级树形与源码双重视图</span>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">⚖</span>
            <div class="feature-text">
              <span class="feature-title">改动防呆审计</span>
              <span class="feature-desc">字段值改动与节点拖拽顺序实时对比，安全审查一目了然</span>
            </div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🌓</span>
            <div class="feature-text">
              <span class="feature-title">工业深浅主题</span>
              <span class="feature-desc">深色高对比度与浅色明亮风格即时切换，适应多种现场环境</span>
            </div>
          </div>
        </div>

        <!-- 联系开发者与开源支持 -->
        <div class="contact-section">
          <div class="section-title">
            <span>开发者与技术支持</span>
          </div>

          <div class="contact-card">
            <!-- 开发者信息行 -->
            <div class="contact-row">
              <div class="contact-label">
                <span class="label-icon">👨‍💻</span>
                <span>开发者</span>
              </div>
              <div class="contact-value">
                <span class="dev-name">zeroko12</span>
              </div>
            </div>

            <!-- 联系邮箱行 -->
            <div class="contact-row">
              <div class="contact-label">
                <span class="label-icon">✉️</span>
                <span>联系邮箱</span>
              </div>
              <div class="contact-value email-value-group">
                <a
                  class="email-link"
                  :href="`mailto:${DEVELOPER_EMAIL}`"
                  title="点击调用邮件客户端发送邮件"
                >
                  {{ DEVELOPER_EMAIL }}
                </a>
                <button
                  class="copy-btn"
                  :class="{ active: copied }"
                  :title="copied ? '已复制' : '复制邮箱地址'"
                  @click="copyEmail"
                >
                  <svg
                    v-if="!copied"
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span v-if="!copied">复制</span>
                  <span v-else>✓ 已复制</span>
                </button>
              </div>
            </div>

            <!-- 开源主页行 -->
            <div class="contact-row">
              <div class="contact-label">
                <span class="label-icon">🌐</span>
                <span>开源主页</span>
              </div>
              <div class="contact-value">
                <a
                  class="repo-link"
                  :href="GITHUB_REPO_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="前往 GitHub 查看项目源码与文档"
                >
                  github.com/zeroko12/JsonMeta
                  <span class="external-arrow">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 模态框底部 -->
      <footer class="about-footer">
        <div class="copyright-text">
          <span>Copyright © 2025-2026 JsonMeta Team. Licensed under MIT.</span>
        </div>
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
  border-radius: 10px;
  width: 540px;
  max-width: 92vw;
  box-shadow: 0 20px 35px -8px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-main);
  animation: scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
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
  padding: 12px 18px;
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

.header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
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
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 品牌区 */
.brand-hero {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-svg {
  width: 52px;
  height: 52px;
  filter: drop-shadow(0 2px 8px rgba(56, 189, 248, 0.25));
}

.brand-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-version-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--text-main);
}

.version-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--bg-badge);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.status-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.app-tagline {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* 核心特性网格 */
.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.feature-item {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.feature-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-main);
}

.feature-desc {
  font-size: 10.5px;
  color: var(--text-dim);
  line-height: 1.35;
}

/* 联系与技术支持卡片 */
.contact-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.contact-card {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.contact-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.label-icon {
  font-size: 13px;
}

.contact-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev-name {
  font-weight: 600;
  color: var(--text-main);
  background: var(--bg-badge);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.email-value-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.email-link {
  color: #38bdf8;
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 500;
  font-size: 12px;
  transition: all 0.15s;
}

.email-link:hover {
  text-decoration: underline;
  color: #0284c7;
}

.copy-btn {
  background: var(--bg-btn-hover);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-btn:hover {
  background: var(--border-muted);
  border-color: var(--border-muted);
}

.copy-btn.active {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.35);
  color: #22c55e;
}

.repo-link {
  color: #38bdf8;
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.repo-link:hover {
  text-decoration: underline;
  color: #0284c7;
}

.external-arrow {
  font-size: 11px;
}

/* 底部操作与版权 */
.about-footer {
  padding: 10px 18px;
  background: var(--bg-drawer-header);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copyright-text {
  font-size: 10.5px;
  color: var(--text-dim);
}

.close-confirm-btn {
  background: var(--bg-btn);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 4px 14px;
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
