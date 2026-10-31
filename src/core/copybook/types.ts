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

export interface CopybookSource {
  id: string
  name: string
  gridType: GridType
  /** 一行几个格子（四线三格为「槽位」数，不画竖线） */
  cols: number
  chars: string[]
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
