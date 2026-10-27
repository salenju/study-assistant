import { describe, expect, it } from 'vitest'
import {
  POINT_STRIDE,
  countPoints,
  normalizeStroke,
  strokeBounds,
  toPixelData,
} from '@/core/stroke/StrokeModel'

const PAGE_W = 1000
const PAGE_H = 800

describe('StrokeModel', () => {
  it('countPoints 按步长 4 计算', () => {
    expect(countPoints([])).toBe(0)
    expect(countPoints([1, 2, 3])).toBe(0)
    expect(countPoints([1, 2, 3, 4])).toBe(1)
    expect(countPoints(new Array(POINT_STRIDE * 7).fill(0))).toBe(7)
  })

  it('归一化 → 像素 → 归一化 往返无损', () => {
    const pixelData = [100, 200, 0.5, 3, 350, 640, 0.2, 5.4]
    const stroke = normalizeStroke(pixelData, PAGE_W, PAGE_H, '#2b2b2b', 'fixed')

    expect(stroke.id).toBe('fixed')
    expect(stroke.color).toBe('#2b2b2b')
    expect(stroke.points[0]).toBeCloseTo(0.1, 10)
    expect(stroke.points[1]).toBeCloseTo(0.25, 10)
    expect(stroke.points[2]).toBe(0.5)
    // 线宽按页面高度归一化
    expect(stroke.points[3]).toBeCloseTo(3 / PAGE_H, 10)

    const restored = toPixelData(stroke, PAGE_W, PAGE_H)
    for (let i = 0; i < pixelData.length; i += 1) {
      expect(restored[i]).toBeCloseTo(pixelData[i], 8)
    }
  })

  it('不同页面尺寸下位置与粗细同比缩放', () => {
    const stroke = normalizeStroke([100, 200, 0.5, 3], PAGE_W, PAGE_H, '#000', 'a')
    const bigger = toPixelData(stroke, PAGE_W * 2, PAGE_H * 2)
    expect(bigger[0]).toBeCloseTo(200, 8)
    expect(bigger[1]).toBeCloseTo(400, 8)
    expect(bigger[3]).toBeCloseTo(6, 8)
  })

  it('页面尺寸为 0 时不产生 NaN', () => {
    const stroke = normalizeStroke([10, 20, 0.5, 3], 0, 0, '#000', 'a')
    for (const value of stroke.points) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('包围盒覆盖全部点', () => {
    const stroke = normalizeStroke(
      [100, 200, 0.5, 3, 500, 100, 0.5, 3, 300, 700, 0.5, 3],
      PAGE_W,
      PAGE_H,
      '#000',
      'a',
    )
    const bounds = strokeBounds(stroke)
    expect(bounds.minX).toBeCloseTo(0.1, 10)
    expect(bounds.maxX).toBeCloseTo(0.5, 10)
    expect(bounds.minY).toBeCloseTo(0.125, 10)
    expect(bounds.maxY).toBeCloseTo(0.875, 10)
  })
})
