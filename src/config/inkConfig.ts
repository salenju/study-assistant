/**
 * 书写颜色预设。
 *
 * Canvas 不读 CSS 变量，笔迹颜色必须在引擎里显式设置；
 * 这里同时供设置面板选色、启动时校验已保存的颜色（脏数据回落到默认墨色）。
 */

export interface InkColorOption {
  /** 存进页面设置的十六进制色值 */
  value: string
  label: string
}

/** 四档都是适合写在暖色纸上的深色，饱和但不刺眼 */
export const INK_COLORS: InkColorOption[] = [
  { value: '#2b2b2b', label: '墨黑' },
  { value: '#2f4a72', label: '蓝黑' },
  { value: '#2f5d4a', label: '墨绿' },
  { value: '#a4402f', label: '朱红' },
]

export const DEFAULT_INK_COLOR = INK_COLORS[0].value

/** 仅接受预设内的色值，其余（含 undefined）一律回落默认色 */
export function resolveInkColor(value: unknown): string {
  return typeof value === 'string' && INK_COLORS.some((option) => option.value === value)
    ? value
    : DEFAULT_INK_COLOR
}
