/**
 * 本子（页面集合）的协调层：仓储 + 落盘队列 + 当前页 + 导出/导入。
 *
 * 编辑器（EditorView）在挂载时通过 `registerEditorAdapter` 注册能力，
 * 这样页面切换、落盘、导出都能拿到最新笔迹，而不需要让本模块反向依赖组件。
 */

import { computed, reactive } from 'vue'
import { GRID_LABELS, GRID_METRICS, type GridType } from '@/config/gridConfig'
import { DEFAULT_INK_COLOR, resolveInkColor } from '@/config/inkConfig'
import {
  COPYBOOK_FONT_SIZES,
  CUSTOM_COPYBOOK_COLS,
  CUSTOM_COPYBOOK_ID,
  CUSTOM_COPYBOOK_NAME,
  CUSTOM_PINYIN_COPYBOOK_NAME,
  expandRowsPerChar,
  HANZI_TRACE_COUNT,
  PINYIN_TRACE_COUNT,
  resolveFontSizeLayout,
  sanitizeCustomChars,
  sanitizePinyinChars,
  splitIntoPages,
  upgradePinyinRows,
  type CopybookFontSize,
  type CopybookSource,
} from '@/core/copybook/types'
import type { PenWidth } from '@/core/stroke/WidthModel'
import { computeLayout, pinyinRowsForPitch } from '@/core/layout/GridLayout'
import type { PageMeta } from '@/core/page/types'
import type { Stroke } from '@/core/stroke/StrokeModel'
import { SaveQueue } from '@/store/SaveQueue'
import { createPageStore, type PageStore } from '@/store/PageStore'
import { BackupError, buildBackup, parseBackup, serializeBackup } from '@/utils/backup'
import type { BackupEntry } from '@/utils/backup'
import { getCopybookSource } from '@/lib/copybooks'
import { downloadBlob, downloadText, formatFileStamp } from '@/utils/format'
import { createId } from '@/utils/uuid'

export interface EditorAdapter {
  collectStrokes: () => Stroke[]
  loadStrokes: (strokes: Stroke[]) => void
  makeThumbnail: () => string | undefined
  exportPng: () => Promise<Blob>
  /** 当前书写区尺寸（CSS px），用于推算字帖每页行数 */
  getViewport: () => { width: number; height: number }
}

interface NotebookState {
  pages: PageMeta[]
  currentId: string
  ready: boolean
  storageMode: 'indexeddb' | 'memory'
  /** 常驻提示（存储降级等） */
  notice: string
  /** 短暂提示（导出成功等） */
  message: string
  hasUnsaved: boolean
  busy: boolean
}

export const notebook = reactive<NotebookState>({
  pages: [],
  currentId: '',
  ready: false,
  storageMode: 'indexeddb',
  notice: '',
  message: '',
  hasUnsaved: false,
  busy: false,
})

/** 用户偏好（与页面无关的全局设置） */
export const preferences = reactive({
  penWidth: 'medium' as PenWidth,
  /** 新建字帖的字号：平板横屏时默认字号偏小，允许放大 */
  copybookFontSize: 'standard' as CopybookFontSize,
  /** 书写颜色：只影响新写的笔画，已有笔迹保留落笔时的颜色 */
  inkColor: DEFAULT_INK_COLOR,
})

export const currentPage = computed<PageMeta | null>(
  () => notebook.pages.find((page) => page.id === notebook.currentId) ?? null,
)

export const currentIndex = computed<number>(() =>
  notebook.pages.findIndex((page) => page.id === notebook.currentId),
)

export const canGoPrev = computed(() => currentIndex.value > 0)
export const canGoNext = computed(
  () => currentIndex.value >= 0 && currentIndex.value < notebook.pages.length - 1,
)

let store: PageStore | null = null
let saveQueue: SaveQueue | null = null
let adapter: EditorAdapter | null = null
let initTask: Promise<void> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

export function registerEditorAdapter(next: EditorAdapter | null): void {
  adapter = next
}

/** 保留标题末尾的序号，只换类型前缀 */
function retitle(title: string, gridType: GridType): string {
  const match = /(\d+)\s*$/.exec(title)
  return `${GRID_LABELS[gridType]} ${match ? match[1] : 1}`
}

function nextIndex(): number {
  let max = 0
  for (const page of notebook.pages) {
    const match = /(\d+)\s*$/.exec(page.title)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return Math.max(max + 1, notebook.pages.length + 1)
}

function buildMeta(gridType: GridType, fixedCols?: number): PageMeta {
  const now = Date.now()
  return {
    id: createId('page'),
    createdAt: now,
    updatedAt: now,
    title: `${GRID_LABELS[gridType]} ${nextIndex()}`,
    gridType,
    fixedCols,
    kind: 'blank',
    strokeCount: 0,
  }
}

export function showToast(text: string): void {
  notebook.message = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    notebook.message = ''
    toastTimer = null
  }, 2400)
}

export function initNotebook(): Promise<void> {
  if (!initTask) initTask = boot()
  return initTask
}

async function boot(): Promise<void> {
  store = await createPageStore()
  notebook.storageMode = store.kind
  if (store.kind === 'memory') {
    notebook.notice = '无法访问本地存储，本次内容不会被保存，请及时导出备份'
  }

  saveQueue = new SaveQueue(store, {
    onChange: (count) => {
      notebook.hasUnsaved = count > 0
    },
    onError: (error) => {
      console.warn('[grid-notebook] 落盘失败', error)
      notebook.notice = '保存失败，请检查存储空间并及时导出备份'
    },
  })

  // 申请持久化存储，降低被系统清理的概率（PRD F6.2）；失败不影响使用
  void navigator.storage?.persist?.().catch(() => undefined)

  let pages = await store.listPages()
  if (pages.length === 0) {
    const meta = buildMeta('tianzi')
    await store.putPage(meta, [])
    pages = [meta]
  }

  const savedWidth = await store.getSetting<PenWidth>('penWidth')
  if (savedWidth === 'thin' || savedWidth === 'medium' || savedWidth === 'thick') {
    preferences.penWidth = savedWidth
  }

  const savedFontSize = await store.getSetting<CopybookFontSize>('copybookFontSize')
  if (savedFontSize && COPYBOOK_FONT_SIZES.includes(savedFontSize)) {
    preferences.copybookFontSize = savedFontSize
  }

  preferences.inkColor = resolveInkColor(await store.getSetting<string>('inkColor'))

  notebook.pages = pages
  const savedId = await store.getSetting<string>('currentPageId')
  const target = pages.find((page) => page.id === savedId) ?? pages[pages.length - 1]
  notebook.currentId = target.id
  notebook.ready = true
}

/**
 * 读出某页笔迹；顺带把旧版拼音字帖（每行 2 次描红）升级到当前规则。
 * 旧页面是在改规则之前生成的，不升级会一直显示 2 次，与新页面不一致。
 */
async function readPageStrokes(pageId: string): Promise<Stroke[]> {
  if (!store) return []
  const strokes = await store.getContent(pageId)

  const page = notebook.pages.find((item) => item.id === pageId)
  if (page?.gridType === 'pinyin' && page.kind === 'copybook' && page.copybook) {
    const cols = page.fixedCols ?? page.copybook.rows[0]?.cells.length ?? 0
    const rows = upgradePinyinRows(page.copybook.rows, cols)
    if (rows) {
      page.copybook = { ...page.copybook, rows }
      page.updatedAt = Date.now()
      await store.putPage(page, strokes)
    }
  }

  return strokes
}

/** 把某一页的笔迹读进编辑器（不改变 currentId 的语义由调用方保证） */
async function loadPage(pageId: string): Promise<void> {
  if (!store) return
  const strokes = await readPageStrokes(pageId)
  notebook.currentId = pageId
  adapter?.loadStrokes(strokes)
  await store.setSetting('currentPageId', pageId)
}

/** 初始化完成后由编辑器调用，把当前页笔迹载入画布 */
export async function loadCurrentPage(): Promise<void> {
  if (!store || !notebook.currentId) return
  const strokes = await readPageStrokes(notebook.currentId)
  adapter?.loadStrokes(strokes)
}

export async function selectPage(pageId: string): Promise<void> {
  if (!store || pageId === notebook.currentId) return
  await saveQueue?.flush()
  await loadPage(pageId)
}

export async function createPage(
  gridType: GridType = currentPage.value?.gridType ?? 'tianzi',
  fixedCols?: number,
): Promise<void> {
  if (!store || !saveQueue) return
  await saveQueue.flush()

  const meta = buildMeta(gridType, fixedCols)
  await store.putPage(meta, [])
  notebook.pages.push(meta)
  await loadPage(meta.id)
  showToast('已新建一页')
}

export async function deletePage(pageId: string): Promise<void> {
  if (!store || !saveQueue) return

  const index = notebook.pages.findIndex((page) => page.id === pageId)
  if (index < 0) return

  saveQueue.drop(pageId)
  await store.deletePage(pageId)
  notebook.pages.splice(index, 1)

  // 删掉最后一页时自动补一页空白，避免出现空本子（PRD F5.4）
  if (notebook.pages.length === 0) {
    const meta = buildMeta('tianzi')
    await store.putPage(meta, [])
    notebook.pages.push(meta)
    await loadPage(meta.id)
    showToast('已删除，已新建空白页')
    return
  }

  if (notebook.currentId === pageId) {
    const next = notebook.pages[Math.min(index, notebook.pages.length - 1)]
    await loadPage(next.id)
  }
  showToast('已删除该页')
}

/**
 * 清除某一页的全部笔迹，但保留页面本身（格子、标题、字帖底字都不动）。
 * 二次确认由调用方负责——这里假定用户已经确认过。
 */
export async function clearPageStrokes(pageId: string): Promise<void> {
  if (!store || !saveQueue) return

  const page = notebook.pages.find((item) => item.id === pageId)
  if (!page) return

  // 先丢掉该页排队中的快照，否则一笔旧内容可能在清除后又被写回
  saveQueue.drop(pageId)
  await saveQueue.flush()

  const meta: PageMeta = {
    ...page,
    strokeCount: 0,
    updatedAt: Date.now(),
    thumbnail: undefined,
  }
  await store.putPage(meta, [])
  Object.assign(page, meta)

  if (notebook.currentId === pageId) {
    // 整页清空同时丢弃撤销栈：旧笔迹留在栈里既占内存也容易被误恢复
    adapter?.loadStrokes([])
  }
  showToast('已清除本页笔迹')
}

export async function setGridType(gridType: GridType): Promise<void> {
  const page = currentPage.value
  if (!page || page.gridType === gridType) return

  page.gridType = gridType
  page.title = retitle(page.title, gridType)
  page.updatedAt = Date.now()
  markDirty()
}

/** 同一字帖的页序号接着已有页往后排，避免不同字帖之间串号 */
function nextSourceIndex(sourceName: string): number {
  let index = 1
  for (const page of notebook.pages) {
    if (!page.title.startsWith(sourceName)) continue
    const match = /(\d+)\s*$/.exec(page.title)
    if (match) index = Math.max(index, Number(match[1]) + 1)
  }
  return index
}

/**
 * 按字库创建描红字帖页（PRD F8.3）。
 * 每页行数由当前书写区实际能放下的行数决定，字库条目超出时自动拆成连续多页。
 */
async function createCopybookEntries(
  source: CopybookSource,
  fontSize: CopybookFontSize = 'standard',
): Promise<void> {
  if (!store || !saveQueue) return
  if (source.chars.length === 0) {
    showToast('字帖内容为空')
    return
  }

  const viewport = adapter?.getViewport() ?? { width: 1180, height: 668 }
  // 字号只能靠格子几何体现：四线三格加大行距，方格类减少列数
  const grid = resolveFontSizeLayout(source.gridType, source.cols, fontSize, GRID_METRICS.pinyinTargetPitch)
  const rowsPerPage =
    source.gridType === 'pinyin'
      ? pinyinRowsForPitch(viewport.height, grid.pitch)
      : Math.max(
          1,
          computeLayout({
            width: viewport.width,
            height: viewport.height,
            type: source.gridType,
            cols: grid.cols,
          }).rows,
        )

  // 拼音要多描几遍才记得住，汉字描红 2 次足够
  const traceCount = source.gridType === 'pinyin' ? PINYIN_TRACE_COUNT : HANZI_TRACE_COUNT
  const pageRows = splitIntoPages(source.chars, rowsPerPage, grid.cols, traceCount)
  await saveQueue.flush()

  const base = Date.now()
  const startIndex = nextSourceIndex(source.name)
  const entries = pageRows.map((rows, offset) => {
    const meta: PageMeta = {
      id: createId('page'),
      createdAt: base + offset,
      updatedAt: base + offset,
      title: `${source.name} ${startIndex + offset}`,
      gridType: source.gridType,
      fixedCols: grid.cols,
      fixedRows: rowsPerPage,
      kind: 'copybook',
      strokeCount: 0,
      copybook: { sourceId: source.id, sourceName: source.name, rows },
    }
    return { meta, strokes: [] as Stroke[] }
  })

  await store.putPages(entries)
  notebook.pages.push(...entries.map((entry) => entry.meta))
  await loadPage(entries[0].meta.id)
  showToast(`已创建 ${entries.length} 页字帖`)
}

/** 按内置字库创建（PRD F8.3） */
export async function createCopybookPages(
  sourceId: string,
  fontSize: CopybookFontSize = preferences.copybookFontSize,
): Promise<void> {
  const source = getCopybookSource(sourceId)
  if (!source) {
    showToast('字帖不存在')
    return
  }
  await createCopybookEntries(source, fontSize)
}

/** 自定义字帖的生成选项；三个参数都可省略，省略时按汉字字帖的标准字号生成 */
export interface CustomCopybookOptions {
  kind?: 'pinyin' | 'hanzi'
  /** 同一个内容连排几行（多练几遍） */
  rowsPerChar?: number
  fontSize?: CopybookFontSize
}

/**
 * 用户自定义内容：同样的自动分页逻辑，只是字库变成输入框里的内容。
 * 拼音走四线三格、汉字走田字格；页面元数据里带着完整 rows，
 * 导入导出与重开都不依赖任何字库注册表。
 */
export async function createCustomCopybookPages(
  input: string,
  options: CustomCopybookOptions = {},
): Promise<void> {
  const kind = options.kind ?? 'hanzi'
  const isPinyin = kind === 'pinyin'
  const clean = isPinyin ? sanitizePinyinChars(input) : sanitizeCustomChars(input)
  if (clean.length === 0) {
    showToast(isPinyin ? '请先输入要练的字母' : '请先输入要练的汉字')
    return
  }

  await createCopybookEntries(
    {
      id: CUSTOM_COPYBOOK_ID,
      name: isPinyin ? CUSTOM_PINYIN_COPYBOOK_NAME : CUSTOM_COPYBOOK_NAME,
      gridType: isPinyin ? 'pinyin' : 'tianzi',
      cols: CUSTOM_COPYBOOK_COLS,
      chars: expandRowsPerChar(clean, options.rowsPerChar ?? 1),
    },
    options.fontSize ?? preferences.copybookFontSize,
  )
}

/** 笔迹变化后调用：更新元数据并排队落盘 */
export function markDirty(): void {
  const page = currentPage.value
  if (!page || !saveQueue || !adapter) return

  page.updatedAt = Date.now()
  page.strokeCount = adapter.collectStrokes().length

  saveQueue.markDirty(page.id, () => {
    const thumbnail = adapter?.makeThumbnail()
    if (thumbnail) page.thumbnail = thumbnail
    return {
      meta: { ...page },
      strokes: adapter?.collectStrokes().slice() ?? [],
    }
  })
}

export async function setPenWidth(value: PenWidth): Promise<void> {
  preferences.penWidth = value
  await store?.setSetting('penWidth', value)
}

export async function setCopybookFontSize(value: CopybookFontSize): Promise<void> {
  preferences.copybookFontSize = value
  await store?.setSetting('copybookFontSize', value)
}

/** 换书写颜色：只改引擎当前色，已有笔迹保留各自的颜色 */
export async function setInkColor(value: string): Promise<void> {
  preferences.inkColor = resolveInkColor(value)
  await store?.setSetting('inkColor', preferences.inkColor)
}

export async function flushNow(): Promise<void> {
  await saveQueue?.flush()
}

export function goPrev(): void {
  if (canGoPrev.value) void selectPage(notebook.pages[currentIndex.value - 1].id)
}

export function goNext(): void {
  if (canGoNext.value) void selectPage(notebook.pages[currentIndex.value + 1].id)
}

export async function exportCurrentPagePng(): Promise<void> {
  if (!adapter) return
  notebook.busy = true
  try {
    await saveQueue?.flush()
    const blob = await adapter.exportPng()
    downloadBlob(blob, `格子本-${formatFileStamp(Date.now())}.png`)
    showToast('图片已导出')
  } catch (error) {
    console.warn('[grid-notebook] 导出图片失败', error)
    showToast('导出失败，请重试')
  } finally {
    notebook.busy = false
  }
}

export async function exportBackupFile(): Promise<void> {
  if (!store) return
  notebook.busy = true
  try {
    await saveQueue?.flush()
    const pages = await store.listPages()
    const entries: BackupEntry[] = []
    for (const meta of pages) {
      entries.push({ meta, strokes: await store.getContent(meta.id) })
    }
    downloadText(
      serializeBackup(buildBackup(entries)),
      `格子本备份-${formatFileStamp(Date.now())}.json`,
    )
    showToast(`已导出 ${entries.length} 页备份`)
  } catch (error) {
    console.warn('[grid-notebook] 导出备份失败', error)
    showToast('导出备份失败，请重试')
  } finally {
    notebook.busy = false
  }
}

/**
 * 导入备份。校验失败抛 `BackupError`，此时不写入任何数据；
 * 校验通过时整批在一个事务内写入，任一条失败整体回滚。
 */
export async function importBackupText(
  text: string,
): Promise<{ imported: number; skipped: number }> {
  if (!store) throw new BackupError('本地存储不可用')

  await saveQueue?.flush()
  const parsed = parseBackup(text)

  const base = Date.now()
  const entries = parsed.pages.map((page, index) => ({
    meta: {
      ...page.meta,
      id: createId('page'),
      createdAt: base + index,
      updatedAt: base + index,
      strokeCount: page.strokes.length,
    },
    strokes: page.strokes,
  }))

  await store.putPages(entries)
  notebook.pages.push(...entries.map((entry) => entry.meta))

  const suffix = parsed.skipped > 0 ? `，跳过 ${parsed.skipped} 页` : ''
  showToast(`已导入 ${entries.length} 页${suffix}`)
  return { imported: entries.length, skipped: parsed.skipped }
}

/** 仅供测试：重置模块内部单例 */
export function __resetNotebookForTest(): void {
  saveQueue?.dispose()
  store?.close()
  store = null
  saveQueue = null
  adapter = null
  initTask = null
  notebook.pages = []
  notebook.currentId = ''
  notebook.ready = false
  notebook.hasUnsaved = false
}
