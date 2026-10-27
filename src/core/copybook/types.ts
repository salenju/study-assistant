/**
 * 描红字帖数据模型（PRD §5.3 / F8）。
 *
 * 字库是纯 JSON 配置，新增字库不需要改代码（见 lib/copybooks/index.ts）。
 * 每一行对应一个字，行内按角色排列：第 1 格示范、第 2–3 格描红、其余空白。
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

export interface CopybookSource {
  id: string
  name: string
  gridType: GridType
  /** 一行几个格子（四线三格为「槽位」数，不画竖线） */
  cols: number
  chars: string[]
}

/** 描红行的角色分布：1 示范 + 2 描红 + 其余空白 */
export function buildRowCells(cols: number): CellRole[] {
  const safeCols = Math.max(1, Math.round(cols))
  return Array.from({ length: safeCols }, (_, index) => {
    if (index === 0) return 'demo'
    if (index <= 2) return 'trace'
    return 'blank'
  })
}

/**
 * 把字库条目按每页行数切分成若干页（PRD F8.3）。
 * 顺序保持不变，保证同一个字库的练习顺序连续。
 */
export function splitIntoPages(chars: string[], rowsPerPage: number, cols: number): CopyRow[][] {
  const perPage = Math.max(1, Math.round(rowsPerPage))
  const cells = buildRowCells(cols)
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
