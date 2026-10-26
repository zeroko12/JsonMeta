<script setup lang="ts">
import { onMounted } from 'vue'
import { useJsonDocStore } from './stores/jsonDoc'
import ModernTopBar from './components/ModernTopBar.vue'
import EmptyDropZone from './components/EmptyDropZone.vue'
import VisualTreeEditor from './components/VisualTreeEditor.vue'
import NodeDetailDrawer from './components/NodeDetailDrawer.vue'
import RawCodeEditor from './components/RawCodeEditor.vue'
import DiffModal from './components/DiffModal.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import RawJsonEditModal from './components/RawJsonEditModal.vue'
import ModernBackupDialog from './components/ModernBackupDialog.vue'
import AboutModal from './components/AboutModal.vue'
import IndustrialStatusBar from './components/IndustrialStatusBar.vue'

const doc = useJsonDocStore()

onMounted(() => {
  doc.initExternalListener()
  doc.applyTheme(doc.theme)
  ;(window as unknown as { __jsonDocStore: unknown }).__jsonDocStore = doc
})
</script>

<template>
  <div class="app-root">
    <!-- 现代化顶栏 -->
    <ModernTopBar />

    <!-- 主工作区 -->
    <main class="app-workspace">
      <!-- 空状态: 拖拽或选择打开 -->
      <EmptyDropZone v-if="!doc.hasFile" />

      <!-- 已打开文件 -->
      <template v-else>
        <!-- 模式 1: 可视化树形编辑 -->
        <div v-show="doc.viewMode === 'visual'" class="editor-layout">
          <VisualTreeEditor />
          <Transition name="drawer-slide">
            <NodeDetailDrawer v-if="doc.showDetailDrawer && doc.selectedPath" />
          </Transition>
        </div>

        <!-- 模式 2: Raw JSON 源码模式 -->
        <RawCodeEditor v-if="doc.viewMode === 'code'" />

        <!-- 模式 3: 改动比对模式 -->
        <DiffModal v-if="doc.viewMode === 'diff'" />
      </template>
    </main>

    <!-- 工业级现场运行状态栏 (包含完整路径面包屑、文件与节点统计、改动指示器) -->
    <IndustrialStatusBar />

    <!-- 全局弹窗与模态框 -->
    <AddNodeModal />
    <RawJsonEditModal />
    <ModernBackupDialog />
    <AboutModal />

    <!-- 全局 Toast 提示 -->
    <Transition name="toast-fade">
      <div v-if="doc.saveToast.show" class="global-save-toast" :class="doc.saveToast.type">
        {{ doc.saveToast.msg }}
      </div>
    </Transition>

    <!-- 磁盘文件外部被修改提示弹窗 -->
    <div v-if="doc.externalChangePending" class="external-alert-backdrop">
      <div class="external-alert-card">
        <h3>⚠️ 磁盘文件已被外部修改</h3>
        <p>
          检测到磁盘上的文件被其他程序修改。请选择是重新从磁盘加载（放弃本地未保存内容），还是保留当前编辑（下次保存时将覆盖磁盘）。
        </p>
        <div class="alert-actions">
          <button class="alert-btn" @click="doc.externalChangePending = false">保持本地编辑</button>
          <button class="alert-btn primary" @click="() => doc.reloadFromDisk()">
            从磁盘重新载入
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-app);
  color: var(--text-main);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.app-workspace {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: var(--bg-workspace);
  transition: background-color 0.15s ease;
}

.editor-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition:
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.2s ease;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
  opacity: 0.4;
}

.external-alert-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-modal-backdrop);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
}
.external-alert-card {
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 440px;
  padding: 20px 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
  color: var(--text-main);
}
.external-alert-card h3 {
  margin: 0 0 10px;
  color: #ef4444;
  font-size: 16px;
}
.external-alert-card p {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
.alert-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.alert-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-btn);
  color: var(--text-main);
  transition: all 0.1s;
}
.alert-btn:hover {
  background: var(--bg-btn-hover);
}
.alert-btn.primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: white;
}
.alert-btn.primary:hover {
  background: #1d4ed8;
}

/* 全局 Toast */
.global-save-toast {
  position: fixed;
  top: 56px;
  right: 24px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  z-index: 9999;
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.global-save-toast.success {
  background: rgba(16, 185, 129, 0.92);
  color: #ffffff;
  border: 1px solid rgba(110, 231, 183, 0.35);
}
.global-save-toast.error {
  background: rgba(239, 68, 68, 0.92);
  color: #ffffff;
  border: 1px solid rgba(252, 165, 165, 0.35);
}
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
</style>
