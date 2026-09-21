<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LoginView from './views/LoginView.vue'
import FilePickerView from './views/FilePickerView.vue'
import EditorView from './views/EditorView.vue'
import SchemaEditorView from './views/SchemaEditorView.vue'

const authed = ref(false)
const fileLoaded = ref(false)
const showSchemaEditor = ref(false)

function onAuthSuccess() {
  authed.value = true
}

function onFileLoaded() {
  fileLoaded.value = true
}

function onOpenAnother() {
  fileLoaded.value = false
}

function onToggleSchemaEditor() {
  showSchemaEditor.value = !showSchemaEditor.value
}

onMounted(() => {
  window.addEventListener('auth:success', onAuthSuccess)
  window.addEventListener('app:open-another', onOpenAnother)
  window.addEventListener('app:toggle-schema-editor', onToggleSchemaEditor)
})
</script>

<template>
  <LoginView v-if="!authed" />
  <FilePickerView v-else-if="!fileLoaded" @loaded="onFileLoaded" />
  <SchemaEditorView v-else-if="showSchemaEditor" @close="showSchemaEditor = false" />
  <EditorView v-else />
</template>
