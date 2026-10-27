/**
 * 线宽模型：速度 / 压感 → 笔迹粗细（笔锋）。
 *
 * 设计要点：
 * - 慢写变粗、快写变细，模拟真实运笔；
 * - 速度做指数平滑（EMA），避免相邻线段宽度跳变导致「锯齿状粗细」；
 * - 有真实压感时压感优先，无压感设备（部分是假压感，恒为 0.5）自动回退速度模型。
 */

export type WidthMode = 'speed' | 'pressure'

export interface WidthParams {
  /** 最细（快写）线宽，CSS px */
  min: number
  /** 最粗（慢写）线宽，CSS px */
  max: number
  /** 速度低于此值时取最粗，CSS px / ms */
  minSpeed: number
  /** 速度高于此值时取最细，CSS px / ms */
  maxSpeed: number
  /** 速度平滑系数，越大越跟手、越小越平滑 */
  alpha: number
}

export const DEFAULT_WIDTH_PARAMS: WidthParams = {
  min: 2.4,
  max: 6,
  minSpeed: 0.15,
  maxSpeed: 2.5,
  alpha: 0.3,
}

/** 笔宽三档（PRD F10） */
export type PenWidth = 'thin' | 'medium' | 'thick'

export const PEN_WIDTH_LABELS: Record<PenWidth, string> = {
  thin: '细',
  medium: '中',
  thick: '粗',
}

/** 三档只改线宽上下限，速度阈值与平滑系数保持一致，避免手感突变 */
export const PEN_WIDTH_PRESETS: Record<PenWidth, WidthParams> = {
  thin: { ...DEFAULT_WIDTH_PARAMS, min: 1.7, max: 4.2 },
  medium: { ...DEFAULT_WIDTH_PARAMS },
  thick: { ...DEFAULT_WIDTH_PARAMS, min: 3.2, max: 8 },
}

/** 压感方差低于此值即判定为「假压感」 */
const PRESSURE_VARIANCE_EPS = 0.02

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * 速度跟踪器：每笔一个实例，保证同一组输入必然得到同一组线宽。
 */
export class WidthTracker {
  private ema = -1

  constructor(private readonly params: WidthParams = DEFAULT_WIDTH_PARAMS) {}

  /**
   * @param distance 本段位移（CSS px）
   * @param dt       本段时间（ms）
   * @param pressure 原始压感 0–1
   * @param mode     宽度来源
   */
  next(distance: number, dt: number, pressure: number, mode: WidthMode): number {
    const { min, max, minSpeed, maxSpeed, alpha } = this.params

    if (mode === 'pressure') {
      return clamp(min + (max - min) * pressure, min, max)
    }

    const speed = distance / Math.max(dt, 0.5)
    this.ema = this.ema < 0 ? speed : this.ema + (speed - this.ema) * alpha
    const normalized = clamp((this.ema - minSpeed) / (maxSpeed - minSpeed), 0, 1)
    // 慢 → 粗；快 → 细
    return max - (max - min) * normalized
  }
}

/**
 * 根据一段采样判断设备是否提供真实压感。
 * 安卓上部分主动笔恒返回 0.5，若不探测会得到一条死线宽的「铁丝」。
 */
export function detectPressure(samples: number[]): boolean {
  if (samples.length < 6) return false
  let min = Infinity
  let max = -Infinity
  for (const value of samples) {
    if (value < min) min = value
    if (value > max) max = value
  }
  return max - min > PRESSURE_VARIANCE_EPS
}
