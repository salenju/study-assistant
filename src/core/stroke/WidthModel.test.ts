import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDTH_PARAMS, WidthTracker, detectPressure } from '@/core/stroke/WidthModel'

const P = DEFAULT_WIDTH_PARAMS

describe('WidthTracker / 压感模式', () => {
  it('压感 0 → 最细，压感 1 → 最粗', () => {
    const tracker = new WidthTracker(P)
    expect(tracker.next(10, 10, 0, 'pressure')).toBeCloseTo(P.min, 6)
    expect(tracker.next(10, 10, 1, 'pressure')).toBeCloseTo(P.max, 6)
    expect(tracker.next(10, 10, 0.5, 'pressure')).toBeCloseTo((P.min + P.max) / 2, 6)
  })

  it('压感超出 0–1 时被夹紧', () => {
    const tracker = new WidthTracker(P)
    expect(tracker.next(1, 10, -3, 'pressure')).toBeCloseTo(P.min, 6)
    expect(tracker.next(1, 10, 8, 'pressure')).toBeCloseTo(P.max, 6)
  })
})

describe('WidthTracker / 速度模式', () => {
  it('慢写变粗、快写变细', () => {
    const slow = new WidthTracker(P)
    const slowWidth = slow.next(0.2, 10, 0.5, 'speed')

    const fast = new WidthTracker(P)
    let fastWidth = 0
    for (let i = 0; i < 30; i += 1) {
      fastWidth = fast.next(50, 10, 0.5, 'speed')
    }

    expect(slowWidth).toBeGreaterThan(fastWidth)
  })

  it('足够慢时触及最粗上限', () => {
    const tracker = new WidthTracker(P)
    let width = 0
    for (let i = 0; i < 20; i += 1) {
      width = tracker.next(0.1, 10, 0.5, 'speed')
    }
    expect(width).toBeCloseTo(P.max, 2)
  })

  it('足够快时触及最细下限', () => {
    const tracker = new WidthTracker(P)
    let width = 0
    for (let i = 0; i < 40; i += 1) {
      width = tracker.next(80, 10, 0.5, 'speed')
    }
    expect(width).toBeCloseTo(P.min, 2)
  })

  it('相同输入序列产生完全相同的线宽（可重放）', () => {
    const a = new WidthTracker(P)
    const b = new WidthTracker(P)
    for (let i = 0; i < 25; i += 1) {
      expect(a.next(i % 7 + 1, 8, 0.5, 'speed')).toBe(b.next(i % 7 + 1, 8, 0.5, 'speed'))
    }
  })

  it('线宽始终落在 [min, max] 内', () => {
    const tracker = new WidthTracker(P)
    const speeds = [0, 0.01, 0.5, 3, 40, 999]
    for (const distance of speeds) {
      const width = tracker.next(distance, 10, 0.5, 'speed')
      expect(width).toBeGreaterThanOrEqual(P.min - 1e-9)
      expect(width).toBeLessThanOrEqual(P.max + 1e-9)
    }
  })

  it('dt 为 0 时不产生 Infinity', () => {
    const tracker = new WidthTracker(P)
    const width = tracker.next(10, 0, 0.5, 'speed')
    expect(Number.isFinite(width)).toBe(true)
  })
})

describe('detectPressure', () => {
  it('恒定 0.5 判定为无压感', () => {
    expect(detectPressure(new Array(20).fill(0.5))).toBe(false)
  })

  it('存在明显变化判定为有压感', () => {
    expect(detectPressure([0.2, 0.35, 0.5, 0.62, 0.48, 0.7, 0.31, 0.55])).toBe(true)
  })

  it('样本过少时保守判定为无压感', () => {
    expect(detectPressure([0.1, 0.9])).toBe(false)
    expect(detectPressure([])).toBe(false)
  })
})
