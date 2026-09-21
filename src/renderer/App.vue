<script setup lang="ts">
import { ref } from 'vue'

const phase = ref<string>('Phase 1 — 基础设施')
const message = ref<string>('骨架已就绪。后续 Phase 会依次接入 IPC、Vue 编辑器、schema 分析器。')
const mainProgram = ref<{ running: boolean; pids: number[] } | null>(null)

async function detectMainProgram() {
  mainProgram.value = await window.api.process.detectMainProgram()
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>{{ phase }}</h1>
    </header>
    <main class="content">
      <p>{{ message }}</p>
      <button class="btn" @click="detectMainProgram">检测主程序进程</button>
      <pre v-if="mainProgram" class="result">{{ JSON.stringify(mainProgram, null, 2) }}</pre>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
.topbar {
  padding: 16px 24px;
  background: #2c3e50;
  color: white;
}
.topbar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}
.btn {
  margin-top: 16px;
  padding: 8px 16px;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn:hover {
  background: #369870;
}
.result {
  margin-top: 12px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
}
</style>
