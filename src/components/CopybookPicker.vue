<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CopybookSource } from '@/core/copybook/types'
import { KAI_FONT_STACK } from '@/core/font/kaiFont'
import { listCopybookSources } from '@/lib/copybooks'
import { createCopybookPages } from '@/store/notebook'
import { uiState } from '@/store/editorState'

const props = defineProps<{ kind: 'pinyin' | 'hanzi' }>()

const sources = computed<CopybookSource[]>(() => listCopybookSources(props.kind))
const creating = ref(false)

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
  padding: 24px;
  background: rgb(59 47 42 / 32%);
}

.sheet {
  width: min(640px, 100%);
  max-height: min(80vh, 700px);
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
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.sheet__title {
  font-size: 17px;
}

.text-btn {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-muted);
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overscroll-behavior: contain;
}

.card {
  display: block;
  width: 100%;
  padding: 14px 16px;
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
  margin-bottom: 10px;
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
  gap: 10px;
  color: rgb(60 50 45 / 62%);
}

.card__char {
  font-size: 30px;
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
