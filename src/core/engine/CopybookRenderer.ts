/**
 * 描红底字渲染：画在格子层上，与格线同层，因此不会被橡皮擦掉，也不会被笔迹层覆盖。
 *
 * 两种格子的定位方式不同：
 * - 方格类（田字格/米字格）：一格里一个字，字号按格边长缩放，居中
 * - 四线三格：一行是一条条带，横向均分「槽位」，字母基线贴在第三线（基线）上
 */

import { COPYBOOK_STYLE } from '@/config/gridConfig'
import type { CellRole, CopybookMeta } from '@/core/copybook/types'
import { cellRectAt, stripLineYs, type GridLayout } from '@/core/layout/GridLayout'

export interface CopybookRenderInput {
  ctx: CanvasRenderingContext2D
  layout: GridLayout
  copybook: CopybookMeta
  /** 一行几个格子 / 槽位（来自字库定义） */
  cols: number
  fontStack: string
}

function roleColor(role: CellRole): string {
  const alpha = role === 'demo' ? COPYBOOK_STYLE.demoOpacity : COPYBOOK_STYLE.traceOpacity
  return `rgba(${COPYBOOK_STYLE.baseColor}, ${alpha})`
}

export function renderCopybook({
  ctx,
  layout,
  copybook,
  cols,
  fontStack,
}: CopybookRenderInput): void {
  const rowCount = Math.min(copybook.rows.length, layout.rows)
  if (rowCount === 0) return

  const slotCount = Math.max(1, Math.round(cols))

  if (layout.type === 'pinyin') {
    drawPinyin(ctx, layout, copybook, slotCount, rowCount, fontStack)
  } else {
    drawSquare(ctx, layout, copybook, slotCount, rowCount, fontStack)
  }
}

/**
 * 计算某个字在「以格中心为目标」时的基线偏移。
 *
 * 不能用 `textBaseline = 'middle'`：它按字体 ascent/descent 取中，
 * 而汉字字形在 em 框里普遍「上紧下松」，实测整体偏低 8–15px。
 * 这里直接读该字的墨迹包围盒，把墨迹中心对齐到格中心——
 * 每个格子本来就是独立的练习框，逐字居中比共用一条排版基线更符合字帖。
 */
function inkCenterOffset(ctx: CanvasRenderingContext2D, char: string, size: number): number {
  const metrics = ctx.measureText(char)
  const ascent = metrics.actualBoundingBoxAscent
  const descent = metrics.actualBoundingBoxDescent

  if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) {
    return (ascent - descent) / 2
  }
  // 老引擎拿不到实际包围盒时退回 em 框中心（0.38em）
  return size * 0.38
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  copybook: CopybookMeta,
  cols: number,
  rowCount: number,
  fontStack: string,
): void {
  const size = layout.cellSize
  const usableCols = Math.min(cols, layout.cols)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${Math.round(size * COPYBOOK_STYLE.hanziFontScale)}px ${fontStack}`

  for (let row = 0; row < rowCount; row += 1) {
    const data = copybook.rows[row]
    // 一行是同一个字，只量一次
    const centerY = size / 2 + inkCenterOffset(ctx, data.char, size)

    for (let col = 0; col < usableCols; col += 1) {
      const role = data.cells[col] ?? 'blank'
      if (role === 'blank') continue

      const rect = cellRectAt(layout, col, row)
      ctx.fillStyle = roleColor(role)
      ctx.fillText(data.char, rect.x + size / 2, rect.y + centerY)
    }
  }

  ctx.restore()
}

function drawPinyin(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  copybook: CopybookMeta,
  cols: number,
  rowCount: number,
  fontStack: string,
): void {
  const unit = layout.cellSize
  const slotWidth = layout.contentWidth / cols
  const baseSize = Math.round(unit * COPYBOOK_STYLE.pinyinFontScale)
  const maxTextWidth = slotWidth * COPYBOOK_STYLE.pinyinTextMaxRatio

  ctx.save()
  ctx.textAlign = 'center'
  // 基线对齐第 3 线：字母「坐」在基线上，升降部自然落到上下格
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${baseSize}px ${fontStack}`

  for (let row = 0; row < rowCount; row += 1) {
    const data = copybook.rows[row]
    const baseline = stripLineYs(layout, row)[2]

    // 单字母按原字号画；自定义的多字母音节（zh、zhuang）超出槽宽时等比缩小，
    // 只缩这一行，避免一个槽位的字压到相邻格
    ctx.font = `${baseSize}px ${fontStack}`
    const textWidth = ctx.measureText(data.char).width
    if (textWidth > maxTextWidth) {
      const fitSize = Math.max(1, Math.floor((baseSize * maxTextWidth) / textWidth))
      ctx.font = `${fitSize}px ${fontStack}`
    }

    for (let col = 0; col < cols; col += 1) {
      const role = data.cells[col] ?? 'blank'
      if (role === 'blank') continue

      ctx.fillStyle = roleColor(role)
      ctx.fillText(data.char, layout.originX + (col + 0.5) * slotWidth, baseline)
    }
  }

  ctx.restore()
}
