<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  canGoNext,
  canGoPrev,
  clearPageStrokes,
  currentIndex,
  currentPage,
  deletePage,
  goNext,
  goPrev,
  notebook,
} from '@/store/notebook'
import { editorState, runExitPenMode, runRedo, runUndo, setTool, uiState } from '@/store/editorState'

const pagerLabel = computed(() => {
  if (!notebook.ready) return '—'
  return `第 ${currentIndex.value + 1} / ${notebook.pages.length} 页`
})

type PageAction = 'clear' | 'delete'

/** 清除笔迹、删除整页都不可撤销，点击后必须再确认一次 */
const pendingAction = ref<PageAction | null>(null)

// 用编辑器的实时笔数判断：元数据里的 strokeCount 可能因未落盘而滞后
const canClear = computed(() => editorState.strokeCount > 0)
const canDelete = computed(() => notebook.ready && Boolean(currentPage.value))
/** 只剩一页时删除会自动补一页空白，确认文案要说清楚 */
const isLastPage = computed(() => notebook.pages.length <= 1)

async function confirmAction(): Promise<void> {
  const action = pendingAction.value
  const page = currentPage.value
  pendingAction.value = null
  if (!action || !page) return
  if (action === 'clear') {
    await clearPageStrokes(page.id)
    return
  }
  await deletePage(page.id)
}

function openPageList(): void {
  uiState.pageListOpen = true
}

function openNewPage(): void {
  uiState.newPageOpen = true
}
</script>

<template>
  <footer class="toolbar">
    <div class="toolbar__group">
      <button
        class="tool"
        type="button"
        :disabled="!editorState.canUndo"
        title="撤销"
        aria-label="撤销"
        @click="runUndo()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h9a6 6 0 0 1 0 12h-3" />
        </svg>
      </button>

      <button
        class="tool"
        type="button"
        :disabled="!editorState.canRedo"
        title="重做"
        aria-label="重做"
        @click="runRedo()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9h-9a6 6 0 0 0 0 12h3" />
        </svg>
      </button>

      <span class="toolbar__divider" aria-hidden="true" />

      <button
        class="tool"
        :class="{ 'is-active': editorState.tool === 'pen' }"
        type="button"
        title="铅笔"
        aria-label="铅笔"
        :aria-pressed="editorState.tool === 'pen'"
        @click="setTool('pen')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
          <path d="m14 6 4 4" />
        </svg>
      </button>

      <button
        class="tool"
        :class="{ 'is-active': editorState.tool === 'eraser' }"
        type="button"
        title="橡皮（整笔擦除）"
        aria-label="橡皮"
        :aria-pressed="editorState.tool === 'eraser'"
        @click="setTool('eraser')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 16 15 6l4 4-8 8H5v-2Z" />
          <path d="M10 20h10" />
        </svg>
      </button>

      <button
        class="tool"
        type="button"
        :disabled="!canClear"
        title="清除本页笔迹"
        aria-label="清除本页笔迹"
        @click="pendingAction = 'clear'"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3.5h8L19 8v12.5H6z" />
          <path d="M14 3.5V8h5" />
          <path d="m9.5 12 5 5M14.5 12l-5 5" />
        </svg>
      </button>

      <button
        class="tool"
        type="button"
        :disabled="!canDelete"
        title="删除本页"
        aria-label="删除本页"
        @click="pendingAction = 'delete'"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 7h15" />
          <path d="M9.5 7V4.8h5V7" />
          <path d="m6.8 7.8.8 12.2h8.8l.8-12.2" />
        </svg>
      </button>

      <button
        class="tool tool--pen-mode"
        :class="{ 'is-active': editorState.penMode }"
        type="button"
        :disabled="!editorState.penMode"
        :title="editorState.penMode ? '退出笔模式（手指已锁定）' : '用触控笔书写后自动开启'"
        aria-label="退出笔模式"
        :aria-pressed="editorState.penMode"
        @click="runExitPenMode()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" />
          <path d="m7 17 10-10" />
        </svg>
      </button>
    </div>

    <div class="toolbar__group toolbar__group--nav">
      <button
        class="tool"
        type="button"
        :disabled="!canGoPrev"
        title="上一页"
        aria-label="上一页"
        @click="goPrev()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>

      <button type="button" class="pager" title="打开页列表" @click="openPageList">
        {{ pagerLabel }}
      </button>

      <button
        class="tool"
        type="button"
        :disabled="!canGoNext"
        title="下一页"
        aria-label="下一页"
        @click="goNext()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <button class="tool" type="button" title="页列表" aria-label="页列表" @click="openPageList">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      </button>

      <button
        class="tool tool--accent"
        type="button"
        title="新建一页"
        aria-label="新建一页"
        @click="openNewPage"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>

    <div v-if="pendingAction" class="confirm" @click.self="pendingAction = null">
      <section
        class="confirm__sheet"
        role="alertdialog"
        aria-modal="true"
        :aria-label="pendingAction === 'delete' ? '删除本页' : '清除本页笔迹'"
      >
        <h2 class="confirm__title">
          {{ pendingAction === 'delete' ? '删除本页？' : '清除本页笔迹？' }}
        </h2>
        <p v-if="pendingAction === 'delete'" class="confirm__text">
          将删除「{{ currentPage?.title }}」整页，页面上的笔迹会一起删除，且无法恢复。
          <template v-if="isLastPage">本子只剩这一页，删除后会自动新建一页空白页。</template>
        </p>
        <p v-else class="confirm__text">
          将清空「{{ currentPage?.title }}」的全部笔迹，格子和页面会保留。清除后无法撤销。
        </p>
        <div class="confirm__actions">
          <button type="button" class="confirm__btn" @click="pendingAction = null">取消</button>
          <button type="button" class="confirm__btn confirm__btn--danger" @click="confirmAction">
            {{ pendingAction === 'delete' ? '删除' : '清除' }}
          </button>
        </div>
      </section>
    </div>
  </footer>
</template>

<style scoped>
.toolbar {
  flex: none;
  height: var(--bar-bottom);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.toolbar__group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar__group--nav {
  gap: 6px;
}

.toolbar__divider {
  width: 1px;
  height: 28px;
  margin: 0 6px;
  background: var(--border);
}

.tool {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  color: var(--text);
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tool svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tool:not(:disabled):active {
  background: var(--paper-shadow);
}

.tool:disabled {
  color: var(--text-muted);
  opacity: 0.4;
}

.tool.is-active {
  color: var(--accent);
  background: rgb(201 124 124 / 12%);
}

.tool--pen-mode.is-active {
  opacity: 1;
}

.tool--accent:not(:disabled) {
  color: var(--accent);
}

.pager {
  min-width: 108px;
  height: 44px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pager:active {
  background: var(--paper-shadow);
}

.confirm {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(59 47 42 / 32%);
}

.confirm__sheet {
  width: min(400px, 100%);
  padding: 20px;
  border-radius: 18px;
  background: var(--surface);
  box-shadow: 0 24px 64px rgb(59 47 42 / 24%);
}

.confirm__title {
  font-size: 17px;
}

.confirm__text {
  margin: 10px 0 18px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm__btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-muted);
}

.confirm__btn:active {
  background: var(--paper-shadow);
}

.confirm__btn--danger {
  color: #b4443f;
  font-weight: 600;
}
</style>
