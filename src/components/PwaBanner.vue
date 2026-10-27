<script setup lang="ts">
/**
 * PWA 的两条提示：安装到桌面、新版本可用（PRD F9.1）。
 *
 * 安装提示要避开书写区、忽略后 7 天内不再打扰；更新提示绝不自动刷新，
 * 否则孩子写到一半页面会跳走。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'grid-notebook:install-dismissed'
const DISMISS_DAYS = 7
const INSTALL_DELAY = 5000

const needRefresh = ref(false)
const showInstall = ref(false)
const offlineReady = ref(false)

let deferredPrompt: BeforeInstallPromptEvent | null = null
let updateSW: ((reload?: boolean) => Promise<void>) | null = null
let installTimer: ReturnType<typeof setTimeout> | null = null
let readyTimer: ReturnType<typeof setTimeout> | null = null

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
}

function recentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const at = Number(raw)
  return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000
}

function handleBeforeInstall(event: Event): void {
  // 必须拦截默认行为，否则 Chrome 会用自己的时机弹，拦不住也存不下
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent

  if (isStandalone() || recentlyDismissed()) return
  if (installTimer) clearTimeout(installTimer)
  // 进入编辑器 5 秒后再提示，避免孩子刚上手就被横幅挡住
  installTimer = setTimeout(() => {
    showInstall.value = true
  }, INSTALL_DELAY)
}

async function install(): Promise<void> {
  if (!deferredPrompt) return
  await deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  deferredPrompt = null
  showInstall.value = false
  if (choice.outcome === 'dismissed') {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }
}

function dismissInstall(): void {
  showInstall.value = false
  localStorage.setItem(DISMISS_KEY, String(Date.now()))
}

function applyUpdate(): void {
  needRefresh.value = false
  void updateSW?.(true)
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', handleBeforeInstall)

  updateSW = registerSW({
    onNeedRefresh() {
      needRefresh.value = true
    },
    onOfflineReady() {
      offlineReady.value = true
      if (readyTimer) clearTimeout(readyTimer)
      readyTimer = setTimeout(() => {
        offlineReady.value = false
      }, 3000)
    },
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  if (installTimer) clearTimeout(installTimer)
  if (readyTimer) clearTimeout(readyTimer)
})
</script>

<template>
  <div class="pwa">
    <div v-if="needRefresh" class="banner banner--update" role="status">
      <span class="banner__text">有新版本可用</span>
      <button type="button" class="banner__action" @click="applyUpdate">点此刷新</button>
    </div>

    <div v-if="showInstall" class="banner" role="status">
      <span class="banner__text">安装到桌面，离线也能写</span>
      <button type="button" class="banner__action" @click="install">安装</button>
      <button type="button" class="banner__close" aria-label="暂不安装" @click="dismissInstall">×</button>
    </div>

    <div v-if="offlineReady" class="banner banner--quiet" role="status">
      <span class="banner__text">已可离线使用</span>
    </div>
  </div>
</template>

<style scoped>
.pwa {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bar-bottom) + 12px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 15;
  pointer-events: none;
}

.banner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 16px;
  border-radius: 999px;
  background: rgb(59 47 42 / 92%);
  color: #fffdf7;
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(59 47 42 / 24%);
  white-space: nowrap;
}

.banner--update {
  background: var(--accent);
}

.banner--quiet {
  justify-content: center;
  padding: 8px 16px;
}

.banner__text {
  flex: 1;
}

.banner__action {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgb(255 253 247 / 92%);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

.banner__close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: inherit;
  opacity: 0.7;
  font-size: 18px;
  line-height: 1;
}
</style>
