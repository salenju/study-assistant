<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { GRID_LABELS, type GridType } from '@/config/gridConfig'
import { computeLayout, type GridLayout } from '@/core/layout/GridLayout'
import { renderGrid } from '@/core/engine/GridRenderer'
import { RenderEngine, type EngineState } from '@/core/engine/RenderEngine'
import { renderCopybook } from '@/core/engine/CopybookRenderer'
import { KAI_FONT_STACK, loadKaiCommonFont, loadKaiFont } from '@/core/font/kaiFont'
import {
  canvasToBlob,
  composeCanvases,
  createThumbnail,
  resolveExportScale,
} from '@/core/export/compose'
import type { PerfStats } from '@/core/perf/PerfMonitor'
import { PEN_WIDTH_PRESETS } from '@/core/stroke/WidthModel'
import type { Stroke } from '@/core/stroke/StrokeModel'
import { syncCanvasSize } from '@/utils/canvas'
import {
  currentPage,
  flushNow,
  initNotebook,
  loadCurrentPage,
  markDirty,
  preferences,
  registerEditorAdapter,
  type EditorAdapter,
} from '@/store/notebook'
import { editorCommands, editorState } from '@/store/editorState'
import { needsCommonKaiFont } from '@/lib/copybooks'

const stageRef = ref<HTMLDivElement | null>(null)
const gridRef = ref<HTMLCanvasElement | null>(null)
const inkRef = ref<HTMLCanvasElement | null>(null)
const liveRef = ref<HTMLCanvasElement | null>(null)

const layout = shallowRef<GridLayout | null>(null)
const stageWidth = ref(0)
const stageHeight = ref(0)
const dpr = ref(window.devicePixelRatio || 1)

const showDebug = new URLSearchParams(window.location.search).has('debug')

const gridType = computed<GridType>(() => currentPage.value?.gridType ?? 'tianzi')

let engine: RenderEngine | null = null
let resizeObserver: ResizeObserver | null = null
let dprQuery: MediaQueryList | null = null
let rafId = 0
let loadingPage = false
let lastStrokeCount = 0
let lastThumbnailAt = 0
let commonFontRequested = false

function draw(): void {
  const stage = stageRef.value
  const gridCanvas = gridRef.value
  if (!stage || !gridCanvas) return

  const width = stage.clientWidth
  const height = stage.clientHeight
  if (width < 1 || height < 1) return

  // 每次都读实时 DPR：matchMedia 的 resolution 变更在部分环境不触发，
  // 不能把 DPR 缓存成状态作为绘制依据。
  const currentDpr = window.devicePixelRatio || 1

  stageWidth.value = width
  stageHeight.value = height
  dpr.value = currentDpr

  const nextLayout = computeLayout({
    width,
    height,
    type: gridType.value,
    cols: currentPage.value?.fixedCols,
    rows: currentPage.value?.fixedRows,
  })
  layout.value = nextLayout

  // 笔迹层 / 当前笔画层由引擎托管：尺寸或 DPR 变化时它会重放已有笔迹
  engine?.setViewport(width, height, currentDpr)

  const sizing = syncCanvasSize(gridCanvas, width, height, currentDpr)
  renderGrid({
    canvas: gridCanvas,
    layout: nextLayout,
    scaleX: sizing.scaleX,
    scaleY: sizing.scaleY,
  })

  // 描红底字画在格子层：不可擦除，也不会被笔迹层覆盖
  const copybook = currentPage.value?.copybook
  const gridCtx = gridCanvas.getContext('2d')
  if (copybook && gridCtx) {
    gridCtx.setTransform(sizing.scaleX, 0, 0, sizing.scaleY, 0, 0)
    renderCopybook({
      ctx: gridCtx,
      layout: nextLayout,
      copybook,
      cols: currentPage.value?.fixedCols ?? copybook.rows[0]?.cells.length ?? 1,
      fontStack: KAI_FONT_STACK,
    })
  }

  // 自定义字超出内置子集时按需补载常用字楷体，加载完重绘一次
  if (
    copybook &&
    !commonFontRequested &&
    needsCommonKaiFont(copybook.rows.map((row) => row.char))
  ) {
    commonFontRequested = true
    void loadKaiCommonFont().then(() => scheduleDraw())
  }
}

function scheduleDraw(): void {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    draw()
  })
}

function handleDprChange(): void {
  bindDprQuery()
  scheduleDraw()
}

function bindDprQuery(): void {
  dprQuery?.removeEventListener('change', handleDprChange)
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  dprQuery.addEventListener('change', handleDprChange)
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible') {
    scheduleDraw()
    return
  }
  // 切后台/锁屏前强制落盘（PRD F6.1）
  void flushNow()
}

function handleStateChange(state: EngineState): void {
  editorState.penMode = state.penMode
  editorState.canUndo = state.canUndo
  editorState.canRedo = state.canRedo
  editorState.strokeCount = state.strokeCount

  if (state.strokeCount === lastStrokeCount) return
  lastStrokeCount = state.strokeCount
  if (!loadingPage) markDirty()
}

function handlePerf(stats: PerfStats): void {
  editorState.perf = stats
}

function layerCanvases(): HTMLCanvasElement[] {
  return [gridRef.value, inkRef.value, liveRef.value].filter(
    (canvas): canvas is HTMLCanvasElement => canvas !== null,
  )
}

const adapter: EditorAdapter = {
  collectStrokes: (): Stroke[] => engine?.getStrokes() ?? [],
  loadStrokes: (strokes: Stroke[]): void => {
    loadingPage = true
    engine?.replaceStrokes(strokes)
    lastStrokeCount = strokes.length
    loadingPage = false
  },
  makeThumbnail: (): string | undefined => {
    const now = Date.now()
    const hasThumb = Boolean(currentPage.value?.thumbnail)
    if (hasThumb && now - lastThumbnailAt < 30_000) return undefined
    lastThumbnailAt = now
    return createThumbnail(layerCanvases(), stageWidth.value, stageHeight.value)
  },
  exportPng: async (): Promise<Blob> => {
    const scale = resolveExportScale(stageWidth.value, stageHeight.value)
    const canvas = composeCanvases({
      layers: layerCanvases(),
      cssWidth: stageWidth.value,
      cssHeight: stageHeight.value,
      scale,
    })
    return canvasToBlob(canvas, 'image/png')
  },
  getViewport: () => ({ width: stageWidth.value, height: stageHeight.value }),
}

onMounted(async () => {
  if (inkRef.value && liveRef.value) {
    engine = new RenderEngine({
      inkCanvas: inkRef.value,
      liveCanvas: liveRef.value,
      onStateChange: handleStateChange,
      onPerf: handlePerf,
    })
    engine.setTool(editorState.tool)
    engine.setWidthParams(PEN_WIDTH_PRESETS[preferences.penWidth])
  }

  editorCommands.undo = () => engine?.undo()
  editorCommands.redo = () => engine?.redo()
  editorCommands.exitPenMode = () => engine?.exitPenMode()

  registerEditorAdapter(adapter)

  resizeObserver = new ResizeObserver(() => scheduleDraw())
  if (stageRef.value) resizeObserver.observe(stageRef.value)

  window.addEventListener('orientationchange', scheduleDraw)
  window.visualViewport?.addEventListener('resize', scheduleDraw)
  window.addEventListener('pagehide', handlePageHide)
  document.addEventListener('visibilitychange', handleVisibility)
  bindDprQuery()

  scheduleDraw()

  // 字体异步加载，加载完必须重绘格子层，否则描红字形会停在回退字体上
  void loadKaiFont().then(() => scheduleDraw())

  await initNotebook()
  await loadCurrentPage()
  scheduleDraw()
})

function handlePageHide(): void {
  void flushNow()
}

onBeforeUnmount(() => {
  registerEditorAdapter(null)
  engine?.destroy()
  engine = null

  editorCommands.undo = undefined
  editorCommands.redo = undefined
  editorCommands.exitPenMode = undefined

  resizeObserver?.disconnect()
  resizeObserver = null
  dprQuery?.removeEventListener('change', handleDprChange)
  dprQuery = null
  window.removeEventListener('orientationchange', scheduleDraw)
  window.visualViewport?.removeEventListener('resize', scheduleDraw)
  window.removeEventListener('pagehide', handlePageHide)
  document.removeEventListener('visibilitychange', handleVisibility)
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
})

watch(gridType, () => scheduleDraw())

watch(
  () => currentPage.value?.fixedCols,
  () => scheduleDraw(),
)

// 翻页后必须重画格子层：描红底字属于页面数据，不重画会一直停在上页的字母
watch(
  () => currentPage.value?.id,
  () => scheduleDraw(),
)

watch(
  () => editorState.tool,
  (tool) => engine?.setTool(tool),
)

watch(
  () => preferences.penWidth,
  (width) => engine?.setWidthParams(PEN_WIDTH_PRESETS[width]),
)

const debugRows = computed<[string, string][]>(() => {
  const current = layout.value
  if (!current) return []
  const perf = editorState.perf

  return [
    ['视口', `${Math.round(stageWidth.value)} × ${Math.round(stageHeight.value)}`],
    ['DPR', dpr.value.toFixed(2)],
    ['格子', GRID_LABELS[current.type]],
    ['网格', current.type === 'tianzi' ? `${current.cols} 列 × ${current.rows} 行` : `${current.rows} 行`],
    ['页面', currentPage.value?.title ?? '—'],
    ['笔画', `${editorState.strokeCount} 笔`],
    ['FPS', `${perf.fps}（掉帧 ${(perf.droppedRatio * 100).toFixed(1)}%）`],
    ['首笔延迟', perf.sampleCount > 0 ? `P95 ${perf.p95Latency} ms` : '—'],
  ]
})
</script>

<template>
  <main ref="stageRef" class="stage">
    <canvas ref="gridRef" class="layer" aria-label="格子" />
    <canvas ref="inkRef" class="layer layer--ink" aria-hidden="true" />
    <canvas ref="liveRef" class="layer layer--live" aria-label="书写区" />

    <dl v-if="showDebug" class="debug">
      <template v-for="[label, value] in debugRows" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </template>
    </dl>
  </main>
</template>

<style scoped>
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--paper);
  touch-action: none;
}

.layer {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.layer--ink,
.layer--live {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.debug {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgb(255 253 247 / 88%);
  border: 1px solid var(--border);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  pointer-events: none;
}

.debug dt {
  color: var(--text-muted);
}

.debug dd {
  margin: 0;
  color: var(--text);
  text-align: right;
}
</style>
