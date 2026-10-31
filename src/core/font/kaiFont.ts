/**
 * 楷体子集加载（描红必须用楷体字形，默认黑体会教错笔形）。
 *
 * 字体为 LXGW WenKai 的子集（SIL OFL 1.1，见 public/fonts/OFL.txt），分两份：
 * - wenkai-subset.woff2：仅内置字库用到的字符，12KB 左右，启动即加载；
 * - wenkai-common.woff2：GB2312 一级常用字（3755 个），约 850KB，
 *   只有自定义描红出现子集外字符时才按需加载。
 *
 * 加载失败不阻塞应用：回退到系统楷体 / serif，并在控制台告警。
 * 字体异步生效，调用方必须在 Promise 完成后重绘画布。
 */

export const KAI_FONT_FAMILY = 'GridNotebookKai'
export const KAI_COMMON_FONT_FAMILY = 'GridNotebookKaiCommon'

/** 楷体优先，逐级回退；Android 上通常落到 serif（Noto Serif CJK） */
export const KAI_FONT_STACK =
  `'${KAI_FONT_FAMILY}', '${KAI_COMMON_FONT_FAMILY}', ` +
  `'Kaiti SC', 'STKaiti', 'KaiTi', 'Noto Serif CJK SC', serif`

let baseLoading: Promise<boolean> | null = null
let commonLoading: Promise<boolean> | null = null

export function loadKaiFont(): Promise<boolean> {
  if (!baseLoading) baseLoading = loadFace(KAI_FONT_FAMILY, 'wenkai-subset.woff2')
  return baseLoading
}

/** 常用字子集体积大，只在自定义内容超出内置字库时调用 */
export function loadKaiCommonFont(): Promise<boolean> {
  if (!commonLoading) commonLoading = loadFace(KAI_COMMON_FONT_FAMILY, 'wenkai-common.woff2')
  return commonLoading
}

async function loadFace(family: string, file: string): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return false
  }

  try {
    const url = `${import.meta.env.BASE_URL}fonts/${file}`
    const face = new FontFace(family, `url("${url}")`, { display: 'swap' })
    await face.load()
    document.fonts.add(face)
    return true
  } catch (error) {
    console.warn(`[grid-notebook] 楷体字体 ${file} 加载失败，描红字形回退到系统字体`, error)
    return false
  }
}
