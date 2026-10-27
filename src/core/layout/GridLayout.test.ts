import { describe, expect, it } from 'vitest'
import { cellRectAt, computeLayout, stripLineYs, totalCells } from '@/core/layout/GridLayout'
import { GRID_METRICS } from '@/config/gridConfig'

const EPS = 1e-6
const MARGIN = GRID_METRICS.margin

/** 覆盖 PRD 7.3 真机矩阵的常见书写区尺寸 */
const VIEWPORTS = [
  { name: '8 寸竖屏', width: 480, height: 940 },
  { name: '8 寸横屏', width: 940, height: 480 },
  { name: '11 寸竖屏', width: 800, height: 1180 },
  { name: '11 寸横屏', width: 1180, height: 800 },
  { name: '13 寸竖屏', width: 1000, height: 1480 },
  { name: '13 寸横屏', width: 1480, height: 1000 },
]

describe('computeLayout / 田字格', () => {
  for (const viewport of VIEWPORTS) {
    describe(viewport.name, () => {
      const layout = computeLayout({ ...viewport, type: 'tianzi' })
      const availWidth = viewport.width - MARGIN * 2
      const availHeight = viewport.height - MARGIN * 2

      it('格子为正方形', () => {
        const rect = cellRectAt(layout, 0, 0)
        const next = cellRectAt(layout, 1, 1)
        expect(rect.size).toBeCloseTo(layout.cellSize, 6)
        expect(next.x - rect.x).toBeCloseTo(rect.size, 6)
        expect(next.y - rect.y).toBeCloseTo(rect.size, 6)
      })

      it('横向铺满且不出现半格', () => {
        expect(layout.contentWidth).toBeCloseTo(availWidth, 6)
        expect(layout.contentWidth).toBeCloseTo(layout.cols * layout.cellSize, 6)
        expect(layout.originX).toBeCloseTo(MARGIN, 6)
      })

      it('内容不超出可用高度，且垂直居中', () => {
        expect(layout.contentHeight).toBeLessThanOrEqual(availHeight + EPS)
        expect(layout.contentHeight).toBeCloseTo(layout.rows * layout.cellSize, 6)
        expect(layout.originY - MARGIN).toBeCloseTo((availHeight - layout.contentHeight) / 2, 6)
      })

      it('列数在 [minCols, maxCols] 内，行数至少 1', () => {
        expect(layout.cols).toBeGreaterThanOrEqual(GRID_METRICS.minCols)
        expect(layout.cols).toBeLessThanOrEqual(GRID_METRICS.maxCols)
        expect(layout.rows).toBeGreaterThanOrEqual(1)
      })

      it('所有单元格完整落在视口内', () => {
        const last = cellRectAt(layout, layout.cols - 1, layout.rows - 1)
        expect(last.x + last.size).toBeLessThanOrEqual(viewport.width + EPS)
        expect(last.y + last.size).toBeLessThanOrEqual(viewport.height + EPS)
      })

      it('横竖屏切换后坐标不出现负值', () => {
        expect(layout.originX).toBeGreaterThanOrEqual(0)
        expect(layout.originY).toBeGreaterThanOrEqual(0)
      })

      it('格数为 cols × rows', () => {
        expect(totalCells(layout)).toBe(layout.cols * layout.rows)
      })
    })
  }

  it('19:9 超宽屏不会因为列数被钳制而溢出', () => {
    const layout = computeLayout({ width: 2000, height: 620, type: 'tianzi' })
    expect(layout.cols).toBe(GRID_METRICS.maxCols)
    expect(layout.contentWidth).toBeCloseTo(2000 - MARGIN * 2, 6)
    expect(layout.contentHeight).toBeLessThanOrEqual(620 - MARGIN * 2 + EPS)
  })

  it('极小视口不抛错，且行数至少 1', () => {
    const layout = computeLayout({ width: 40, height: 40, type: 'tianzi' })
    expect(layout.rows).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(layout.cellSize)).toBe(true)
    expect(layout.cellSize).toBeGreaterThan(0)
  })

  it('尺寸为 0 或负数时退化为安全值', () => {
    const layout = computeLayout({ width: 0, height: -100, type: 'tianzi' })
    expect(layout.viewportWidth).toBe(1)
    expect(layout.viewportHeight).toBe(1)
    expect(Number.isFinite(layout.cellSize)).toBe(true)
  })

  it('固定列数优先于自适应（字帖页）', () => {
    const layout = computeLayout({ width: 1180, height: 800, type: 'tianzi', cols: 6 })
    expect(layout.cols).toBe(6)
    expect(layout.cellSize).toBeCloseTo((1180 - MARGIN * 2) / 6, 6)
  })

  it('结果与 devicePixelRatio 无关（布局只算 CSS px）', () => {
    const a = computeLayout({ width: 1180, height: 800, type: 'tianzi' })
    const b = computeLayout({ width: 1180, height: 800, type: 'tianzi' })
    expect(a).toEqual(b)
  })
})

describe('computeLayout / 米字格', () => {
  for (const viewport of VIEWPORTS) {
    it(`${viewport.name}：几何与田字格完全一致`, () => {
      const mizige = computeLayout({ ...viewport, type: 'mizige' })
      const tianzi = computeLayout({ ...viewport, type: 'tianzi' })

      expect(mizige.type).toBe('mizige')
      expect(mizige.cols).toBe(tianzi.cols)
      expect(mizige.rows).toBe(tianzi.rows)
      expect(mizige.cellSize).toBeCloseTo(tianzi.cellSize, 10)
      expect(mizige.rowPitch).toBeCloseTo(tianzi.rowPitch, 10)
      expect(mizige.originX).toBeCloseTo(tianzi.originX, 10)
      expect(mizige.originY).toBeCloseTo(tianzi.originY, 10)
      expect(mizige.contentWidth).toBeCloseTo(tianzi.contentWidth, 10)
      expect(mizige.contentHeight).toBeCloseTo(tianzi.contentHeight, 10)
    })
  }

  it('格子为正方形且无半格', () => {
    const layout = computeLayout({ width: 1180, height: 800, type: 'mizige' })
    const rect = cellRectAt(layout, 0, 0)
    const next = cellRectAt(layout, 1, 1)
    expect(next.x - rect.x).toBeCloseTo(rect.size, 6)
    expect(next.y - rect.y).toBeCloseTo(rect.size, 6)
    expect(layout.contentWidth).toBeCloseTo(layout.cols * layout.cellSize, 6)
  })

  it('支持固定列数（字帖页）', () => {
    const layout = computeLayout({ width: 1180, height: 800, type: 'mizige', cols: 6 })
    expect(layout.cols).toBe(6)
    expect(layout.cellSize).toBeCloseTo((1180 - MARGIN * 2) / 6, 6)
  })

  it('总格数按方格计算，与四线三格区分', () => {
    const layout = computeLayout({ width: 1180, height: 800, type: 'mizige' })
    expect(totalCells(layout)).toBe(layout.cols * layout.rows)
  })
})

describe('computeLayout / 字帖固定行列', () => {
  it('方格类：格子取宽高都能放下的最小边长，整体居中', () => {
    const layout = computeLayout({ width: 1180, height: 668, type: 'tianzi', cols: 10, rows: 3 })
    const availW = 1180 - MARGIN * 2
    const availH = 668 - MARGIN * 2
    expect(layout.cols).toBe(10)
    expect(layout.rows).toBe(3)
    expect(layout.cellSize).toBeCloseTo(Math.min(availW / 10, availH / 3), 6)
    expect(layout.contentWidth).toBeCloseTo(layout.cols * layout.cellSize, 6)
    expect(layout.contentHeight).toBeCloseTo(layout.rows * layout.cellSize, 6)
    expect(layout.originX - MARGIN).toBeCloseTo((availW - layout.contentWidth) / 2, 6)
    expect(layout.originY - MARGIN).toBeCloseTo((availH - layout.contentHeight) / 2, 6)
  })

  it('方格类：固定行数不会超出行数上限而溢出', () => {
    const layout = computeLayout({ width: 1180, height: 668, type: 'mizige', cols: 10, rows: 6 })
    expect(layout.contentHeight).toBeLessThanOrEqual(668 + EPS)
    expect(layout.originY).toBeGreaterThanOrEqual(0)
  })

  it('四线三格：行数是硬约束，所有行都放得下', () => {
    const layout = computeLayout({ width: 1180, height: 668, type: 'pinyin', cols: 8, rows: 5 })
    expect(layout.rows).toBe(5)
    expect(layout.rowPitch).toBeCloseTo(layout.cellSize * 4, 6)
    const availH = 668 - MARGIN * 2
    expect(layout.contentHeight).toBeLessThanOrEqual(availH + EPS)
  })

  it('四线三格：固定行数时不受单格高上下限约束', () => {
    const many = computeLayout({ width: 1180, height: 668, type: 'pinyin', cols: 8, rows: 12 })
    expect(many.rows).toBe(12)
    expect(many.cellSize).toBeLessThan(GRID_METRICS.pinyinMinUnit)
  })

  it('不传 rows 时仍按视口自适应', () => {
    const auto = computeLayout({ width: 1180, height: 668, type: 'tianzi', cols: 10 })
    expect(auto.rows).toBeGreaterThan(1)
    expect(auto.contentWidth).toBeCloseTo(1180 - MARGIN * 2, 6)
  })
})

describe('computeLayout / 四线三格', () => {
  for (const viewport of VIEWPORTS) {
    describe(viewport.name, () => {
      const layout = computeLayout({ ...viewport, type: 'pinyin' })
      const availHeight = viewport.height - MARGIN * 2

      it('单格高 u 在允许范围内', () => {
        expect(layout.cellSize).toBeGreaterThanOrEqual(GRID_METRICS.pinyinMinUnit)
        expect(layout.cellSize).toBeLessThanOrEqual(GRID_METRICS.pinyinMaxUnit)
      })

      it('行距 = 4u（3u 条带 + 1u 间距）', () => {
        expect(layout.rowPitch).toBeCloseTo(layout.cellSize * 4, 6)
      })

      it('四线等距，间距等于 u', () => {
        for (let row = 0; row < layout.rows; row += 1) {
          const [y1, y2, y3, y4] = stripLineYs(layout, row)
          expect(y2 - y1).toBeCloseTo(layout.cellSize, 6)
          expect(y3 - y2).toBeCloseTo(layout.cellSize, 6)
          expect(y4 - y3).toBeCloseTo(layout.cellSize, 6)
        }
      })

      it('相邻行的条带不重叠（本行下线 < 下一行上线）', () => {
        for (let row = 0; row < layout.rows - 1; row += 1) {
          const [, , , bottom] = stripLineYs(layout, row)
          const [nextTop] = stripLineYs(layout, row + 1)
          expect(bottom).toBeLessThan(nextTop)
        }
      })

      it('内容不超出可用高度，最后一行不含行间距', () => {
        expect(layout.contentHeight).toBeLessThanOrEqual(availHeight + EPS)
        expect(layout.contentHeight).toBeCloseTo(
          (layout.rows - 1) * layout.rowPitch + layout.cellSize * 3,
          6,
        )
      })

      it('横向贯通整个可用宽度', () => {
        expect(layout.originX).toBeCloseTo(MARGIN, 6)
        expect(layout.contentWidth).toBeCloseTo(viewport.width - MARGIN * 2, 6)
      })

      it('行数至少 1', () => {
        expect(layout.rows).toBeGreaterThanOrEqual(1)
      })

      it('高度利用率不低于 90%（页面下方不留大块空白）', () => {
        expect(layout.contentHeight / availHeight).toBeGreaterThanOrEqual(0.9)
      })
    })
  }

  it('单格高由页面高度驱动，且被上限钳制', () => {
    const short = computeLayout({ width: 1180, height: 800, type: 'pinyin' })
    const tall = computeLayout({ width: 1180, height: 1480, type: 'pinyin' })
    expect(tall.cellSize).toBeGreaterThanOrEqual(short.cellSize)
    expect(tall.cellSize).toBeLessThanOrEqual(GRID_METRICS.pinyinMaxUnit)
  })

  it('行数统计返回行数而非格数', () => {
    const layout = computeLayout({ width: 1180, height: 800, type: 'pinyin' })
    expect(totalCells(layout)).toBe(layout.rows)
  })
})
