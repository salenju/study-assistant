/**
 * 性能采样（仅开发模式使用，不参与业务逻辑）。
 *
 * 首笔延迟是**代理指标**：从 pointerdown 到首帧绘制完成，不含浏览器合成与屏幕刷新，
 * 真实上屏还需再加 8–16ms。PRD 的「P95 ≤ 32ms」即按此口径。
 */

export interface PerfStats {
  /** 近 120 帧平均帧率 */
  fps: number
  /** 近 120 帧中耗时 > 32ms 的占比 */
  droppedRatio: number
  /** 首笔延迟 P95（ms） */
  p95Latency: number
  /** 最近一次首笔延迟（ms） */
  lastLatency: number
  /** 已采集的延迟样本数 */
  sampleCount: number
}

const FRAME_WINDOW = 120
const LATENCY_WINDOW = 200

export class PerfMonitor {
  private frameDeltas: number[] = []
  private latencies: number[] = []
  private lastFrameAt = 0
  private downAt = 0
  private awaitingPaint = false

  reset(): void {
    this.frameDeltas.length = 0
    this.latencies.length = 0
    this.lastFrameAt = 0
    this.downAt = 0
    this.awaitingPaint = false
  }

  /**
   * 落笔瞬间开始计时。
   *
   * 必须无条件重置：若上一笔在首帧绘制前就结束（极快的轻点、合成事件），
   * 标记会一直挂起，导致后续笔画沿用一个很旧的时间起点，
   * 实测能把 13ms 的真实延迟报成 318ms。
   */
  markPointerDown(now: number): void {
    this.downAt = now
    this.awaitingPaint = true
  }

  /** 首帧绘制完成后收口 */
  markPaint(now: number): void {
    if (!this.awaitingPaint) return
    this.awaitingPaint = false
    this.latencies.push(now - this.downAt)
    if (this.latencies.length > LATENCY_WINDOW) this.latencies.shift()
  }

  /**
   * 帧循环开始前调用。
   * 帧循环只在书写期间运行，若不重置，两次书写之间的空闲期会被算成一帧，
   * FPS 会被严重拉低（实测能把 60 显示成 6）。
   */
  resetFrameClock(): void {
    this.lastFrameAt = 0
  }

  /** 每帧调用一次 */
  markFrame(now: number): void {
    if (this.lastFrameAt > 0) {
      this.frameDeltas.push(now - this.lastFrameAt)
      if (this.frameDeltas.length > FRAME_WINDOW) this.frameDeltas.shift()
    }
    this.lastFrameAt = now
  }

  get stats(): PerfStats {
    const frames = this.frameDeltas
    let total = 0
    let dropped = 0
    for (const delta of frames) {
      total += delta
      if (delta > 32) dropped += 1
    }

    const fps = frames.length > 0 && total > 0 ? (frames.length * 1000) / total : 0
    const droppedRatio = frames.length > 0 ? dropped / frames.length : 0

    return {
      fps: Math.round(fps),
      droppedRatio,
      p95Latency: percentile(this.latencies, 0.95),
      lastLatency: this.latencies.length > 0 ? this.latencies[this.latencies.length - 1] : 0,
      sampleCount: this.latencies.length,
    }
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return Math.round(sorted[index] * 10) / 10
}
