<script setup lang="ts">
import { computed } from 'vue'
import { GRID_LABELS, type GridType } from '@/config/gridConfig'
import { currentPage, notebook, setGridType } from '@/store/notebook'
import { editorState, uiState } from '@/store/editorState'

const gridType = computed<GridType>(() => currentPage.value?.gridType ?? 'tianzi')

// 字帖页的格子由字库决定，随手切类型会让描红内容和格子对不上
const isCopybook = computed(() => currentPage.value?.kind === 'copybook')

const options: { value: GridType; label: string }[] = [
  { value: 'tianzi', label: GRID_LABELS.tianzi },
  { value: 'mizige', label: GRID_LABELS.mizige },
  { value: 'pinyin', label: GRID_LABELS.pinyin },
]
</script>

<template>
  <header class="topbar">
    <h1 class="topbar__title">
      {{ currentPage?.title ?? '格子本' }}
      <span v-if="notebook.hasUnsaved" class="dot" title="有未保存的内容" aria-label="未保存" />
    </h1>

    <div class="segmented" role="tablist" aria-label="选择格子类型">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        role="tab"
        class="segmented__item"
        :class="{ 'is-active': gridType === option.value }"
        :aria-selected="gridType === option.value"
        :disabled="isCopybook"
        :title="isCopybook ? '字帖页的格子由字帖决定，不能切换' : option.label"
        @click="setGridType(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <span class="topbar__spacer" aria-hidden="true" />

    <!-- 笔模式必须持续可见，否则孩子/家长无法判断手指为何写不出字（PRD F3.2） -->
    <span v-if="editorState.penMode" class="pen-badge" role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="m7 17 10-10" />
      </svg>
      笔模式 · 手指已锁定
    </span>

    <button
      type="button"
      class="icon-btn"
      aria-label="设置"
      title="设置"
      @click="uiState.settingsOpen = true"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h11M21 17h-1" />
        <circle cx="16" cy="7" r="2.2" />
        <circle cx="10" cy="12" r="2.2" />
        <circle cx="18" cy="17" r="2.2" />
      </svg>
    </button>
  </header>
</template>

<style scoped>
.topbar {
  flex: none;
  height: var(--bar-top);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.topbar__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 96px;
  font-size: 16px;
  letter-spacing: 0.02em;
  color: var(--text);
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.75;
}

.topbar__spacer {
  flex: 1;
}

.segmented {
  display: flex;
  padding: 3px;
  gap: 2px;
  border-radius: 999px;
  background: var(--paper-shadow);
}

.segmented__item {
  min-height: 40px;
  min-width: 76px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 15px;
  color: var(--text-muted);
  transition: background-color 0.16s ease, color 0.16s ease;
}

.segmented__item:disabled {
  cursor: default;
}

.segmented__item.is-active {
  background: var(--surface);
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(59 47 42 / 12%);
}

.pen-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgb(201 124 124 / 12%);
  color: var(--accent);
  font-size: 13px;
  white-space: nowrap;
}

.icon-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--text-muted);
}

.icon-btn:active {
  background: var(--paper-shadow);
}

.icon-btn svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.pen-badge svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
</style>
