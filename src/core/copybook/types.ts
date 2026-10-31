/**
 * 描红字帖数据模型（PRD §5.3 / F8）。
 *
 * 字库是纯 JSON 配置，新增字库不需要改代码（见 lib/copybooks/index.ts）。
 * 每一行对应一个字，行内按角色排列：第 1 格示范、随后若干格描红、其余空白。
 * 描红格数按格子类型区分：拼音要更多次重复，汉字保持 2 次。
 */

import type { GridType } from '@/config/gridConfig'

export type CellRole = 'demo' | 'trace' | 'blank'

export interface CopyRow {
  char: string
  /** 长度等于字库的 cols */
  cells: CellRole[]
}

export interface CopybookMeta {
  sourceId: string
  sourceName: string
  /** 本页承载的行（可能少于每页行数上限） */
  rows: CopyRow[]
}

/** 自定义字帖的固定标识；内置字库来自 lib/copybooks，不会占用这个 id */
export const CUSTOM_COPYBOOK_ID = 'custom'
export const CUSTOM_COPYBOOK_NAME = '自定义字帖'
/** 拼音版另起一个名字：标题前缀不同，页序号才不会和汉字自定义字帖串号 */
export const CUSTOM_PINYIN_COPYBOOK_NAME = '自定义拼音字帖'
/** 自定义字帖一行几格，与内置汉字字帖保持一致 */
export const CUSTOM_COPYBOOK_COLS = 10
/** 单次最多练多少字：再多会生成十几页，孩子也练不完 */
export const MAX_CUSTOM_CHARS = 80

const HAN_CHAR = /\p{Script=Han}/u

/**
 * 从自由输入里提取可描红的汉字：去掉空格、标点、字母和数字，保留原顺序与重复。
 * 超过上限直接截断，避免一次误粘贴生成几十页。
 */
export function sanitizeCustomChars(input: string): string[] {
  const chars: string[] = []

  for (const char of input) {
    if (!HAN_CHAR.test(char)) continue
    chars.push(char)
    if (chars.length >= MAX_CUSTOM_CHARS) break
  }

  return chars
}

/**
 * 拼音可描红字符：26 个字母、ü / ê，以及带调韵母（含 ń ǹ ḿ 这类叹词注音）。
 * 声调字母取自内置拼音字库，正好落在楷体子集里。
 */
const PINYIN_LETTERS = new Set(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZüÜêÊ' +
    'āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜńňǹḿ',
)

/** 单个描红项最多几个字母：zhuang / chuang / shuang 是最长的拼音音节 */
export const PINYIN_MAX_TOKEN = 6

/**
 * 从自由输入里提取拼音描红项：字母连写算一项（zh、ang、zhuang），
 * 空格、标点、数字、汉字都当分隔符，保留原顺序与重复。
 * 连写过长通常是漏了分隔符，截到最长音节长度，免得渲染成一串小字。
 */
export function sanitizePinyinChars(input: string): string[] {
  const items: string[] = []
  let token = ''

  const flush = (): void => {
    if (token.length === 0) return
    items.push(token.slice(0, PINYIN_MAX_TOKEN))
    token = ''
  }

  for (const char of input) {
    if (items.length >= MAX_CUSTOM_CHARS) break
    if (PINYIN_LETTERS.has(char)) {
      token += char
      continue
    }
    flush()
  }
  flush()

  return items.slice(0, MAX_CUSTOM_CHARS)
}

/** 同一个内容最多连续排几行：练一个字母留 1–3 行就够，再多只是堆页数 */
export const MAX_ROWS_PER_CHAR = 3

/**
 * 把每个内容连续展开成 n 行（同一字母连排几行方便多练几遍）。
 * n 非法（NaN、0、负数）按 1 行处理，超过上限按上限截断；返回新数组，不改入参。
 */
export function expandRowsPerChar(chars: string[], rowsPerChar = 1): string[] {
  const rounded = Number.isFinite(rowsPerChar) ? Math.round(rowsPerChar) : 1
  const rows = Math.min(MAX_ROWS_PER_CHAR, Math.max(1, rounded))
  if (rows === 1) return [...chars]
  return chars.flatMap((char) => Array.from({ length: rows }, () => char))
}

export interface CopybookSource {
  id: string
  name: string
  gridType: GridType
  /** 一行几个格子（四线三格为「槽位」数，不画竖线） */
  cols: number
  chars: string[]
}

/**
 * 字帖字号三档。
 *
 * 底字大小由格子几何决定，不能单独放大：
 * 汉字墨迹约占格边长 72%，拼音中格字母高度恒等于单格高 u。
 * 所以「字号大」= 格子更大、每页字更少；四线三格靠加大行距，方格类靠减少列数。
 */
export type CopybookFontSize = 'standard' | 'large' | 'xlarge'

export const COPYBOOK_FONT_SIZES: CopybookFontSize[] = ['standard', 'large', 'xlarge']

export const COPYBOOK_FONT_SIZE_LABELS: Record<CopybookFontSize, string> = {
  standard: '标准',
  large: '大',
  xlarge: '特大',
}

/** 字号档位对应的格子放大倍数 */
export const COPYBOOK_FONT_SIZE_SCALE: Record<CopybookFontSize, number> = {
  standard: 1,
  large: 1.25,
  xlarge: 1.5,
}

/**
 * 把字号档位换算成布局参数：
 * - 四线三格：列数（槽位）不动，放大目标行距 → 单格高 u 变大、每页行数变少
 * - 方格类：行距无意义，减少列数 → 格子边长变大
 * 未知档位按标准处理，保证老数据/脏数据不会算出 0 列。
 */
export function resolveFontSizeLayout(
  gridType: GridType,
  cols: number,
  fontSize: CopybookFontSize,
  pinyinPitch: number,
): { cols: number; pitch: number } {
  const scale = COPYBOOK_FONT_SIZE_SCALE[fontSize] ?? 1
  const safeCols = Math.max(1, Math.round(cols))

  if (gridType === 'pinyin') return { cols: safeCols, pitch: pinyinPitch * scale }
  return { cols: Math.max(1, Math.round(safeCols / scale)), pitch: pinyinPitch }
}

/** 汉字描红：1 示范 + 2 描红 + 其余空白 */
export const HANZI_TRACE_COUNT = 2

/** 拼音描红：1 示范 + 6 描红；一行 10 格时后面还剩 3 格可自由书写 */
export const PINYIN_TRACE_COUNT = 6

/** 描红行的角色分布：1 示范 + traceCount 个描红 + 其余空白 */
export function buildRowCells(cols: number, traceCount = HANZI_TRACE_COUNT): CellRole[] {
  const safeCols = Math.max(1, Math.round(cols))
  const traceEnd = Math.max(0, Math.round(traceCount))
  return Array.from({ length: safeCols }, (_, index) => {
    if (index === 0) return 'demo'
    if (index <= traceEnd) return 'trace'
    return 'blank'
  })
}

/**
 * 把旧版拼音字帖行升级到当前的描红次数。
 * 返回新版行数组；已符合规则时返回 null，调用方据此决定是否写回。
 */
export function upgradePinyinRows(rows: CopyRow[], cols: number): CopyRow[] | null {
  if (!Number.isFinite(cols) || cols < 1 || rows.length === 0) return null

  const expected = buildRowCells(cols, PINYIN_TRACE_COUNT)
  let changed = false

  const next = rows.map((row) => {
    const same =
      row.cells.length === expected.length && row.cells.every((role, index) => role === expected[index])
    if (same) return row
    changed = true
    return { char: row.char, cells: [...expected] }
  })

  return changed ? next : null
}

/**
 * 把字库条目按每页行数切分成若干页（PRD F8.3）。
 * 顺序保持不变，保证同一个字库的练习顺序连续。
 */
export function splitIntoPages(
  chars: string[],
  rowsPerPage: number,
  cols: number,
  traceCount = HANZI_TRACE_COUNT,
): CopyRow[][] {
  const perPage = Math.max(1, Math.round(rowsPerPage))
  const cells = buildRowCells(cols, traceCount)
  const pages: CopyRow[][] = []

  for (let start = 0; start < chars.length; start += perPage) {
    pages.push(
      chars.slice(start, start + perPage).map((char) => ({
        char,
        cells: [...cells],
      })),
    )
  }

  return pages
}
