import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageMeta, PageSnapshot } from '@/core/page/types'
import type { PageStore } from '@/store/PageStore'
import { SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS, SaveQueue } from '@/store/SaveQueue'

class FakeStore implements PageStore {
  readonly kind = 'memory' as const
  writes: string[] = []
  failures = 0

  async listPages(): Promise<PageMeta[]> {
    return []
  }

  async getContent(): Promise<never[]> {
    return []
  }

  async putPage(meta: PageMeta): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1
      throw new Error('写入失败')
    }
    this.writes.push(meta.id)
  }

  async putPages(): Promise<void> {}

  async deletePage(): Promise<void> {}

  async getSetting<T>(): Promise<T | undefined> {
    return undefined
  }

  async setSetting(): Promise<void> {}

  close(): void {}
}

function meta(id: string): PageMeta {
  return {
    id,
    createdAt: 0,
    updatedAt: 0,
    title: id,
    gridType: 'tianzi',
    kind: 'blank',
    strokeCount: 0,
  }
}

function snapshot(id: string): () => PageSnapshot {
  return () => ({ meta: meta(id), strokes: [] })
}

let store: FakeStore

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  store = new FakeStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SaveQueue / 节流', () => {
  it('抬笔后等 debounce 才落盘', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1)
    expect(store.writes).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(store.writes).toEqual(['a'])
  })

  it('连续书写期间只写一次', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))

    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(200)
      queue.markDirty('a', snapshot('a'))
    }
    expect(store.writes).toEqual([])

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(store.writes).toEqual(['a'])
  })

  it('长时间连续书写时由 maxWait 兜底强制落盘', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))

    let elapsed = 0
    while (elapsed < SAVE_MAX_WAIT_MS) {
      await vi.advanceTimersByTimeAsync(700)
      elapsed += 700
      queue.markDirty('a', snapshot('a'))
    }

    await Promise.resolve()
    await Promise.resolve()
    expect(store.writes).toEqual(['a'])
  })

  it('多页分别记录，各自落盘', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))
    queue.markDirty('b', snapshot('b'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(store.writes.sort()).toEqual(['a', 'b'])
  })
})

describe('SaveQueue / 显式控制', () => {
  it('flush 立即写入并清空队列', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))
    expect(queue.pendingCount).toBe(1)

    await queue.flush()
    expect(store.writes).toEqual(['a'])
    expect(queue.pendingCount).toBe(0)
  })

  it('drop 取消某页的待写内容', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))
    queue.drop('a')

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
    expect(store.writes).toEqual([])
    expect(queue.pendingCount).toBe(0)
  })

  it('空队列 flush 不产生写入', async () => {
    const queue = new SaveQueue(store)
    await queue.flush()
    expect(store.writes).toEqual([])
  })

  it('dispose 后不再落盘', async () => {
    const queue = new SaveQueue(store)
    queue.markDirty('a', snapshot('a'))
    queue.dispose()
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
    expect(store.writes).toEqual([])
  })
})

describe('SaveQueue / 失败重试', () => {
  it('写入失败的内容留在队列，下次继续尝试', async () => {
    store.failures = 1
    const errors: unknown[] = []
    const queue = new SaveQueue(store, { onError: (error) => errors.push(error) })

    queue.markDirty('a', snapshot('a'))
    await queue.flush()

    expect(store.writes).toEqual([])
    expect(queue.pendingCount).toBe(1)
    expect(errors).toHaveLength(1)

    await queue.flush()
    expect(store.writes).toEqual(['a'])
    expect(queue.pendingCount).toBe(0)
  })
})

describe('SaveQueue / 待写数量回调', () => {
  it('标记与清空时都会通知', async () => {
    const counts: number[] = []
    const queue = new SaveQueue(store, { onChange: (count) => counts.push(count) })

    queue.markDirty('a', snapshot('a'))
    queue.markDirty('b', snapshot('b'))
    await queue.flush()

    expect(counts).toEqual([1, 2, 0])
  })
})
