/**
 * 画布合成：导出图片与缩略图共用同一套叠层逻辑。
 *
 * 三张画布（格子 / 已完成笔迹 / 当前笔画）尺寸一致，但后备存储是
 * CSS 尺寸 × dpr。合成时必须显式按 CSS 尺寸绘制，否则在高分屏上会只画出左上角一块。
 */

/** 导出图片长边上限（PRD F7.1） */
export const MAX_EXPORT_EDGE = 2400

/** 缩略图目标宽度（页列表用） */
export const THUMBNAIL_WIDTH = 240

export interface ComposeInput {
  layers: HTMLCanvasElement[]
  cssWidth: number
  cssHeight: number
  scale: number
}

export function resolveExportScale(cssWidth: number, cssHeight: number): number {
  const longest = Math.max(cssWidth, cssHeight)
  if (longest <= 0) return 1
  return Math.min(2, MAX_EXPORT_EDGE / longest)
}

export function composeCanvases({ layers, cssWidth, cssHeight, scale }: ComposeInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cssWidth * scale))
  canvas.height = Math.max(1, Math.round(cssHeight * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const layer of layers) {
    if (layer.width === 0 || layer.height === 0) continue
    ctx.drawImage(layer, 0, 0, cssWidth, cssHeight)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  return canvas
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('图片编码失败'))
      },
      type,
      quality,
    )
  })
}

/** 生成页列表缩略图（dataURL）；失败返回 undefined，不影响主流程 */
export function createThumbnail(
  layers: HTMLCanvasElement[],
  cssWidth: number,
  cssHeight: number,
): string | undefined {
  if (cssWidth < 1 || cssHeight < 1) return undefined

  const scale = THUMBNAIL_WIDTH / cssWidth
  const canvas = composeCanvases({ layers, cssWidth, cssHeight, scale })

  try {
    return canvas.toDataURL('image/webp', 0.7)
  } catch {
    try {
      return canvas.toDataURL('image/png')
    } catch {
      return undefined
    }
  }
}
