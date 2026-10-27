/**
 * 笔迹绘制：中点二次贝塞尔 + 逐段可变线宽。
 *
 * 几何规则（points 为 CSS px、步长 4）：
 * - 起笔：p0 → mid(p0, p1) 的直线段
 * - 主体：对每个 k ∈ [1, n-2]，从 mid(p[k-1], p[k]) 以 p[k] 为控制点画到 mid(p[k], p[k+1])
 * - 收笔：mid(p[n-2], p[n-1]) → p[n-1] 的直线段，保证不留「提前断尾」
 * - 单点：画一个半径 width/2 的圆点
 *
 * 逐段设置 lineWidth 才能真正表现笔锋；round cap/join 让相邻段自然衔接、不留断口。
 */

import { POINT_STRIDE, countPoints } from '@/core/stroke/StrokeModel'

const MIN_DRAW_WIDTH = 0.5

function prepare(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(MIN_DRAW_WIDTH, width)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function midX(data: number[], index: number, nextIndex: number): number {
  return (data[index * POINT_STRIDE] + data[nextIndex * POINT_STRIDE]) / 2
}

function midY(data: number[], index: number, nextIndex: number): number {
  return (data[index * POINT_STRIDE + 1] + data[nextIndex * POINT_STRIDE + 1]) / 2
}

/** 单点笔迹：一个圆点 */
export function paintDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, Math.max(MIN_DRAW_WIDTH, width / 2), 0, Math.PI * 2)
  ctx.fill()
}

/** 起笔段：p0 → mid(p0, p1)。点数不足 2 时退化为圆点 */
export function paintHead(ctx: CanvasRenderingContext2D, data: number[], color: string): void {
  const n = countPoints(data)
  if (n === 0) return
  if (n === 1) {
    paintDot(ctx, data[0], data[1], data[3], color)
    return
  }

  prepare(ctx, color, data[3])
  ctx.beginPath()
  ctx.moveTo(data[0], data[1])
  ctx.lineTo(midX(data, 0, 1), midY(data, 0, 1))
  ctx.stroke()
}

/** 主体曲线段：k ∈ [1, n-2] */
export function paintCurve(
  ctx: CanvasRenderingContext2D,
  data: number[],
  k: number,
  color: string,
): void {
  const n = countPoints(data)
  if (k < 1 || k > n - 2) return

  prepare(ctx, color, data[k * POINT_STRIDE + 3])
  ctx.beginPath()
  ctx.moveTo(midX(data, k - 1, k), midY(data, k - 1, k))
  ctx.quadraticCurveTo(
    data[k * POINT_STRIDE],
    data[k * POINT_STRIDE + 1],
    midX(data, k, k + 1),
    midY(data, k, k + 1),
  )
  ctx.stroke()
}

/** 收笔段：mid(p[n-2], p[n-1]) → p[n-1] */
export function paintTail(ctx: CanvasRenderingContext2D, data: number[], color: string): void {
  const n = countPoints(data)
  if (n < 2) return

  const last = n - 1
  prepare(ctx, color, data[last * POINT_STRIDE + 3])
  ctx.beginPath()
  ctx.moveTo(midX(data, n - 2, last), midY(data, n - 2, last))
  ctx.lineTo(data[last * POINT_STRIDE], data[last * POINT_STRIDE + 1])
  ctx.stroke()
}

/** 整笔重绘（用于撤销重建、加载页面） */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  data: number[],
  color: string,
): void {
  const n = countPoints(data)
  if (n === 0) return
  if (n === 1) {
    paintDot(ctx, data[0], data[1], data[3], color)
    return
  }

  paintHead(ctx, data, color)
  for (let k = 1; k <= n - 2; k += 1) {
    paintCurve(ctx, data, k, color)
  }
  paintTail(ctx, data, color)
}
