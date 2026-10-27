import { describe, expect, it } from 'vitest'
import {
  paintCurve,
  paintDot,
  paintHead,
  paintStroke,
  paintTail,
} from '@/core/engine/StrokePainter'

/** 只记录绘制指令的假上下文，用来验证几何管线而不依赖真实 Canvas */
class StubContext {
  lineWidth = 1
  strokeStyle = ''
  fillStyle = ''
  lineCap = ''
  lineJoin = ''

  moveToCount = 0
  lineToCount = 0
  quadCount = 0
  strokeCount = 0
  fillCount = 0
  strokeWidths: number[] = []
  arcRadii: number[] = []

  beginPath(): void {}
  moveTo(): void {
    this.moveToCount += 1
  }
  lineTo(): void {
    this.lineToCount += 1
  }
  quadraticCurveTo(): void {
    this.quadCount += 1
  }
  arc(_x: number, _y: number, radius: number): void {
    this.arcRadii.push(radius)
  }
  stroke(): void {
    this.strokeCount += 1
    this.strokeWidths.push(this.lineWidth)
  }
  fill(): void {
    this.fillCount += 1
  }
}

function createContext(): { stub: StubContext; ctx: CanvasRenderingContext2D } {
  const stub = new StubContext()
  return { stub, ctx: stub as unknown as CanvasRenderingContext2D }
}

/** [x, y, pressure, width] 逐点展开 */
function data(points: [number, number, number][]): number[] {
  const flat: number[] = []
  for (const [x, y, width] of points) flat.push(x, y, 0.5, width)
  return flat
}

describe('paintDot', () => {
  it('半径取线宽的一半', () => {
    const { stub, ctx } = createContext()
    paintDot(ctx, 10, 20, 6, '#000')
    expect(stub.arcRadii).toEqual([3])
    expect(stub.fillCount).toBe(1)
  })

  it('极细线宽仍保证可绘制的最小半径', () => {
    const { stub, ctx } = createContext()
    paintDot(ctx, 0, 0, 0, '#000')
    expect(stub.arcRadii[0]).toBeGreaterThan(0)
  })
})

describe('paintStroke 几何结构', () => {
  it('单点笔迹只画一个圆点', () => {
    const { stub, ctx } = createContext()
    paintStroke(ctx, data([[10, 10, 4]]), '#000')
    expect(stub.fillCount).toBe(1)
    expect(stub.strokeCount).toBe(0)
  })

  it('两点笔迹 = 起笔段 + 收笔段', () => {
    const { stub, ctx } = createContext()
    paintStroke(
      ctx,
      data([
        [0, 0, 3],
        [10, 0, 3],
      ]),
      '#000',
    )
    expect(stub.quadCount).toBe(0)
    expect(stub.strokeCount).toBe(2)
  })

  it('n 点笔迹 = 1 起笔 + (n-2) 曲线 + 1 收笔，共 n 次描边', () => {
    for (const n of [3, 5, 9]) {
      const points: [number, number, number][] = []
      for (let i = 0; i < n; i += 1) points.push([i * 8, i * 4, 3])

      const { stub, ctx } = createContext()
      paintStroke(ctx, data(points), '#000')

      expect(stub.quadCount).toBe(n - 2)
      // 每段单独描边才能逐段改线宽，因此描边次数等于点数
      expect(stub.strokeCount).toBe(n)
    }
  })

  it('每段使用该点的线宽（笔锋逐段生效）', () => {
    const { stub, ctx } = createContext()
    paintStroke(
      ctx,
      data([
        [0, 0, 2],
        [10, 0, 4],
        [20, 0, 6],
        [30, 0, 8],
      ]),
      '#000',
    )
    // 起笔用 p0、曲线 k=1 用 p1、曲线 k=2 用 p2、收笔用 p3
    expect(stub.strokeWidths).toEqual([2, 4, 6, 8])
  })

  it('空数据不产生任何绘制指令', () => {
    const { stub, ctx } = createContext()
    paintStroke(ctx, [], '#000')
    expect(stub.strokeCount).toBe(0)
    expect(stub.fillCount).toBe(0)
  })
})

describe('分段绘制可拼接为完整笔迹', () => {
  it('head + curves + tail 的调用次数与整笔重绘一致', () => {
    const points: [number, number, number][] = []
    for (let i = 0; i < 7; i += 1) points.push([i * 6, i * 3, 3])
    const flat = data(points)

    const whole = createContext()
    paintStroke(whole.ctx, flat, '#000')

    const piecewise = createContext()
    paintHead(piecewise.ctx, flat, '#000')
    for (let k = 1; k <= 5; k += 1) paintCurve(piecewise.ctx, flat, k, '#000')
    paintTail(piecewise.ctx, flat, '#000')

    expect(piecewise.stub.strokeCount).toBe(whole.stub.strokeCount)
    expect(piecewise.stub.quadCount).toBe(whole.stub.quadCount)
  })

  it('paintCurve 对越界索引安全返回', () => {
    const { stub, ctx } = createContext()
    const flat = data([
      [0, 0, 3],
      [10, 0, 3],
    ])
    paintCurve(ctx, flat, 0, '#000')
    paintCurve(ctx, flat, 5, '#000')
    expect(stub.strokeCount).toBe(0)
  })
})
