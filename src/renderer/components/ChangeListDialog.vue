<script setup lang="ts">
import { computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useUiStore } from '../stores/ui'

const configStore = useConfigStore()
const uiStore = useUiStore()

const changes = computed(() => configStore.changes.toArray())

const stats = computed(() => {
  const list = changes.value
  return {
    total: list.length,
    modify: list.filter((c) => c.type === 'modify').length,
    add: list.filter((c) => c.type === 'add').length,
    delete: list.filter((c) => c.type === 'delete').length,
  }
})

async function confirmSave() {
  uiStore.showChangeListDialog = false
  await configStore.save()
}

function discard() {
  configStore.discardChanges()
  uiStore.showChangeListDialog = false
}

function cancel() {
  uiStore.showChangeListDialog = false
}
</script>

<template>
  <div v-if="uiStore.showChangeListDialog" class="backdrop" @click.self="cancel">
    <div class="dialog">
      <header>
        <h2>保存前确认</h2>
        <p class="subtitle">
          共
          <strong>{{ stats.total }}</strong>
          处变更:
          <span class="badge modify">{{ stats.modify }} 修改</span>
          <span class="badge add">{{ stats.add }} 新增</span>
          <span class="badge delete">{{ stats.delete }} 删除</span>
        </p>
      </header>
      <main>
        <div v-if="stats.total === 0" class="empty">没有变更。</div>
        <table v-else>
          <thead>
            <tr>
              <th>类型</th>
              <th>字段路径</th>
              <th>旧值</th>
              <th>新值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in changes" :key="c.path">
              <td>
                <span :class="['type-badge', c.type]">{{ c.type }}</span>
              </td>
              <td class="path-cell">{{ c.path }}</td>
              <td class="value-cell">
                <code v-if="c.oldValue !== undefined">{{ JSON.stringify(c.oldValue) }}</code>
                <span v-else class="none">—</span>
              </td>
              <td class="value-cell">
                <code v-if="c.newValue !== undefined">{{ JSON.stringify(c.newValue) }}</code>
                <span v-else class="none">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </main>
      <footer v-if="configStore.mainProgramRunning" class="warning">
        ⚠ 检测到主程序正在运行,保存的修改需要重启主程序才生效。
      </footer>
      <footer class="actions">
        <button @click="cancel">取消</button>
        <button class="danger" :disabled="stats.total === 0" @click="discard">撤销所有修改</button>
        <button class="primary" :disabled="stats.total === 0" @click="confirmSave">
          💾 确认保存
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
}
.dialog {
  background: white;
  border-radius: 8px;
  width: 880px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
header {
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}
header h2 {
  margin: 0 0 8px;
}
.subtitle {
  margin: 0;
  font-size: 13px;
  color: #666;
}
.badge {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.badge.modify {
  background: #fff7e6;
  color: #d46b08;
}
.badge.add {
  background: #f6ffed;
  color: #389e0d;
}
.badge.delete {
  background: #fff1f0;
  color: #cf1322;
}
main {
  flex: 1;
  overflow: auto;
  padding: 0 24px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: #999;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
}
th {
  background: #fafafa;
  font-weight: 500;
}
.type-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
}
.type-badge.modify {
  background: #fff7e6;
  color: #d46b08;
}
.type-badge.add {
  background: #f6ffed;
  color: #389e0d;
}
.type-badge.delete {
  background: #fff1f0;
  color: #cf1322;
}
.path-cell {
  font-family: 'Consolas', monospace;
  color: #003eb3;
  word-break: break-all;
  max-width: 280px;
}
.value-cell {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.value-cell code {
  word-break: break-all;
}
.none {
  color: #ccc;
}
.warning {
  background: #fffbe6;
  color: #d48806;
  padding: 8px 24px;
  border-top: 1px solid #faad14;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid #f0f0f0;
}
.actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.actions .primary {
  background: #1890ff;
  color: white;
}
.actions .danger {
  background: #ff4d4f;
  color: white;
}
.actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
