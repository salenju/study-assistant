/**
 * 格子渲染器：只负责把 GridLayout 画到格子层画布上。
 *
 * 性能约定（见 PLAN-1027.md M1）：
 * - 只在初始化 / 布局变化 / 主题变化时调用；
 * - 同类线条合并为一次 stroke()，整页绘制不超过 4 次描边调用。
 */

import { GRID_THEME, type GridTheme } from '@/config/gridConfig'
import type { GridLayout } from '@/core/layout/GridLayout'
import { createSnap, resolveLineWidth } from '@/utils/canvas'

export interface GridRenderOptions {
  canvas: HTMLCanvasElement
  layout: GridLayout
  /** 物理像素 / CSS 像素，取自 syncCanvasSize */
  scaleX: number
  scaleY: number
  theme?: Partial<GridTheme>
}

type SnapFn = (value: number) => number

export function renderGrid({ canvas, layout, scaleX, scaleY, theme }: GridRenderOptions): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resolved: GridTheme = { ...GRID_THEME, ...theme }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = resolved.paper
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 之后所有绘制使用 CSS px 逻辑坐标
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
  ctx.lineWidth = resolveLineWidth(resolved.lineWidthCss, scaleX)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'

  const snapX = createSnap(scaleX, resolved.lineWidthCss)
  const snapY = createSnap(scaleY, resolved.lineWidthCss)

  if (layout.type === 'pinyin') {
    drawPinyin(ctx, layout, snapX, snapY, resolved)
  } else {
    drawSquareGrid(ctx, layout, snapX, snapY, resolved, layout.type === 'mizige')
  }
}

/**
 * 方格类格子：田字格 / 米字格。
 *
 * 两者共用一次描边完成外框、一次描边完成内线；
 * 米字格只是在内线路径里多加两条对角线，描边次数不变。
 * 对角线是斜线，无法做像素吸附，端点吸附到格线交点即可，抗锯齿属正常表现。
 */
function drawSquareGrid(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  snapX: SnapFn,
  snapY: SnapFn,
  theme: GridTheme,
  withDiagonals: boolean,
): void {
  const { cols, rows, originX, originY, cellSize, rowPitch } = layout
  const frame = new Path2D()
  const inner = new Path2D()

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const left = snapX(originX + col * cellSize)
      const right = snapX(originX + (col + 1) * cellSize)
      const top = snapY(originY + row * rowPitch)
      const bottom = snapY(originY + (row + 1) * rowPitch)

      frame.rect(left, top, right - left, bottom - top)

      const midX = snapX(originX + (col + 0.5) * cellSize)
      const midY = snapY(originY + (row + 0.5) * rowPitch)
      inner.moveTo(left, midY)
      inner.lineTo(right, midY)
      inner.moveTo(midX, top)
      inner.lineTo(midX, bottom)

      if (withDiagonals) {
        inner.moveTo(left, top)
        inner.lineTo(right, bottom)
        inner.moveTo(right, top)
        inner.lineTo(left, bottom)
      }
    }
  }

  ctx.strokeStyle = theme.line
  ctx.stroke(frame)

  ctx.save()
  ctx.setLineDash(theme.midDash)
  ctx.strokeStyle = theme.lineSoft
  ctx.stroke(inner)
  ctx.restore()
}

function drawPinyin(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  snapX: SnapFn,
  snapY: SnapFn,
  theme: GridTheme,
): void {
  const { rows, originX, originY, cellSize, rowPitch, contentWidth } = layout
  const left = snapX(originX)
  const right = snapX(originX + contentWidth)

  // 上线 + 下线：普通实线
  const normal = new Path2D()
  // 第 2 线（中格上沿）：虚线
  const soft = new Path2D()
  // 第 3 线（基线）：加粗色，字母落脚处
  const baseline = new Path2D()

  for (let row = 0; row < rows; row += 1) {
    const top = originY + row * rowPitch
    const y1 = snapY(top)
    const y2 = snapY(top + cellSize)
    const y3 = snapY(top + cellSize * 2)
    const y4 = snapY(top + cellSize * 3)

    normal.moveTo(left, y1)
    normal.lineTo(right, y1)

    soft.moveTo(left, y2)
    soft.lineTo(right, y2)

    baseline.moveTo(left, y3)
    baseline.lineTo(right, y3)

    normal.moveTo(left, y4)
    normal.lineTo(right, y4)
  }

  ctx.strokeStyle = theme.line
  ctx.stroke(normal)

  ctx.save()
  ctx.setLineDash(theme.midDash)
  ctx.strokeStyle = theme.lineSoft
  ctx.stroke(soft)
  ctx.restore()

  ctx.strokeStyle = theme.lineBaseline
  ctx.stroke(baseline)
}
