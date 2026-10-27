/**
 * 指针输入采集层。
 *
 * 三件事：
 * 1. pointerdown / move / up / cancel 统一入口，不区分 mouse 与 touch；
 * 2. 用 getCoalescedEvents 补齐浏览器合并掉的高频采样点；
 * 3. 笔模式（Pen Mode）：一旦检测到 pen，丢弃后续所有非 pen 事件，防止手掌误触。
 */

export interface InputSample {
  /** 相对书写区左上角的 CSS px */
  x: number
  y: number
  pressure: number
  pointerType: string
  /** 事件时间戳（ms，与 performance.now 同基准） */
  time: number
}

export interface PointerInputHandlers {
  onBegin: (sample: InputSample) => void
  onMove: (sample: InputSample) => void
  onEnd: (sample: InputSample) => void
  onPenModeChange: (active: boolean) => void
}

export class PointerInput {
  private penMode = false
  private activePointerId: number | null = null
  private rect: DOMRect | null = null

  constructor(
    private readonly el: HTMLElement,
    private readonly handlers: PointerInputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onPointerDown, { passive: false })
    el.addEventListener('pointermove', this.onPointerMove, { passive: false })
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('contextmenu', this.onContextMenu)
  }

  get isPenMode(): boolean {
    return this.penMode
  }

  setPenMode(active: boolean): void {
    if (this.penMode === active) return
    this.penMode = active
  }

  /** 布局变化后刷新缓存的位置信息 */
  refreshRect(): void {
    this.rect = null
  }

  destroy(): void {
    const el = this.el
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointercancel', this.onPointerUp)
    el.removeEventListener('contextmenu', this.onContextMenu)
    this.activePointerId = null
    this.rect = null
  }

  private onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private getRect(): DOMRect {
    if (!this.rect) this.rect = this.el.getBoundingClientRect()
    return this.rect
  }

  /** 笔模式下丢弃一切非笔输入；非笔模式下全部接受 */
  private accept(type: string): boolean {
    if (type === 'pen') {
      if (!this.penMode) {
        this.penMode = true
        this.handlers.onPenModeChange(true)
      }
      return true
    }
    return !this.penMode
  }

  private toSample(event: PointerEvent): InputSample {
    const rect = this.getRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure,
      pointerType: event.pointerType,
      time: event.timeStamp,
    }
  }

  private onPointerDown = (event: PointerEvent): void => {
    // 多指同时按下只认第一根：其余指针在抬起前全部忽略（PRD F2.3）
    if (this.activePointerId !== null) return
    if (!this.accept(event.pointerType)) return

    event.preventDefault()
    this.rect = this.el.getBoundingClientRect()
    this.activePointerId = event.pointerId
    try {
      this.el.setPointerCapture(event.pointerId)
    } catch {
      // 某些环境不支持指针捕获，忽略即可
    }

    this.handlers.onBegin(this.toSample(event))
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return
    event.preventDefault()

    // 浏览器按帧派发 pointermove，但底层采样频率可达 240Hz，
    // 不取合并事件会丢掉大量中间点，表现为快速书写折线、断线。
    const coalesced = event.getCoalescedEvents?.()
    const events = coalesced && coalesced.length > 0 ? coalesced : [event]
    for (const raw of events) {
      this.handlers.onMove(this.toSample(raw))
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return

    this.activePointerId = null
    try {
      this.el.releasePointerCapture(event.pointerId)
    } catch {
      // 忽略
    }

    const sample = this.toSample(event)
    this.handlers.onEnd(sample)
  }
}
