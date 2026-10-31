<script setup lang="ts">
import { ref } from 'vue'
import type { PageMeta } from '@/core/page/types'
import {
  clearPageStrokes,
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

interface PendingAction {
  kind: 'clear' | 'delete'
  page: PageMeta
}

/** 清除与删除都是破坏性操作，统一走底部二次确认条 */
const pending = ref<PendingAction | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

function close(): void {
  uiState.pageListOpen = false
  pending.value = null
}

async function pick(page: PageMeta): Promise<void> {
  if (pending.value) return
  await selectPage(page.id)
  close()
}

function askClear(page: PageMeta): void {
  // 确认条已经打开时不再响应新的操作，避免误点把「清除」换成「删除」
  if (pending.value) return
  pending.value = { kind: 'clear', page }
}

function askDelete(page: PageMeta): void {
  if (pending.value) return
  pending.value = { kind: 'delete', page }
}

async function confirmPending(): Promise<void> {
  const action = pending.value
  pending.value = null
  if (!action) return
  if (action.kind === 'clear') {
    await clearPageStrokes(action.page.id)
    return
  }
  await deletePage(action.page.id)
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
            <div class="page-card__actions">
              <button
                type="button"
                class="page-card__action"
                :disabled="page.strokeCount === 0"
                :title="page.strokeCount === 0 ? '该页还没有笔迹' : `清除 ${page.title} 的全部笔迹`"
                @click="askClear(page)"
              >
                清除
              </button>
              <button
                type="button"
                class="page-card__action page-card__action--danger"
                :aria-label="`删除 ${page.title}`"
                @click="askDelete(page)"
              >
                删除
              </button>
            </div>
          </article>
        </div>

        <p v-if="notebook.pages.length === 0" class="empty">还没有页面</p>
      </div>

      <footer v-if="pending" class="confirm">
        <span class="confirm__text">
          <template v-if="pending.kind === 'clear'">
            清除「{{ pending.page.title }}」的全部笔迹？格子和页面会保留，清除后无法撤销。
          </template>
          <template v-else>删除「{{ pending.page.title }}」？删除后无法恢复。</template>
        </span>
        <button type="button" class="text-btn" @click="pending = null">取消</button>
        <button type="button" class="text-btn text-btn--danger" @click="confirmPending">
          {{ pending.kind === 'clear' ? '清除' : '删除' }}
        </button>
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

.page-card__actions {
  display: flex;
  border-top: 1px solid var(--border);
}

.page-card__action {
  flex: 1;
  min-height: 40px;
  font-size: 13px;
  color: var(--text-muted);
}

.page-card__action + .page-card__action {
  border-left: 1px solid var(--border);
}

.page-card__action:not(:disabled):active {
  background: var(--paper-shadow);
}

.page-card__action:disabled {
  opacity: 0.45;
}

.page-card__action--danger {
  color: #b4443f;
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
