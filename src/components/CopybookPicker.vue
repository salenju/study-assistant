<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CopybookSource } from '@/core/copybook/types'
import { MAX_CUSTOM_CHARS, sanitizeCustomChars } from '@/core/copybook/types'
import { KAI_FONT_STACK } from '@/core/font/kaiFont'
import { listCopybookSources } from '@/lib/copybooks'
import { createCopybookPages, createCustomCopybookPages } from '@/store/notebook'
import { uiState } from '@/store/editorState'

const props = defineProps<{ kind: 'pinyin' | 'hanzi' }>()

const sources = computed<CopybookSource[]>(() => listCopybookSources(props.kind))
const creating = ref(false)

const customText = ref('')
const customChars = computed(() => sanitizeCustomChars(customText.value))

const title = computed(() => (props.kind === 'pinyin' ? '选择拼音字帖' : '选择汉字字帖'))

function close(): void {
  uiState.pickerKind = null
}

async function choose(source: CopybookSource): Promise<void> {
  if (creating.value) return
  creating.value = true
  try {
    uiState.pickerKind = null
    await createCopybookPages(source.id)
  } finally {
    creating.value = false
  }
}

async function createCustom(): Promise<void> {
  if (creating.value || customChars.value.length === 0) return

  creating.value = true
  try {
    uiState.pickerKind = null
    await createCustomCopybookPages(customChars.value)
  } finally {
    creating.value = false
  }
}

/** 卡片上展示前 8 个字，用真实楷体渲染，家长一眼能看出字形 */
function previewChars(source: CopybookSource): string[] {
  return source.chars.slice(0, 8)
}
</script>

<template>
  <div class="overlay" @click.self="close">
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <header class="sheet__head">
        <h2 class="sheet__title">{{ title }}</h2>
        <button type="button" class="text-btn" @click="close">取消</button>
      </header>

      <div class="list">
        <form v-if="kind === 'hanzi'" class="custom" @submit.prevent="createCustom">
          <label class="custom__label" for="custom-chars">自定义描红内容</label>
          <textarea
            id="custom-chars"
            v-model="customText"
            class="custom__input"
            rows="2"
            :maxlength="MAX_CUSTOM_CHARS * 4"
            placeholder="输入要练的字，如：春 风 花 草"
          />
          <div class="custom__foot">
            <span class="custom__hint">
              已识别 {{ customChars.length }} / {{ MAX_CUSTOM_CHARS }} 字
            </span>
            <button
              type="submit"
              class="primary-btn"
              :disabled="creating || customChars.length === 0"
            >
              生成字帖
            </button>
          </div>
        </form>

        <p v-if="kind === 'hanzi'" class="list__label">内置字帖</p>

        <button
          v-for="source in sources"
          :key="source.id"
          type="button"
          class="card"
          :disabled="creating"
          @click="choose(source)"
        >
          <div class="card__head">
            <span class="card__name">{{ source.name }}</span>
            <span class="card__count">{{ source.chars.length }} 个字</span>
          </div>
          <div class="card__preview" :style="{ fontFamily: KAI_FONT_STACK }">
            <span v-for="(char, index) in previewChars(source)" :key="index" class="card__char">
              {{ char }}
            </span>
            <span class="card__more">…</span>
          </div>
        </button>

        <p v-if="sources.length === 0" class="empty">暂无可用字帖</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: clamp(12px, 3vw, 24px);
  background: rgb(59 47 42 / 32%);
}

/* 与新建弹窗一致：限高 + 内部滚动，避免在平板矮屏上撑满 */
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

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overscroll-behavior: contain;
}

.list__label {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.custom {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}

.custom__label {
  font-size: 14px;
  font-weight: 600;
}

.custom__input {
  width: 100%;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--paper);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  line-height: 1.5;
  resize: none;
  /* body 上的 user-select: none 会连带禁用输入框的选取，必须显式放开 */
  user-select: text;
  -webkit-user-select: text;
}

.custom__input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.custom__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.custom__hint {
  font-size: 12px;
  color: var(--text-muted);
}

.primary-btn {
  flex: none;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  background: var(--accent);
  color: #fffdf7;
  font-size: 14px;
}

.primary-btn:disabled {
  opacity: 0.45;
}

.card {
  display: block;
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--paper);
  text-align: left;
}

.card:not(:disabled):active {
  border-color: var(--accent);
}

.card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.card__name {
  font-size: 15px;
  color: var(--text);
}

.card__count {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.card__preview {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  color: rgb(60 50 45 / 62%);
  overflow: hidden;
}

.card__char {
  font-size: 26px;
  line-height: 1;
}

.card__more {
  font-size: 14px;
  color: var(--text-muted);
}

.empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
