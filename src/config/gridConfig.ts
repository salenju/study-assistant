/**
 * 格子渲染的全部可调参数集中在此。
 * 改颜色、改密度、改线宽只动这一个文件，不要在组件里散落魔法值。
 */

/**
 * 支持三种格子：
 * - tianzi  田字格：外框 + 十字中线
 * - mizige  米字格：外框 + 十字中线 + 两条对角线（几何与田字格完全相同）
 * - pinyin  四线三格：四条水平线
 */
export type GridType = 'tianzi' | 'mizige' | 'pinyin'

export const GRID_LABELS: Record<GridType, string> = {
  tianzi: '田字格',
  mizige: '米字格',
  pinyin: '四线三格',
}

/** 方格类格子（按正方形网格排布），四线三格不在此列 */
export const SQUARE_GRID_TYPES: GridType[] = ['tianzi', 'mizige']

export interface GridTheme {
  /** 纸张底色 */
  paper: string
  /** 普通线条（田字格外框、四线三格第 1/4 线） */
  line: string
  /** 弱线条（田字格十字中线、四线三格第 2 线） */
  lineSoft: string
  /** 四线三格基线（第 3 线），需明显深于其他线 */
  lineBaseline: string
  /** 线宽（CSS px），实际会吸附到物理像素整数倍 */
  lineWidthCss: number
  /** 虚线节奏（CSS px） */
  midDash: [number, number]
}

export const GRID_THEME: GridTheme = {
  paper: '#fdf6e3',
  line: '#dda9a7',
  lineSoft: '#e9c8c6',
  lineBaseline: '#c97c7c',
  lineWidthCss: 1,
  midDash: [4, 4],
}

export interface GridMetrics {
  /** 页面四周留白（CSS px） */
  margin: number
  /** 田字格期望边长，用于推算列数 */
  targetCell: number
  /** 自动布局的最小/最大列数 */
  minCols: number
  maxCols: number
  /** 四线三格期望行距（3u 条带 + 1u 间距），用于反解单格高 u */
  pinyinTargetPitch: number
  /** 四线三格单页行数的下限/上限 */
  pinyinMinRows: number
  pinyinMaxRows: number
  /** 四线三格单格高 u 的下限/上限（CSS px） */
  pinyinMinUnit: number
  pinyinMaxUnit: number
}

export const GRID_METRICS: GridMetrics = {
  margin: 16,
  targetCell: 96,
  minCols: 4,
  maxCols: 12,
  pinyinTargetPitch: 100,
  pinyinMinRows: 4,
  pinyinMaxRows: 12,
  pinyinMinUnit: 20,
  pinyinMaxUnit: 32,
}

/**
 * 描红底字样式。改字体必须重新校准 pinyinFontScale（见 TECH §7.3）。
 */
export const COPYBOOK_STYLE = {
  /**
   * 汉字底字字号 / 格边长。
   * 实测该字体「墨迹高度 ≈ 0.73em」，取 0.98 让墨迹约占格边长 72%，
   * 四周留白均匀且不触边（PRD F8.2 的验收口径是视觉占比，不是字号占比）。
   */
  hanziFontScale: 0.98,
  /**
   * 拼音底字字号 / 单格高 u。
   * 由字体度量反解：LXGW WenKai 的 sxHeight = 0.468em，
   * 要让小写字母的中格高度恰好等于 u，字号就必须取 u / 0.468 ≈ 2.14u。
   * 换字体后必须重新量 sxHeight。
   */
  pinyinFontScale: 2.14,
  /** 示范字透明度 */
  demoOpacity: 0.55,
  /** 描红字透明度 */
  traceOpacity: 0.15,
  /** 底字基色（RGB 分量），在暖色纸上比纯黑柔和 */
  baseColor: '60, 50, 45',
} as const
