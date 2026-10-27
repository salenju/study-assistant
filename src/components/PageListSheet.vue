<script setup lang="ts">
import { ref } from 'vue'
import type { PageMeta } from '@/core/page/types'
import {
  deletePage,
  exportBackupFile,
  exportCurrentPagePng,
  importBackupText,
  notebook,
  selectPage,
  showToast,
} from '@/store/notebook'
import { uiState } from '@/store/editorState'
import { formatShortTime } from '@/utils/format'
import { BackupError } from '@/utils/backup'

const pendingDelete = ref<PageMeta | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

function close(): void {
  uiState.pageListOpen = false
  pendingDelete.value = null
}

async function pick(page: PageMeta): Promise<void> {
  if (pendingDelete.value) return
  await selectPage(page.id)
  close()
}

function askDelete(page: PageMeta): void {
  pendingDelete.value = page
}

async function confirmDelete(): Promise<void> {
  const target = pendingDelete.value
  pendingDelete.value = null
  if (!target) return
  await deletePage(target.id)
}

function triggerImport(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  importing.value = true
  try {
    const text = await file.text()
    await importBackupText(text)
  } catch (error) {
    const message = error instanceof BackupError ? error.message : '导入失败，文件可能有损坏'
    showToast(message)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="close">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="我的本子">
      <header class="sheet__head">
        <h2 class="sheet__title">我的本子</h2>
        <div class="sheet__actions">
          <button
            type="button"
            class="text-btn"
            :disabled="notebook.busy || !notebook.currentId"
            @click="exportCurrentPagePng()"
          >
            导出本页图片
          </button>
          <button type="button" class="text-btn" :disabled="notebook.busy" @click="exportBackupFile()">
            导出备份
          </button>
          <button type="button" class="text-btn" :disabled="importing" @click="triggerImport">
            {{ importing ? '导入中…' : '导入备份' }}
          </button>
          <button type="button" class="text-btn text-btn--close" @click="close">关闭</button>
        </div>
      </header>

      <div class="sheet__body">
        <div class="page-grid">
          <article
            v-for="page in notebook.pages"
            :key="page.id"
            class="page-card"
            :class="{ 'is-current': page.id === notebook.currentId }"
          >
            <button type="button" class="page-card__main" @click="pick(page)">
              <img v-if="page.thumbnail" class="page-card__thumb" :src="page.thumbnail" alt="" />
              <div v-else class="page-card__thumb page-card__thumb--empty">空白</div>
              <span class="page-card__title">{{ page.title }}</span>
              <span class="page-card__meta">{{ page.strokeCount }} 笔 · {{ formatShortTime(page.updatedAt) }}</span>
            </button>
            <button
              type="button"
              class="page-card__del"
              :aria-label="`删除 ${page.title}`"
              @click="askDelete(page)"
            >
              ×
            </button>
          </article>
        </div>

        <p v-if="notebook.pages.length === 0" class="empty">还没有页面</p>
      </div>

      <footer v-if="pendingDelete" class="confirm">
        <span class="confirm__text">删除「{{ pendingDelete.title }}」？删除后无法恢复。</span>
        <button type="button" class="text-btn" @click="pendingDelete = null">取消</button>
        <button type="button" class="text-btn text-btn--danger" @click="confirmDelete">删除</button>
      </footer>

      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden-input"
        @change="onFileChange"
      />
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(59 47 42 / 32%);
}

.sheet {
  width: min(760px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 24px 64px rgb(59 47 42 / 24%);
  overflow: hidden;
}

.sheet__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.sheet__title {
  font-size: 17px;
}

.sheet__actions {
  display: flex;
  gap: 4px;
}

.text-btn {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--accent);
}

.text-btn:disabled {
  color: var(--text-muted);
  opacity: 0.55;
}

.text-btn--close {
  color: var(--text-muted);
}

.text-btn--danger {
  color: #b4443f;
  font-weight: 600;
}

.sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
  overscroll-behavior: contain;
}

.page-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
}

.page-card {
  position: relative;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--paper);
  overflow: hidden;
}

.page-card.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgb(201 124 124 / 22%);
}

.page-card__main {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 0 0 10px;
}

.page-card__thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1.7;
  /* 用 contain 而不是 cover：缩略图要能看出整页布局，裁掉一半反而看不懂写了什么 */
  object-fit: contain;
  background: var(--paper);
  border-bottom: 1px solid var(--border);
}

.page-card__thumb--empty {
  display: grid;
  place-items: center;
  font-size: 13px;
  color: var(--text-muted);
}

.page-card__title {
  padding: 0 10px;
  font-size: 14px;
  text-align: left;
  color: var(--text);
}

.page-card__meta {
  padding: 0 10px;
  font-size: 12px;
  text-align: left;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.page-card__del {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  font-size: 20px;
  line-height: 1;
  color: var(--text-muted);
  background: rgb(255 253 247 / 88%);
}

.empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.confirm {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: #fdf1ef;
}

.confirm__text {
  flex: 1;
  font-size: 14px;
  color: var(--text);
}

.hidden-input {
  display: none;
}
</style>
