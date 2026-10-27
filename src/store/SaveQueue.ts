/**
 * 落盘节流队列（PRD F6.1 / TECH §10.2）。
 *
 * 规则：
 * - 抬笔后等 `debounceMs` 合并写入，连续书写时不会每笔都打库；
 * - 但首次变脏后最多等 `maxWaitMs` 必须落盘一次，避免长时间书写一直不落盘；
 * - 写失败的内容留在队列里，下次继续尝试，不能静默丢数据。
 */

import type { PageSnapshot } from '@/core/page/types'
import type { PageStore } from '@/store/PageStore'

export const SAVE_DEBOUNCE_MS = 800
export const SAVE_MAX_WAIT_MS = 4000

export interface SaveQueueOptions {
  debounceMs?: number
  maxWaitMs?: number
  now?: () => number
  onError?: (error: unknown) => void
  onChange?: (pendingCount: number) => void
}

export class SaveQueue {
  private pending = new Map<string, () => PageSnapshot>()
  private timer: ReturnType<typeof setTimeout> | null = null
  /** 首次变脏的时间；-1 表示当前没有待写内容（不能用 0，0 是合法时间戳） */
  private firstDirtyAt = -1

  private readonly debounceMs: number
  private readonly maxWaitMs: number
  private readonly now: () => number
  private readonly onError?: (error: unknown) => void
  private readonly onChange?: (pendingCount: number) => void

  constructor(
    private readonly store: PageStore,
    options: SaveQueueOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? SAVE_DEBOUNCE_MS
    this.maxWaitMs = options.maxWaitMs ?? SAVE_MAX_WAIT_MS
    this.now = options.now ?? (() => Date.now())
    this.onError = options.onError
    this.onChange = options.onChange
  }

  get pendingCount(): number {
    return this.pending.size
  }

  get hasPending(): boolean {
    return this.pending.size > 0
  }

  /** 标记某页需要落盘；`snapshot` 在真正写入时才求值，保证拿到的是最新内容 */
  markDirty(pageId: string, snapshot: () => PageSnapshot): void {
    this.pending.set(pageId, snapshot)
    this.onChange?.(this.pending.size)

    const now = this.now()
    if (this.firstDirtyAt < 0) this.firstDirtyAt = now

    if (now - this.firstDirtyAt >= this.maxWaitMs) {
      void this.flush()
      return
    }
    this.schedule()
  }

  /** 取消某页的待写内容（页面被删除时用） */
  drop(pageId: string): void {
    if (this.pending.delete(pageId)) this.onChange?.(this.pending.size)
  }

  /** 立即落盘，返回所有写入完成的 Promise */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.size === 0) return

    const batch = [...this.pending.entries()]
    this.pending.clear()
    this.firstDirtyAt = -1
    this.onChange?.(0)

    for (const [pageId, snapshot] of batch) {
      try {
        const { meta, strokes } = snapshot()
        await this.store.putPage(meta, strokes)
      } catch (error) {
        this.onError?.(error)
        // 写失败的内容留在队列，等待下一次触发重试
        if (!this.pending.has(pageId)) this.pending.set(pageId, snapshot)
        this.onChange?.(this.pending.size)
      }
    }
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.debounceMs)
  }
}
