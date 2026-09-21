<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const password = ref('')
const error = ref<string | null>(null)
const isChecking = ref(false)

async function submit() {
  if (!password.value) return
  isChecking.value = true
  error.value = null
  try {
    const ok = await window.api.auth.check(password.value)
    if (ok) {
      // Login OK — move to editor
      window.dispatchEvent(new CustomEvent('auth:success'))
    } else {
      error.value = '密码错误'
    }
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    isChecking.value = false
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <h2>系统配置编辑工具</h2>
      <p class="hint">请输入密码</p>
      <input
        v-model="password"
        type="password"
        placeholder="密码"
        :disabled="isChecking"
        autofocus
        @keydown.enter="submit"
      />
      <button :disabled="isChecking || !password" @click="submit">
        {{ isChecking ? '验证中...' : '登录' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f0f2f5;
}
.login-card {
  width: 360px;
  padding: 32px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.login-card h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.login-card .hint {
  margin: 0 0 24px;
  color: #666;
}
.login-card input {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}
.login-card button {
  width: 100%;
  padding: 10px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}
.login-card button:disabled {
  background: #bae7ff;
  cursor: not-allowed;
}
.error {
  color: #ff4d4f;
  margin-top: 12px;
  font-size: 13px;
}
</style>
