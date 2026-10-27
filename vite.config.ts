import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

/**
 * 部署在子路径（GitHub Pages 的 /<仓库名>/）时必须改 base，
 * 否则 CSS/JS/字体仍指向根路径，页面会白屏。
 *
 * 本地开发与根路径部署不需要设置，默认 '/'。
 */
const rawBase = process.env.VITE_BASE ?? '/'
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      // 不自动刷新：孩子可能正在写，只在应用内提示「有新版本」
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '拼音田字格手写本',
        short_name: '格子本',
        description: '给孩子的离线手写格子本，支持田字格、米字格、四线三格与描红字帖',
        lang: 'zh-CN',
        // scope / start_url 必须跟着 base 走，否则安装后打开是空白页
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        theme_color: '#fdf6e3',
        background_color: '#fdf6e3',
        icons: [
          { src: `${base}icons/192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${base}icons/maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // 离线兜底页同样要落到子路径下
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
