<script setup lang="ts">
import type { GridType } from '@/config/gridConfig'
import { createPage } from '@/store/notebook'
import { uiState } from '@/store/editorState'

interface Option {
  key: string
  label: string
  desc: string
  /** 预览图标用的格子类型 */
  preview: GridType
  action: { type: 'blank'; gridType: GridType } | { type: 'copybook'; kind: 'pinyin' | 'hanzi' }
}

const options: Option[] = [
  {
    key: 'tianzi',
    label: '空白田字格',
    desc: '练字、抄写',
    preview: 'tianzi',
    action: { type: 'blank', gridType: 'tianzi' },
  },
  {
    key: 'mizige',
    label: '空白米字格',
    desc: '练字、定位更准',
    preview: 'mizige',
    action: { type: 'blank', gridType: 'mizige' },
  },
  {
    key: 'pinyin',
    label: '空白四线三格',
    desc: '练拼音',
    preview: 'pinyin',
    action: { type: 'blank', gridType: 'pinyin' },
  },
  {
    key: 'pinyin-book',
    label: '拼音字帖',
    desc: '描红练习',
    preview: 'pinyin',
    action: { type: 'copybook', kind: 'pinyin' },
  },
  {
    key: 'hanzi-book',
    label: '汉字字帖',
    desc: '描红练习',
    preview: 'tianzi',
    action: { type: 'copybook', kind: 'hanzi' },
  },
]

function close(): void {
  uiState.newPageOpen = false
}

async function choose(option: Option): Promise<void> {
  if (option.action.type === 'copybook') {
    // 先收起本弹层，再打开字帖选择器，避免两层浮层叠在一起
    uiState.newPageOpen = false
    uiState.pickerKind = option.action.kind
    return
  }
  close()
  await createPage(option.action.gridType)
}
</script>

<template>
  <div class="overlay" @click.self="close">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="新建页面">
      <header class="sheet__head">
        <h2 class="sheet__title">新建一页</h2>
        <button type="button" class="text-btn" @click="close">取消</button>
      </header>

      <div class="options">
        <button
          v-for="option in options"
          :key="option.key"
          type="button"
          class="option"
          @click="choose(option)"
        >
          <span class="option__preview" aria-hidden="true">
            <svg v-if="option.preview === 'pinyin'" viewBox="0 0 48 48">
              <path d="M2 14h44M2 21h44M2 28h44M2 35h44" stroke="currentColor" stroke-width="1" />
              <path d="M2 21h44M2 28h44" stroke="currentColor" stroke-width="0.9" stroke-dasharray="3 3" />
            </svg>
            <svg v-else viewBox="0 0 48 48">
              <rect x="4" y="4" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" />
              <path d="M24 4v40M4 24h40" stroke="currentColor" stroke-width="0.9" stroke-dasharray="3 3" />
              <path
                v-if="option.preview === 'mizige'"
                d="M4 4l40 40M44 4L4 44"
                stroke="currentColor"
                stroke-width="0.9"
                stroke-dasharray="3 3"
              />
            </svg>
          </span>
          <span class="option__label">{{ option.label }}</span>
          <span class="option__desc">{{ option.desc }}</span>
        </button>
      </div>
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
  padding: clamp(12px, 3vw, 24px);
  background: rgb(59 47 42 / 32%);
}

/* 矮屏（平板横屏的 CSS 视口往往只有 400px 高）必须限高并内部滚动 */
.sheet {
  width: min(560px, 100%);
  max-height: 100%;
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
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.sheet__title {
  font-size: 16px;
}

.text-btn {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-muted);
}

/* 5 个选项在平板宽度下排 3 列 → 两行收完，不再撑满竖屏 */
.options {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  gap: 10px;
  padding: 12px 16px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 左图标右文字：卡片矮一半，平板矮屏也不会撑满 */
.option {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 2px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--paper);
  text-align: left;
  transition: border-color 0.16s ease;
}

.option:active {
  border-color: var(--accent);
}

.option__preview {
  /* 绝对定位 svg：否则 svg 的 1:1 固有比例会撑破图标框 */
  position: relative;
  grid-row: 1 / span 2;
  width: 44px;
  height: 44px;
  overflow: hidden;
  color: var(--accent);
}

.option__preview svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
}

.option__label {
  font-size: 14px;
  color: var(--text);
}

.option__desc {
  font-size: 11px;
  color: var(--text-muted);
}

/* 窄屏两列时压缩图标与字号，避免标题折行 */
@media (max-width: 420px) {
  .option {
    grid-template-columns: 38px minmax(0, 1fr);
    column-gap: 8px;
    padding: 8px 10px;
  }

  .option__preview {
    width: 38px;
    height: 38px;
  }

  .option__label {
    font-size: 13px;
  }
}
</style>
