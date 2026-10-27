/**
 * 整笔擦除的命中检测。
 *
 * 先做包围盒剪枝（O(n) 但常数极小），再算点到折线的最短距离，
 * 取「最近且在容差内」的那一笔删除。容差按 CSS px 定义，与笔宽无关地保证手感一致。
 */

import { POINT_STRIDE, countPoints, type Stroke } from '@/core/stroke/StrokeModel'

export interface EraseQuery {
  /** CSS px */
  x: number
  y: number
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay)
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** 点到整条笔迹折线的最短距离（CSS px） */
export function distanceToStroke(
  stroke: Stroke,
  query: EraseQuery,
  pageWidth: number,
  pageHeight: number,
): number {
  const data = stroke.points
  const n = countPoints(data)
  if (n === 0) return Infinity

  const px = query.x
  const py = query.y
  let best = Infinity

  if (n === 1) {
    return Math.hypot(px - data[0] * pageWidth, py - data[1] * pageHeight)
  }

  for (let i = 1; i < n; i += 1) {
    const prev = (i - 1) * POINT_STRIDE
    const curr = i * POINT_STRIDE
    const d = distanceToSegment(
      px,
      py,
      data[prev] * pageWidth,
      data[prev + 1] * pageHeight,
      data[curr] * pageWidth,
      data[curr + 1] * pageHeight,
    )
    if (d < best) best = d
    if (best === 0) break
  }

  return best
}

/**
 * 返回被命中的笔迹下标；未命中返回 -1。
 * 同时命中多笔时取距离最近的一笔（PRD F4.2）。
 */
export function findStrokeAt(
  strokes: Stroke[],
  query: EraseQuery,
  pageWidth: number,
  pageHeight: number,
  tolerance: number,
): number {
  const safeW = pageWidth > 0 ? pageWidth : 1
  const safeH = pageHeight > 0 ? pageHeight : 1
  const nx = query.x / safeW
  const ny = query.y / safeH
  const tolX = tolerance / safeW
  const tolY = tolerance / safeH

  let bestIndex = -1
  let bestDistance = Infinity

  for (let i = 0; i < strokes.length; i += 1) {
    const stroke = strokes[i]
    const data = stroke.points
    const n = countPoints(data)
    if (n === 0) continue

    // 包围盒剪枝（归一化空间）
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let j = 0; j < data.length; j += POINT_STRIDE) {
      const x = data[j]
      const y = data[j + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    if (nx < minX - tolX || nx > maxX + tolX || ny < minY - tolY || ny > maxY + tolY) continue

    const distance = distanceToStroke(stroke, query, pageWidth, pageHeight)
    if (distance <= tolerance && distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }

  return bestIndex
}
