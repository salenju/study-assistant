import { describe, expect, it } from 'vitest'
import { createSnap, resolveLineWidth } from '@/utils/canvas'

const DPR_LIST = [1, 1.5, 2, 2.625, 3]

describe('resolveLineWidth', () => {
  it('把 1 CSS px 折算为物理像素整数倍', () => {
    expect(resolveLineWidth(1, 1)).toBe(1)
    expect(resolveLineWidth(1, 2)).toBe(1)
    // 1 × 1.5 = 1.5 → 取整 2 物理像素 → 2 / 1.5
    expect(resolveLineWidth(1, 1.5)).toBeCloseTo(2 / 1.5, 10)
    // 1 × 2.625 = 2.625 → 取整 3 物理像素 → 3 / 2.625
    expect(resolveLineWidth(1, 2.625)).toBeCloseTo(3 / 2.625, 10)
  })

  it('任何 dpr 下都至少 1 个物理像素', () => {
    for (const dpr of DPR_LIST) {
      expect(resolveLineWidth(1, dpr) * dpr).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('createSnap', () => {
  const SAMPLES = [0, 10, 10.3, 16, 99.7, 256.44, 511.51]

  it('吸附后的坐标落在物理像素栅格上（奇数线宽居中、偶数线宽对整）', () => {
    for (const dpr of DPR_LIST) {
      const snap = createSnap(dpr, 1)
      const physical = Math.max(1, Math.round(1 * dpr))
      const offset = physical % 2 === 1 ? 0.5 : 0

      for (const value of SAMPLES) {
        const snapped = snap(value) * dpr
        expect(Math.abs(snapped - offset - Math.round(snapped - offset))).toBeLessThan(1e-6)
      }
    }
  })

  it('吸附位移不超过 1 个物理像素', () => {
    for (const dpr of DPR_LIST) {
      const snap = createSnap(dpr, 1)
      for (const value of SAMPLES) {
        expect(Math.abs(snap(value) - value)).toBeLessThanOrEqual(1 / dpr + 1e-9)
      }
    }
  })

  it('幂等：重复吸附不再改变结果', () => {
    for (const dpr of DPR_LIST) {
      const snap = createSnap(dpr, 1)
      for (const value of SAMPLES) {
        const once = snap(value)
        expect(snap(once)).toBeCloseTo(once, 10)
      }
    }
  })
})
