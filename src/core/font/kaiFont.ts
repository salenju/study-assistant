/**
 * 楷体子集加载（描红必须用楷体字形，默认黑体会教错笔形）。
 *
 * 字体为 LXGW WenKai 的子集（SIL OFL 1.1，见 public/fonts/OFL.txt），
 * 只包含字库 JSON 里出现过的字符，体积 12KB 左右。
 * 加载失败不阻塞应用：回退到系统楷体 / serif，并在控制台告警。
 */

export const KAI_FONT_FAMILY = 'GridNotebookKai'

/** 楷体优先，逐级回退；Android 上通常落到 serif（Noto Serif CJK） */
export const KAI_FONT_STACK =
  `'${KAI_FONT_FAMILY}', 'Kaiti SC', 'STKaiti', 'KaiTi', 'Noto Serif CJK SC', serif`

let loading: Promise<boolean> | null = null

export function loadKaiFont(): Promise<boolean> {
  if (!loading) loading = load()
  return loading
}

async function load(): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return false
  }

  try {
    const url = `${import.meta.env.BASE_URL}fonts/wenkai-subset.woff2`
    const face = new FontFace(KAI_FONT_FAMILY, `url("${url}")`, { display: 'swap' })
    await face.load()
    document.fonts.add(face)
    return true
  } catch (error) {
    console.warn('[grid-notebook] 楷体子集加载失败，描红字形回退到系统字体', error)
    return false
  }
}
