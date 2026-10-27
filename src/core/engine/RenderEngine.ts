/**
 * 手写渲染引擎：三层画布的编排者。
 *
 * 性能关键点（对应 TECH §13）：
 * - live 层只追加新线段、从不清屏 → 单笔代价从 O(点数) 降到 O(新增点数)；
 * - 抬笔时用一次 drawImage 把 live 层贴到 ink 层，不重画整笔；
 * - 所有绘制收口到 rAF，pointermove 只做数据 push。
 */

import {
  paintCurve,
  paintHead,
  paintStroke,
  paintTail,
} from '@/core/engine/StrokePainter'
import { UndoStack, type HistoryOp } from '@/core/history/UndoStack'
import { findStrokeAt } from '@/core/hit/EraseHitTest'
import { PointerInput, type InputSample } from '@/core/input/PointerInput'
import { PerfMonitor, type PerfStats } from '@/core/perf/PerfMonitor'
import {
  MAX_POINTS_PER_STROKE,
  countPoints,
  normalizeStroke,
  toPixelData,
  type Stroke,
} from '@/core/stroke/StrokeModel'
import {
  DEFAULT_WIDTH_PARAMS,
  WidthTracker,
  detectPressure,
  type WidthMode,
  type WidthParams,
} from '@/core/stroke/WidthModel'
import type { Tool } from '@/core/types'
import { syncCanvasSize } from '@/utils/canvas'

/** 采样最小位移（CSS px），小于此值的移动视为抖动丢弃 */
const MIN_MOVE_DISTANCE = 0.8

/** 擦除命中容差（CSS px，PRD F4.2） */
const DEFAULT_ERASE_TOLERANCE = 12

/** 性能数据上报间隔（ms） */
const PERF_REPORT_INTERVAL = 400

export interface EngineState {
  strokeCount: number
  canUndo: boolean
  canRedo: boolean
  penMode: boolean
}

export interface EngineOptions {
  inkCanvas: HTMLCanvasElement
  liveCanvas: HTMLCanvasElement
  color?: string
  widthParams?: WidthParams
  eraseTolerance?: number
  onStateChange?: (state: EngineState) => void
  onPerf?: (stats: PerfStats) => void
}

export class RenderEngine {
  private readonly inkCanvas: HTMLCanvasElement
  private readonly liveCanvas: HTMLCanvasElement
  private readonly inkCtx: CanvasRenderingContext2D
  private readonly liveCtx: CanvasRenderingContext2D
  private readonly pointer: PointerInput
  private readonly history = new UndoStack()
  private readonly perf = new PerfMonitor()

  private widthParams: WidthParams
  private color: string
  private readonly eraseTolerance: number
  private readonly onStateChange?: (state: EngineState) => void
  private readonly onPerf?: (stats: PerfStats) => void

  private width = 0
  private height = 0
  private scaleX = 1
  private scaleY = 1

  private strokes: Stroke[] = []
  private tool: Tool = 'pen'

  // 当前笔画状态
  private liveData: number[] = []
  private liveColor = ''
  private liveTracker: WidthTracker | null = null
  private liveMode: WidthMode = 'speed'
  private livePaintedCurve = 0
  private liveHeadPainted = false
  private lastPoint: { x: number; y: number; time: number } | null = null
  private pressureSamples: number[] = []
  private pressureUsable = false
  private drawing = false
  private erasing = false

  private rafId = 0
  private lastPerfReport = 0

  constructor(options: EngineOptions) {
    this.inkCanvas = options.inkCanvas
    this.liveCanvas = options.liveCanvas

    const inkCtx = this.inkCanvas.getContext('2d')
    const liveCtx = this.liveCanvas.getContext('2d')
    if (!inkCtx || !liveCtx) throw new Error('Canvas 2D 上下文不可用')
    this.inkCtx = inkCtx
    this.liveCtx = liveCtx

    this.color = options.color ?? '#2b2b2b'
    this.widthParams = { ...(options.widthParams ?? DEFAULT_WIDTH_PARAMS) }
    this.eraseTolerance = options.eraseTolerance ?? DEFAULT_ERASE_TOLERANCE
    this.onStateChange = options.onStateChange
    this.onPerf = options.onPerf

    this.pointer = new PointerInput(this.liveCanvas, {
      onBegin: this.handleBegin,
      onMove: this.handleMove,
      onEnd: this.handleEnd,
      onPenModeChange: () => this.emitState(),
    })
  }

  // ---------------------------------------------------------------- 外部 API

  /** 视口尺寸变化时调用；尺寸真的变了才重建 ink 层 */
  setViewport(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)

    const sizing = syncCanvasSize(this.inkCanvas, this.width, this.height, dpr)
    syncCanvasSize(this.liveCanvas, this.width, this.height, dpr)

    this.scaleX = sizing.scaleX
    this.scaleY = sizing.scaleY

    if (sizing.resized) {
      this.abortLiveStroke()
      this.rebuildInk()
    }

    this.pointer.refreshRect()
  }

  setTool(tool: Tool): void {
    if (this.tool === tool) return
    this.abortLiveStroke()
    this.tool = tool
  }

  getTool(): Tool {
    return this.tool
  }

  setColor(color: string): void {
    this.color = color
  }

  setWidthParams(params: Partial<WidthParams>): void {
    this.widthParams = { ...this.widthParams, ...params }
  }

  get penMode(): boolean {
    return this.pointer.isPenMode
  }

  /** 手动退出笔模式（PRD F3.1 要求显式退出入口） */
  exitPenMode(): void {
    this.pointer.setPenMode(false)
    this.emitState()
  }

  undo(): void {
    const op = this.history.takeUndo()
    if (!op) return
    this.applyInverse(op)
  }

  redo(): void {
    const op = this.history.takeRedo()
    if (!op) return
    this.applyForward(op)
  }

  getStrokes(): Stroke[] {
    return this.strokes
  }

  replaceStrokes(strokes: Stroke[]): void {
    // 切页/加载时先丢弃进行中的笔画，避免它落到新页面上
    this.abortLiveStroke()
    this.strokes = strokes
    this.history.clear()
    this.rebuildInk()
    this.emitState()
  }

  getPerfStats(): PerfStats {
    return this.perf.stats
  }

  resetPerf(): void {
    this.perf.reset()
  }

  destroy(): void {
    this.pointer.destroy()
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.drawing = false
  }

  // ---------------------------------------------------------------- 输入处理

  private handleBegin = (sample: InputSample): void => {
    if (this.tool === 'eraser') {
      this.erasing = true
      this.eraseAt(sample)
      return
    }

    this.perf.markPointerDown(performance.now())
    this.startStroke(sample)
  }

  private handleMove = (sample: InputSample): void => {
    if (this.erasing || !this.drawing) return
    this.extendStroke(sample)
  }

  private handleEnd = (sample: InputSample): void => {
    if (this.erasing) {
      this.erasing = false
      return
    }
    if (!this.drawing) return
    this.finishStroke(sample)
  }

  // ---------------------------------------------------------------- 笔迹生命周期

  private startStroke(sample: InputSample): void {
    this.liveTracker = new WidthTracker(this.widthParams)
    this.liveMode = this.pressureUsable ? 'pressure' : 'speed'
    this.liveColor = this.color
    this.pressureSamples = []

    // 首点速度恒为 0，若交给速度模型会取到最粗值，起笔处出现突兀的粗圆点；
    // 这里固定取中值：既有落笔即见的墨点，又不会比后续笔迹明显更粗。
    const tracker = this.liveTracker
    const width =
      this.liveMode === 'pressure'
        ? tracker.next(0, 1, sample.pressure, this.liveMode)
        : this.widthParams.min + (this.widthParams.max - this.widthParams.min) * 0.4
    this.liveData = [sample.x, sample.y, sample.pressure, width]
    this.livePaintedCurve = 0
    this.liveHeadPainted = false
    this.lastPoint = { x: sample.x, y: sample.y, time: sample.time }
    this.drawing = true

    this.startFrameLoop()
  }

  private extendStroke(sample: InputSample): void {
    const last = this.lastPoint
    const tracker = this.liveTracker
    if (!last || !tracker) return

    const dx = sample.x - last.x
    const dy = sample.y - last.y
    const distance = Math.hypot(dx, dy)
    if (distance < MIN_MOVE_DISTANCE) return

    if (countPoints(this.liveData) >= MAX_POINTS_PER_STROKE) return

    const dt = sample.time - last.time
    const width = tracker.next(distance, dt, sample.pressure, this.liveMode)

    this.liveData.push(sample.x, sample.y, sample.pressure, width)
    this.pressureSamples.push(sample.pressure)
    this.lastPoint = { x: sample.x, y: sample.y, time: sample.time }
  }

  private finishStroke(sample: InputSample): void {
    // 收笔时补最后一个采样点，避免「提前断尾」
    const last = this.lastPoint
    if (last) {
      const dx = sample.x - last.x
      const dy = sample.y - last.y
      if (Math.hypot(dx, dy) >= 0.2 && countPoints(this.liveData) < MAX_POINTS_PER_STROKE) {
        const tracker = this.liveTracker
        const width = tracker
          ? tracker.next(Math.hypot(dx, dy), Math.max(sample.time - last.time, 0.5), sample.pressure, this.liveMode)
          : this.widthParams.max
        this.liveData.push(sample.x, sample.y, sample.pressure, width)
      }
    }

    this.paintLiveComplete()

    // 一次 drawImage 把当前笔画并入已完成层，不重画整笔
    this.inkCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.inkCtx.drawImage(this.liveCanvas, 0, 0)
    this.clearLiveLayer()

    const stroke = normalizeStroke(this.liveData, this.width, this.height, this.liveColor)
    this.strokes.push(stroke)
    this.history.record({ kind: 'add', index: this.strokes.length - 1, stroke })

    // 设备压感能力在抬笔时判定一次，下一笔生效
    if (this.pressureSamples.length >= 6) {
      this.pressureUsable = detectPressure(this.pressureSamples)
    }

    this.stopFrameLoop()
    this.drawing = false
    this.liveData = []
    this.liveTracker = null
    this.lastPoint = null
    this.pressureSamples = []

    this.emitState()
  }

  private abortLiveStroke(): void {
    if (!this.drawing) return
    this.stopFrameLoop()
    this.clearLiveLayer()
    this.drawing = false
    this.liveData = []
    this.liveTracker = null
    this.lastPoint = null
    this.pressureSamples = []
  }

  // ---------------------------------------------------------------- 绘制

  private startFrameLoop(): void {
    if (this.rafId) return
    this.perf.resetFrameClock()
    this.rafId = requestAnimationFrame(this.frame)
  }

  private stopFrameLoop(): void {
    if (!this.rafId) return
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  private frame = (now: number): void => {
    this.rafId = 0
    this.perf.markFrame(now)

    // 只有真正落墨的帧才算「首帧已绘制」，否则延迟指标会虚低
    const painted = this.paintLiveIncrement()
    if (painted) this.perf.markPaint(now)

    if (now - this.lastPerfReport > PERF_REPORT_INTERVAL) {
      this.lastPerfReport = now
      this.onPerf?.(this.perf.stats)
    }

    if (this.drawing) {
      this.rafId = requestAnimationFrame(this.frame)
    }
  }

  /**
   * 只绘制本帧新增的线段，返回是否真的落了墨。
   *
   * 只有一个点时也画（一个圆点）：否则首帧白等一帧，首笔延迟会多出整整 16ms。
   * 首点线宽在 startStroke 里已固定为中值，因此圆点与后续重放得到的
   * 「起笔圆头」视觉一致，不会在尺寸重建后跳变。
   */
  private paintLiveIncrement(): boolean {
    const n = countPoints(this.liveData)
    if (n === 0) return false

    const ctx = this.liveCtx
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0)

    if (!this.liveHeadPainted) {
      paintHead(ctx, this.liveData, this.liveColor)
      this.liveHeadPainted = true
    }

    const lastCurve = n - 2
    for (let k = this.livePaintedCurve + 1; k <= lastCurve; k += 1) {
      paintCurve(ctx, this.liveData, k, this.liveColor)
    }
    if (lastCurve > this.livePaintedCurve) this.livePaintedCurve = lastCurve

    return true
  }

  /** 抬笔前补齐收笔段，保证笔迹不断尾 */
  private paintLiveComplete(): void {
    const n = countPoints(this.liveData)
    if (n === 0) return

    const ctx = this.liveCtx
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0)

    if (!this.liveHeadPainted) {
      paintHead(ctx, this.liveData, this.liveColor)
      this.liveHeadPainted = true
    }

    for (let k = this.livePaintedCurve + 1; k <= n - 2; k += 1) {
      paintCurve(ctx, this.liveData, k, this.liveColor)
    }
    this.livePaintedCurve = n - 2

    paintTail(ctx, this.liveData, this.liveColor)
  }

  private clearLiveLayer(): void {
    const ctx = this.liveCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height)
  }

  private rebuildInk(): void {
    const ctx = this.inkCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.inkCanvas.width, this.inkCanvas.height)
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0)

    for (const stroke of this.strokes) {
      paintStroke(ctx, toPixelData(stroke, this.width, this.height), stroke.color)
    }
  }

  // ---------------------------------------------------------------- 擦除与历史

  private eraseAt(sample: InputSample): void {
    const index = findStrokeAt(
      this.strokes,
      { x: sample.x, y: sample.y },
      this.width,
      this.height,
      this.eraseTolerance,
    )
    if (index < 0) return

    const [stroke] = this.strokes.splice(index, 1)
    this.history.record({ kind: 'remove', index, stroke })
    this.rebuildInk()
    this.emitState()
  }

  private applyInverse(op: HistoryOp): void {
    if (op.kind === 'add') {
      this.strokes.splice(op.index, 1)
    } else {
      this.strokes.splice(op.index, 0, op.stroke)
    }
    this.rebuildInk()
    this.emitState()
  }

  private applyForward(op: HistoryOp): void {
    if (op.kind === 'add') {
      this.strokes.splice(op.index, 0, op.stroke)
    } else {
      this.strokes.splice(op.index, 1)
    }
    this.rebuildInk()
    this.emitState()
  }

  // ---------------------------------------------------------------- 状态

  private emitState(): void {
    this.onStateChange?.({
      strokeCount: this.strokes.length,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      penMode: this.pointer.isPenMode,
    })
  }
}

export type { PerfStats }
