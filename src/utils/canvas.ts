/**
 * Canvas 尺寸与像素对齐工具。
 *
 * 目标：在任意 devicePixelRatio（1 / 1.5 / 2 / 2.625 / 3）下，
 * 1px 级别的细线都能落在物理像素的中心，不出现灰边、不发粗。
 */

export interface CanvasSizing {
  /** CSS 宽（逻辑坐标） */
  width: number
  /** CSS 高（逻辑坐标） */
  height: number
  /** 物理像素宽 */
  pixelWidth: number
  /** 物理像素高 */
  pixelHeight: number
  /** 物理像素 / CSS 像素（横向） */
  scaleX: number
  /** 物理像素 / CSS 像素（纵向） */
  scaleY: number
  /** 本次是否改变了后备存储尺寸（改变会清空画布内容） */
  resized: boolean
}

/**
 * 同步 canvas 后备存储尺寸到 CSS 尺寸 × dpr。
 * 返回真实的缩放比：由于后备存储尺寸取整，scale 与 dpr 可能有极小偏差，
 * 绘制必须使用返回的 scale 才能保证像素对齐。
 */
export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): CanvasSizing {
  const width = Math.max(1, cssWidth)
  const height = Math.max(1, cssHeight)
  const pixelWidth = Math.max(1, Math.round(width * dpr))
  const pixelHeight = Math.max(1, Math.round(height * dpr))

  const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight
  if (resized) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  return {
    width,
    height,
    pixelWidth,
    pixelHeight,
    scaleX: pixelWidth / width,
    scaleY: pixelHeight / height,
    resized,
  }
}

/**
 * 把 CSS 线宽换算成「物理像素整数倍」的线宽。
 * 例如 dpr=2.625 时，1 CSS px 无法整像素落位，会被调整为 1.1428 CSS px（=3 物理像素）。
 */
export function resolveLineWidth(cssLineWidth: number, scale: number): number {
  const physical = Math.max(1, Math.round(cssLineWidth * scale))
  return physical / scale
}

/**
 * 生成坐标吸附函数：把任意坐标吸附到让线条中心落在物理像素中心的最近位置。
 *
 * - 物理线宽为奇数时，中心应落在整数 + 0.5 上；
 * - 物理线宽为偶数时，中心应落在整数上。
 */
export function createSnap(scale: number, cssLineWidth: number): (value: number) => number {
  const physical = Math.max(1, Math.round(cssLineWidth * scale))
  const offset = physical % 2 === 1 ? 0.5 : 0
  return (value: number) => (Math.round(value * scale - offset) + offset) / scale
}
