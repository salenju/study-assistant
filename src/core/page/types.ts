/**
 * 页面数据模型（PRD §5.1 / §5.2）。
 *
 * 元数据与笔迹分成两条记录存放：页列表只读元数据（每页 < 2KB），
 * 打开某页时才取笔迹（单页可达数 MB）。见 TECH §10.1。
 */

import type { GridType } from '@/config/gridConfig'
import type { CopybookMeta } from '@/core/copybook/types'
import type { Stroke } from '@/core/stroke/StrokeModel'

export type PageKind = 'blank' | 'copybook'

export interface PageMeta {
  id: string
  createdAt: number
  updatedAt: number
  /** 自动生成的标题，如「田字格 3」「拼音字母表 1」 */
  title: string
  gridType: GridType
  /** 固定列数（字帖页用）；为空表示按视口自适应 */
  fixedCols?: number
  /** 固定行数（字帖页用）；为空表示按视口自适应 */
  fixedRows?: number
  kind: PageKind
  strokeCount: number
  /** 描红内容；仅 kind === 'copybook' 时存在 */
  copybook?: CopybookMeta
  /** 列表用缩略图（dataURL） */
  thumbnail?: string
}

export interface PageContent {
  pageId: string
  strokes: Stroke[]
}

export interface PageSnapshot {
  meta: PageMeta
  strokes: Stroke[]
}

/** 单页笔迹数据量告警阈值（点数量） */
export const PAGE_POINT_WARN = 80_000
