/**
 * 格子布局计算（纯函数，不依赖 DOM / Vue）。
 *
 * 坐标约定：全部为 CSS px，原点在书写区左上角。
 * 笔迹坐标另存为归一化 0–1（见 TECH-1027.md §4.2），两者通过书写区尺寸换算。
 */

import { GRID_METRICS, type GridMetrics, type GridType } from '@/config/gridConfig'

export interface LayoutInput {
  /** 书写区宽（CSS px） */
  width: number
  /** 书写区高（CSS px） */
  height: number
  type: GridType
  /** 固定列数（字帖页用）；不传则按目标格边长自适应 */
  cols?: number
  /** 固定行数（字帖页用）；传入后格子按行列数收缩并居中，不再按剩余高度铺满 */
  rows?: number
  /** 覆盖默认度量参数，主要给单测与调试用 */
  metrics?: Partial<GridMetrics>
}

export interface GridLayout {
  type: GridType
  viewportWidth: number
  viewportHeight: number
  /** 四周留白 */
  margin: number
  /** 内容区左上角 */
  originX: number
  originY: number
  /** 田字格为列数；四线三格无列概念，固定为 1 */
  cols: number
  rows: number
  /** 田字格：单元格边长；四线三格：单格高 u */
  cellSize: number
  /** 田字格：等于 cellSize；四线三格：4u（3u 条带 + 1u 行间距） */
  rowPitch: number
  /** 内容区实际宽高（不含末尾行间距） */
  contentWidth: number
  contentHeight: number
}

export interface GridRect {
  col: number
  row: number
  x: number
  y: number
  size: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export function computeLayout(input: LayoutInput): GridLayout {
  const metrics: GridMetrics = { ...GRID_METRICS, ...input.metrics }

  const viewportWidth = Math.max(1, input.width)
  const viewportHeight = Math.max(1, input.height)
  const availWidth = Math.max(1, viewportWidth - metrics.margin * 2)
  const availHeight = Math.max(1, viewportHeight - metrics.margin * 2)

  return input.type === 'pinyin'
    ? layoutPinyin(viewportWidth, viewportHeight, availWidth, availHeight, metrics, input.rows)
    : layoutSquare(
        input.type,
        viewportWidth,
        viewportHeight,
        availWidth,
        availHeight,
        metrics,
        input.cols,
        input.rows,
      )
}

/**
 * 四线三格按目标行距反推每页行数（字帖分页用）。
 *
 * 不能直接读 `computeLayout().rows`：空白页路径会把单格高 u 夹在
 * [pinyinMinUnit, pinyinMaxUnit] 之间，字号调大时行数被卡住，大字号和特大字号会算成同一档。
 * 这里只关心「一页放几行」，不受 u 的上下限影响。
 */
export function pinyinRowsForPitch(
  height: number,
  pitch: number,
  metrics: GridMetrics = GRID_METRICS,
): number {
  const availHeight = Math.max(1, height - metrics.margin * 2)
  const rows = Math.round(availHeight / Math.max(1, pitch))
  return clamp(rows, metrics.pinyinMinRows, metrics.pinyinMaxRows)
}

/**
 * 方格类格子（田字格 / 米字格）的布局。
 * 两者只是内线不同，几何完全一致，共用一套计算，避免出现两种格子格数不一致。
 */
function layoutSquare(
  type: GridType,
  viewportWidth: number,
  viewportHeight: number,
  availWidth: number,
  availHeight: number,
  metrics: GridMetrics,
  fixedCols?: number,
  fixedRows?: number,
): GridLayout {
  const cols =
    fixedCols && fixedCols > 0
      ? Math.max(1, Math.round(fixedCols))
      : clamp(Math.round(availWidth / metrics.targetCell), metrics.minCols, metrics.maxCols)

  // 字帖页：行列都固定，格子取「宽高都能放下」的最小边长，整体居中
  if (fixedRows && fixedRows > 0) {
    const rows = Math.max(1, Math.round(fixedRows))
    const cellSize = Math.min(availWidth / cols, availHeight / rows)
    const contentWidth = cellSize * cols
    const contentHeight = cellSize * rows

    return {
      type,
      viewportWidth,
      viewportHeight,
      margin: metrics.margin,
      originX: metrics.margin + (availWidth - contentWidth) / 2,
      originY: metrics.margin + (availHeight - contentHeight) / 2,
      cols,
      rows,
      cellSize,
      rowPitch: cellSize,
      contentWidth,
      contentHeight,
    }
  }

  // 横向铺满 → 永远整数格，不出现半格
  const cellSize = availWidth / cols
  const rows = Math.max(1, Math.floor(availHeight / cellSize))
  const contentWidth = cellSize * cols
  const contentHeight = cellSize * rows

  return {
    type,
    viewportWidth,
    viewportHeight,
    margin: metrics.margin,
    originX: metrics.margin + (availWidth - contentWidth) / 2,
    originY: contentHeight <= availHeight ? metrics.margin + (availHeight - contentHeight) / 2 : metrics.margin,
    cols,
    rows,
    cellSize,
    rowPitch: cellSize,
    contentWidth,
    contentHeight,
  }
}

function layoutPinyin(
  viewportWidth: number,
  viewportHeight: number,
  availWidth: number,
  availHeight: number,
  metrics: GridMetrics,
  fixedRows?: number,
): GridLayout {
  // 单格高 u 由「目标行距」反解：先定行数，再令 rows × 4u − u 恰好填满可用高度。
  // 取整必须向下，否则多出的半行会把行数挤掉一行，导致页面下方出现大块空白。
  const fixed = fixedRows && fixedRows > 0 ? Math.max(1, Math.round(fixedRows)) : 0
  const targetRows =
    fixed ||
    clamp(
      Math.round(availHeight / metrics.pinyinTargetPitch),
      metrics.pinyinMinRows,
      metrics.pinyinMaxRows,
    )
  const rawUnit = Math.floor(availHeight / (targetRows * 4 - 1))
  // 字帖页行数是硬约束：放宽上下限，保证所有行都放得下，不能把内容挤到屏幕外
  const unit = fixed ? Math.max(8, rawUnit) : clamp(rawUnit, metrics.pinyinMinUnit, metrics.pinyinMaxUnit)
  const rowPitch = unit * 4
  const rows = fixed || Math.max(1, Math.floor((availHeight + unit) / rowPitch))
  const contentWidth = availWidth
  // 最后一行不需要行间距
  const contentHeight = (rows - 1) * rowPitch + unit * 3

  return {
    type: 'pinyin',
    viewportWidth,
    viewportHeight,
    margin: metrics.margin,
    originX: metrics.margin,
    originY: contentHeight <= availHeight ? metrics.margin + (availHeight - contentHeight) / 2 : metrics.margin,
    cols: 1,
    rows,
    cellSize: unit,
    rowPitch,
    contentWidth,
    contentHeight,
  }
}

/** 田字格：第 col 列第 row 行的单元格矩形 */
export function cellRectAt(layout: GridLayout, col: number, row: number): GridRect {
  return {
    col,
    row,
    x: layout.originX + col * layout.cellSize,
    y: layout.originY + row * layout.rowPitch,
    size: layout.cellSize,
  }
}

/** 四线三格：第 row 行四条水平线的 y 坐标（上线 / 中格上沿 / 基线 / 下线） */
export function stripLineYs(layout: GridLayout, row: number): [number, number, number, number] {
  const top = layout.originY + row * layout.rowPitch
  const unit = layout.cellSize
  return [top, top + unit, top + unit * 2, top + unit * 3]
}

/** 田字格总格数；四线三格返回行数 */
export function totalCells(layout: GridLayout): number {
  return layout.type === 'pinyin' ? layout.rows : layout.cols * layout.rows
}
