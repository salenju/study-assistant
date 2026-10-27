<script setup lang="ts">
import { computed } from 'vue'
import { APP_FULL_NAME, APP_VERSION } from '@/config/app'
import { PEN_WIDTH_LABELS, type PenWidth } from '@/core/stroke/WidthModel'
import { notebook, preferences, setPenWidth } from '@/store/notebook'
import { uiState } from '@/store/editorState'

const widths: PenWidth[] = ['thin', 'medium', 'thick']

const storageLabel = computed(() =>
  notebook.storageMode === 'indexeddb' ? '本地数据库（IndexedDB）' : '内存（不会保存）',
)

function close(): void {
  uiState.settingsOpen = false
}
</script>

<template>
  <div class="overlay" @click.self="close">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="设置">
      <header class="sheet__head">
        <h2 class="sheet__title">设置</h2>
        <button type="button" class="text-btn" @click="close">关闭</button>
      </header>

      <div class="body">
        <section class="group">
          <h3 class="group__title">笔宽</h3>
          <div class="widths">
            <button
              v-for="width in widths"
              :key="width"
              type="button"
              class="width"
              :class="{ 'is-active': preferences.penWidth === width }"
              :aria-pressed="preferences.penWidth === width"
              @click="setPenWidth(width)"
            >
              <span class="width__line" :class="`width__line--${width}`" aria-hidden="true" />
              <span class="width__label">{{ PEN_WIDTH_LABELS[width] }}</span>
            </button>
          </div>
          <p class="hint">笔宽会随书写速度变化，慢写更粗，快写更细。</p>
        </section>

        <section class="group">
          <h3 class="group__title">关于</h3>
          <dl class="info">
            <dt>应用</dt>
            <dd>{{ APP_FULL_NAME }}</dd>
            <dt>版本</dt>
            <dd>{{ APP_VERSION }}</dd>
            <dt>数据存储</dt>
            <dd>{{ storageLabel }}</dd>
          </dl>
          <p v-if="notebook.storageMode === 'memory'" class="warning">
            当前无法保存到本地，请在页列表里及时导出备份。
          </p>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(59 47 42 / 32%);
}

.sheet {
  width: min(520px, 100%);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 24px 64px rgb(59 47 42 / 24%);
  overflow: hidden;
}

.sheet__head {
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

.body {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.group__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.widths {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.width {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 76px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--text);
  transition: border-color 0.16s ease, color 0.16s ease;
}

.width.is-active {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 0 2px rgb(201 124 124 / 18%);
}

.width__line {
  display: block;
  border-radius: 999px;
  background: currentColor;
}

.width__line--thin {
  width: 46px;
  height: 2px;
}

.width__line--medium {
  width: 46px;
  height: 3.5px;
}

.width__line--thick {
  width: 46px;
  height: 5px;
}

.width__label {
  font-size: 14px;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  font-size: 14px;
}

.info dt {
  color: var(--text-muted);
}

.info dd {
  margin: 0;
  color: var(--text);
  text-align: right;
}

.warning {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fdf1ef;
  border: 1px solid #e9c6c2;
  color: #a4524d;
  font-size: 13px;
}
</style>
