<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LoginView from './views/LoginView.vue'
import FilePickerView from './views/FilePickerView.vue'
import EditorView from './views/EditorView.vue'

const authed = ref(false)
const fileLoaded = ref(false)

function onAuthSuccess() {
  authed.value = true
}

function onFileLoaded() {
  fileLoaded.value = true
}

function onOpenAnother() {
  fileLoaded.value = false
}

onMounted(() => {
  window.addEventListener('auth:success', onAuthSuccess)
  window.addEventListener('app:open-another', onOpenAnother)
})
</script>

<template>
  <LoginView v-if="!authed" />
  <FilePickerView v-else-if="!fileLoaded" @loaded="onFileLoaded" />
  <EditorView v-else />
</template>
