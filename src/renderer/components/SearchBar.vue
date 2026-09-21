<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '../stores/ui'
import { useConfigStore } from '../stores/config'

const uiStore = useUiStore()
const configStore = useConfigStore()

const inputRef = ref<HTMLInputElement | null>(null)

function focusOnCtrlF(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'f') {
    e.preventDefault()
    inputRef.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', focusOnCtrlF)
})
onUnmounted(() => {
  document.removeEventListener('keydown', focusOnCtrlF)
})

const changeCount = computed(() => configStore.changes.size)

function onShowModified() {
  uiStore.showOnlyModified = !uiStore.showOnlyModified
}
</script>

<template>
  <div class="search-bar">
    <input
      ref="inputRef"
      v-model="uiStore.searchQuery"
      placeholder="搜索字段 (Ctrl+F)..."
      type="text"
    />
    <button
      :class="{ active: uiStore.showOnlyModified }"
      title="仅显示已修改"
      @click="onShowModified"
    >
      ● {{ changeCount }} 处修改
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  padding: 8px;
  gap: 8px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
}
.search-bar input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
}
.search-bar button {
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.search-bar button.active {
  background: #faad14;
  color: white;
  border-color: #faad14;
}
</style>
