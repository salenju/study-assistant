/**
 * 页面持久化仓储。
 *
 * 元数据与笔迹分表（TECH §10.1）：页列表只读 `pages`，打开某页才读 `contents`。
 * IndexedDB 不可用时降级到内存实现，由上层显示「无法保存」告警，绝不静默丢数据。
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { PageContent, PageMeta } from '@/core/page/types'
import type { Stroke } from '@/core/stroke/StrokeModel'

const DB_NAME = 'grid-notebook'
const DB_VERSION = 1

export interface PageStore {
  readonly kind: 'indexeddb' | 'memory'
  listPages(): Promise<PageMeta[]>
  getContent(pageId: string): Promise<Stroke[]>
  putPage(meta: PageMeta, strokes: Stroke[]): Promise<void>
  /** 批量写入：整批在一个事务内完成，用于备份导入（任一条失败则整体回滚） */
  putPages(entries: { meta: PageMeta; strokes: Stroke[] }[]): Promise<void>
  deletePage(pageId: string): Promise<void>
  getSetting<T>(key: string): Promise<T | undefined>
  setSetting(key: string, value: unknown): Promise<void>
  close(): void
}

interface SettingRecord {
  key: string
  value: unknown
}

interface NotebookDB extends DBSchema {
  pages: { key: string; value: PageMeta }
  contents: { key: string; value: PageContent }
  settings: { key: string; value: SettingRecord }
}

/** 把可能带响应式代理的元数据转成可结构化克隆的纯对象 */
function plainMeta(meta: PageMeta): PageMeta {
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    title: meta.title,
    gridType: meta.gridType,
    fixedCols: meta.fixedCols,
    fixedRows: meta.fixedRows,
    kind: meta.kind,
    strokeCount: meta.strokeCount,
    copybook: meta.copybook
      ? {
          sourceId: meta.copybook.sourceId,
          sourceName: meta.copybook.sourceName,
          rows: meta.copybook.rows.map((row) => ({ char: row.char, cells: [...row.cells] })),
        }
      : undefined,
    thumbnail: meta.thumbnail,
  }
}

/** 笔迹点复制一份，既避免代理对象写库失败，也防止落盘途中被后续操作改动 */
function plainStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((stroke) => ({
    id: stroke.id,
    color: stroke.color,
    points: stroke.points.slice(),
  }))
}

class IndexedDbStore implements PageStore {
  readonly kind = 'indexeddb' as const

  constructor(private readonly db: IDBPDatabase<NotebookDB>) {}

  async listPages(): Promise<PageMeta[]> {
    const pages = await this.db.getAll('pages')
    return pages.sort((a, b) => a.createdAt - b.createdAt)
  }

  async getContent(pageId: string): Promise<Stroke[]> {
    const record = await this.db.get('contents', pageId)
    return record?.strokes ?? []
  }

  async putPage(meta: PageMeta, strokes: Stroke[]): Promise<void> {
    const tx = this.db.transaction(['pages', 'contents'], 'readwrite')
    await Promise.all([
      tx.objectStore('pages').put(plainMeta(meta)),
      tx.objectStore('contents').put({ pageId: meta.id, strokes: plainStrokes(strokes) }),
      tx.done,
    ])
  }

  async putPages(entries: { meta: PageMeta; strokes: Stroke[] }[]): Promise<void> {
    if (entries.length === 0) return
    const tx = this.db.transaction(['pages', 'contents'], 'readwrite')
    const pagesStore = tx.objectStore('pages')
    const contentsStore = tx.objectStore('contents')

    for (const entry of entries) {
      void pagesStore.put(plainMeta(entry.meta))
      void contentsStore.put({ pageId: entry.meta.id, strokes: plainStrokes(entry.strokes) })
    }
    // 不使用 Promise.all：任一请求失败会让整个事务 abort，这里只需等事务结束
    await tx.done
  }

  async deletePage(pageId: string): Promise<void> {
    const tx = this.db.transaction(['pages', 'contents'], 'readwrite')
    await Promise.all([
      tx.objectStore('pages').delete(pageId),
      tx.objectStore('contents').delete(pageId),
      tx.done,
    ])
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const record = await this.db.get('settings', key)
    return record?.value as T | undefined
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.put('settings', { key, value })
  }

  close(): void {
    this.db.close()
  }
}

class MemoryStore implements PageStore {
  readonly kind = 'memory' as const

  private pages = new Map<string, PageMeta>()
  private contents = new Map<string, Stroke[]>()
  private settings = new Map<string, unknown>()

  async listPages(): Promise<PageMeta[]> {
    return [...this.pages.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  async getContent(pageId: string): Promise<Stroke[]> {
    return this.contents.get(pageId) ?? []
  }

  async putPage(meta: PageMeta, strokes: Stroke[]): Promise<void> {
    this.pages.set(meta.id, plainMeta(meta))
    this.contents.set(meta.id, plainStrokes(strokes))
  }

  async putPages(entries: { meta: PageMeta; strokes: Stroke[] }[]): Promise<void> {
    for (const entry of entries) {
      this.pages.set(entry.meta.id, plainMeta(entry.meta))
      this.contents.set(entry.meta.id, plainStrokes(entry.strokes))
    }
  }

  async deletePage(pageId: string): Promise<void> {
    this.pages.delete(pageId)
    this.contents.delete(pageId)
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return this.settings.get(key) as T | undefined
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    this.settings.set(key, value)
  }

  close(): void {
    this.pages.clear()
    this.contents.clear()
    this.settings.clear()
  }
}

/**
 * 打开仓储；IndexedDB 不可用（隐私模式、配额、库损坏）时降级到内存。
 * 调用方必须检查 `kind === 'memory'` 并提示用户导出备份。
 */
export async function createPageStore(): Promise<PageStore> {
  if (typeof indexedDB === 'undefined') return new MemoryStore()

  try {
    const db = await openDB<NotebookDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        // 只建缺失的 store，任何情况下都不删除已有数据
        if (oldVersion < 1) {
          if (!database.objectStoreNames.contains('pages')) {
            database.createObjectStore('pages', { keyPath: 'id' })
          }
          if (!database.objectStoreNames.contains('contents')) {
            database.createObjectStore('contents', { keyPath: 'pageId' })
          }
          if (!database.objectStoreNames.contains('settings')) {
            database.createObjectStore('settings', { keyPath: 'key' })
          }
        }
      },
    })
    return new IndexedDbStore(db)
  } catch (error) {
    console.warn('[grid-notebook] IndexedDB 打开失败，降级为内存模式', error)
    return new MemoryStore()
  }
}

export { MemoryStore }
