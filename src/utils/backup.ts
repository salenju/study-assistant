/**
 * 备份文件的构建与校验（PRD F7.2 / F7.3）。
 *
 * 校验逻辑是纯函数，不碰 DOM 与数据库，便于单测；
 * 真正的写入由上层在一个事务里完成，任一条失败则整体回滚。
 */

import type { GridType } from '@/config/gridConfig'
import type { CellRole, CopyRow, CopybookMeta } from '@/core/copybook/types'
import type { PageMeta } from '@/core/page/types'
import { POINT_STRIDE } from '@/core/stroke/StrokeModel'
import type { Stroke } from '@/core/stroke/StrokeModel'

export const BACKUP_APP_ID = 'grid-notebook'
export const BACKUP_SCHEMA_VERSION = 1

/** 单页笔迹上限，超过则跳过该页而不是整份备份失败 */
export const MAX_PAGE_POINTS = 200_000

export interface BackupEntry {
  meta: PageMeta
  strokes: Stroke[]
}

export interface BackupFile {
  app: string
  schemaVersion: number
  exportedAt: number
  pages: BackupEntry[]
}

export interface ParsedBackup {
  pages: BackupEntry[]
  skipped: number
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

const GRID_TYPES: GridType[] = ['tianzi', 'mizige', 'pinyin']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function buildBackup(pages: BackupEntry[], exportedAt: number = Date.now()): BackupFile {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    pages,
  }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file)
}

/** 校验字帖内容；不合法返回 null（整页会被跳过） */
function parseCopybook(raw: unknown): CopybookMeta | null {
  if (!isRecord(raw)) return null
  if (typeof raw.sourceId !== 'string' || raw.sourceId.length === 0) return null
  if (typeof raw.sourceName !== 'string') return null
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) return null

  const rows: CopyRow[] = []
  for (const item of raw.rows) {
    if (!isRecord(item)) return null
    if (typeof item.char !== 'string' || item.char.length === 0) return null
    if (!Array.isArray(item.cells) || item.cells.length === 0) return null

    const cells: CellRole[] = []
    for (const cell of item.cells) {
      if (cell !== 'demo' && cell !== 'trace' && cell !== 'blank') return null
      cells.push(cell)
    }
    rows.push({ char: item.char, cells })
  }

  return { sourceId: raw.sourceId, sourceName: raw.sourceName, rows }
}

/** 校验并规整单页元数据；不合法返回 null */
function parseMeta(raw: unknown): PageMeta | null {
  if (!isRecord(raw)) return null

  const gridType = raw.gridType
  if (typeof gridType !== 'string' || !GRID_TYPES.includes(gridType as GridType)) return null
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  if (typeof raw.title !== 'string') return null
  if (!isFiniteNumber(raw.createdAt) || !isFiniteNumber(raw.updatedAt)) return null

  const kind = raw.kind === 'copybook' ? 'copybook' : 'blank'
  const strokeCount = isFiniteNumber(raw.strokeCount) ? raw.strokeCount : 0
  const fixedCols =
    isFiniteNumber(raw.fixedCols) && raw.fixedCols > 0 ? Math.round(raw.fixedCols) : undefined
  const fixedRows =
    isFiniteNumber(raw.fixedRows) && raw.fixedRows > 0 ? Math.round(raw.fixedRows) : undefined

  // 字帖页少了描红内容就画不出任何底字，视为该页损坏
  let copybook: CopybookMeta | undefined
  if (kind === 'copybook') {
    const parsed = parseCopybook(raw.copybook)
    if (!parsed) return null
    copybook = parsed
  }

  return {
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    title: raw.title,
    gridType: gridType as GridType,
    fixedCols,
    fixedRows,
    kind,
    strokeCount,
    copybook,
    thumbnail: typeof raw.thumbnail === 'string' ? raw.thumbnail : undefined,
  }
}

/** 校验并规整单页笔迹；不合法返回 null */
function parseStrokes(raw: unknown): Stroke[] | null {
  if (!Array.isArray(raw)) return null

  const strokes: Stroke[] = []
  let totalPoints = 0

  for (const item of raw) {
    if (!isRecord(item)) return null
    if (typeof item.id !== 'string' || item.id.length === 0) return null
    if (typeof item.color !== 'string') return null
    if (!Array.isArray(item.points)) return null

    const points = item.points
    if (points.length === 0 || points.length % POINT_STRIDE !== 0) return null

    for (const value of points) {
      if (!isFiniteNumber(value)) return null
    }

    totalPoints += points.length / POINT_STRIDE
    if (totalPoints > MAX_PAGE_POINTS) return null

    strokes.push({ id: item.id, color: item.color, points: points.slice() as number[] })
  }

  return strokes
}

/**
 * 解析备份文本。
 * 文件级问题直接抛 `BackupError`（调用方据此提示且不写入任何数据）；
 * 单页损坏只计入 `skipped`，其余页正常导入（PRD F7.3）。
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('文件无法解析')
  }

  if (!isRecord(raw)) throw new BackupError('文件无法解析')
  if (raw.app !== BACKUP_APP_ID) throw new BackupError('不是本应用的备份文件')

  const version = raw.schemaVersion
  if (!isFiniteNumber(version)) throw new BackupError('备份文件缺少版本信息')
  if (version > BACKUP_SCHEMA_VERSION) throw new BackupError('备份来自更高版本，请先升级应用')

  if (!Array.isArray(raw.pages)) throw new BackupError('备份文件缺少页面数据')

  const pages: BackupEntry[] = []
  let skipped = 0

  for (const item of raw.pages) {
    if (!isRecord(item)) {
      skipped += 1
      continue
    }
    const meta = parseMeta(item.meta)
    const strokes = parseStrokes(item.strokes)
    if (!meta || !strokes) {
      skipped += 1
      continue
    }
    pages.push({ meta: { ...meta, strokeCount: strokes.length }, strokes })
  }

  if (pages.length === 0) throw new BackupError('备份中没有可导入的页面')

  return { pages, skipped }
}
