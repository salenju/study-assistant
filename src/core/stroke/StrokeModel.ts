/**
 * 笔迹数据模型。
 *
 * 存储格式：扁平数组，步长 4 —— [x, y, pressure, width, ...]
 * - x / y：归一化 0–1，相对书写区尺寸（见 TECH §4.2）
 * - pressure：采集时的原始压感 0–1，留作后续笔锋微调与回放
 * - width：线宽归一化到页面高度（即「占页面高度的比例」），
 *   保证换屏 / 旋转后笔迹粗细与位置同比缩放，不出现「位置变了粗细没变」。
 */

import { createId } from '@/utils/uuid'

export const POINT_STRIDE = 4

export interface Stroke {
  id: string
  color: string
  /** 扁平归一化点数据，长度恒为 POINT_STRIDE 的整数倍 */
  points: number[]
}

/** 采集阶段的点：CSS px 像素坐标，尚未归一化 */
export interface LivePoint {
  x: number
  y: number
  pressure: number
  width: number
}

/** 单笔点数上限，超出后停止采样（PRD F2.3） */
export const MAX_POINTS_PER_STROKE = 2000

export function countPoints(data: number[]): number {
  return Math.floor(data.length / POINT_STRIDE)
}

/** 把一批 LivePoint 转成扁平数组（CSS px，仍为像素坐标） */
export function flattenPoints(points: LivePoint[]): number[] {
  const data = new Array<number>(points.length * POINT_STRIDE)
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const o = i * POINT_STRIDE
    data[o] = p.x
    data[o + 1] = p.y
    data[o + 2] = p.pressure
    data[o + 3] = p.width
  }
  return data
}

/**
 * CSS px 的扁平点数据 → 归一化笔迹。
 * pageWidth / pageHeight 为采集时的书写区尺寸。
 */
export function normalizeStroke(
  data: number[],
  pageWidth: number,
  pageHeight: number,
  color: string,
  id: string = createId('stroke'),
): Stroke {
  const safeW = pageWidth > 0 ? pageWidth : 1
  const safeH = pageHeight > 0 ? pageHeight : 1
  const points = new Array<number>(data.length)

  for (let i = 0; i < data.length; i += POINT_STRIDE) {
    points[i] = data[i] / safeW
    points[i + 1] = data[i + 1] / safeH
    points[i + 2] = data[i + 2]
    // 线宽按高度归一化
    points[i + 3] = data[i + 3] / safeH
  }

  return { id, color, points }
}

/** 归一化笔迹 → CSS px 扁平点数据，用于绘制 */
export function toPixelData(stroke: Stroke, pageWidth: number, pageHeight: number): number[] {
  const data = stroke.points
  const out = new Array<number>(data.length)

  for (let i = 0; i < data.length; i += POINT_STRIDE) {
    out[i] = data[i] * pageWidth
    out[i + 1] = data[i + 1] * pageHeight
    out[i + 2] = data[i + 2]
    out[i + 3] = data[i + 3] * pageHeight
  }

  return out
}

/** 笔迹包围盒（归一化坐标），用于擦除命中剪枝 */
export function strokeBounds(stroke: Stroke): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const data = stroke.points
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let i = 0; i < data.length; i += POINT_STRIDE) {
    const x = data[i]
    const y = data[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return { minX, minY, maxX, maxY }
}
