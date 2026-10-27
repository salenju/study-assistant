<script setup lang="ts">
import TopBar from '@/components/TopBar.vue'
import EditorView from '@/components/EditorView.vue'
import ToolBar from '@/components/ToolBar.vue'
import PageListSheet from '@/components/PageListSheet.vue'
import NewPageSheet from '@/components/NewPageSheet.vue'
import CopybookPicker from '@/components/CopybookPicker.vue'
import SettingsSheet from '@/components/SettingsSheet.vue'
import PwaBanner from '@/components/PwaBanner.vue'
import { notebook } from '@/store/notebook'
import { uiState } from '@/store/editorState'
</script>

<template>
  <div class="app">
    <TopBar />
    <EditorView />
    <ToolBar />

    <p v-if="notebook.notice" class="notice" role="alert">{{ notebook.notice }}</p>
    <p v-if="notebook.message" class="toast" role="status">{{ notebook.message }}</p>

    <PageListSheet v-if="uiState.pageListOpen" />
    <NewPageSheet v-if="uiState.newPageOpen" />
    <CopybookPicker v-if="uiState.pickerKind" :kind="uiState.pickerKind" />
    <SettingsSheet v-if="uiState.settingsOpen" />
    <PwaBanner />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  background: var(--paper);
}

.notice {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bar-bottom) + 12px);
  transform: translateX(-50%);
  max-width: min(560px, calc(100% - 32px));
  padding: 10px 16px;
  border-radius: 10px;
  background: #fdf1ef;
  border: 1px solid #e9c6c2;
  color: #a4524d;
  font-size: 13px;
  text-align: center;
}

.toast {
  position: fixed;
  top: calc(var(--bar-top) + 12px);
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 999px;
  background: rgb(59 47 42 / 88%);
  color: #fffdf7;
  font-size: 13px;
  pointer-events: none;
}
</style>
