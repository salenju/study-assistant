import { describe, expect, it } from 'vitest'
import { distanceToStroke, findStrokeAt } from '@/core/hit/EraseHitTest'
import type { Stroke } from '@/core/stroke/StrokeModel'

const PAGE_W = 1000
const PAGE_H = 800
const TOL = 12

/** 构造一条归一化笔迹，坐标以 CSS px 给出，方便断言 */
function makeStroke(id: string, points: [number, number][]): Stroke {
  const flat: number[] = []
  for (const [x, y] of points) {
    flat.push(x / PAGE_W, y / PAGE_H, 0.5, 3 / PAGE_H)
  }
  return { id, color: '#2b2b2b', points: flat }
}

describe('distanceToStroke', () => {
  it('点到水平折线的最短距离', () => {
    const stroke = makeStroke('a', [
      [100, 400],
      [900, 400],
    ])
    expect(distanceToStroke(stroke, { x: 500, y: 400 }, PAGE_W, PAGE_H)).toBeCloseTo(0, 6)
    expect(distanceToStroke(stroke, { x: 500, y: 430 }, PAGE_W, PAGE_H)).toBeCloseTo(30, 6)
  })

  it('线段端点外侧按端点距离计算', () => {
    const stroke = makeStroke('a', [
      [100, 400],
      [200, 400],
    ])
    // 位于起点左侧 100px、同一水平线上
    expect(distanceToStroke(stroke, { x: 0, y: 400 }, PAGE_W, PAGE_H)).toBeCloseTo(100, 6)
  })

  it('单点笔迹退化为点距离', () => {
    const stroke = makeStroke('a', [[500, 400]])
    expect(distanceToStroke(stroke, { x: 500, y: 400 }, PAGE_W, PAGE_H)).toBeCloseTo(0, 6)
    expect(distanceToStroke(stroke, { x: 500, y: 300 }, PAGE_W, PAGE_H)).toBeCloseTo(100, 6)
  })

  it('空笔迹返回 Infinity', () => {
    const empty: Stroke = { id: 'e', color: '#000', points: [] }
    expect(distanceToStroke(empty, { x: 0, y: 0 }, PAGE_W, PAGE_H)).toBe(Infinity)
  })
})

describe('findStrokeAt', () => {
  const stroke = makeStroke('a', [
    [100, 400],
    [900, 400],
  ])

  it('容差内命中', () => {
    expect(findStrokeAt([stroke], { x: 500, y: 400 }, PAGE_W, PAGE_H, TOL)).toBe(0)
    expect(findStrokeAt([stroke], { x: 500, y: 411 }, PAGE_W, PAGE_H, TOL)).toBe(0)
  })

  it('容差外不命中', () => {
    expect(findStrokeAt([stroke], { x: 500, y: 420 }, PAGE_W, PAGE_H, TOL)).toBe(-1)
    expect(findStrokeAt([stroke], { x: 500, y: 500 }, PAGE_W, PAGE_H, TOL)).toBe(-1)
  })

  it('包围盒外但仍在容差内的点也能命中（剪枝不能剪过头）', () => {
    const single = makeStroke('s', [[500, 400]])
    expect(findStrokeAt([single], { x: 508, y: 400 }, PAGE_W, PAGE_H, TOL)).toBe(0)
    expect(findStrokeAt([single], { x: 500, y: 392 }, PAGE_W, PAGE_H, TOL)).toBe(0)
  })

  it('同时命中多笔时取最近的一笔', () => {
    const a = makeStroke('a', [
      [100, 400],
      [900, 400],
    ])
    const b = makeStroke('b', [
      [100, 408],
      [900, 408],
    ])
    // 距 a 5px、距 b 3px
    expect(findStrokeAt([a, b], { x: 500, y: 405 }, PAGE_W, PAGE_H, TOL)).toBe(1)
    // 距 a 3px、距 b 5px
    expect(findStrokeAt([a, b], { x: 500, y: 403 }, PAGE_W, PAGE_H, TOL)).toBe(0)
  })

  it('空列表返回 -1', () => {
    expect(findStrokeAt([], { x: 0, y: 0 }, PAGE_W, PAGE_H, TOL)).toBe(-1)
  })

  it('页面尺寸为 0 时不产生 NaN 或误命中', () => {
    expect(findStrokeAt([stroke], { x: 500, y: 400 }, 0, 0, TOL)).toBe(-1)
  })
})
