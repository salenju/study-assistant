/**
 * 字库加载：`src/lib/copybooks/*.json` 下的每个文件都会被自动收录。
 *
 * 新增一个内置字帖只需要丢一个 JSON 进来，不需要改代码（PRD F8.1）。
 * 结构约定见 `CopybookSource`；不合法的文件会被忽略并在控制台告警，
 * 不能因为一个字库写错就让整个应用起不来。
 */

import { SQUARE_GRID_TYPES, type GridType } from '@/config/gridConfig'
import type { CopybookSource } from '@/core/copybook/types'

const modules = import.meta.glob<unknown>('./*.json', { eager: true, import: 'default' })

const GRID_TYPES: GridType[] = [...SQUARE_GRID_TYPES, 'pinyin']

function normalize(file: string, raw: unknown): CopybookSource | null {
  if (typeof raw !== 'object' || raw === null) {
    console.warn(`[grid-notebook] 字库格式不合法：${file}`)
    return null
  }

  const data = raw as Record<string, unknown>
  const id = data.id
  const name = data.name
  const gridType = data.gridType
  const cols = data.cols
  const chars = data.chars

  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof name !== 'string' || name.length === 0) return null
  if (typeof gridType !== 'string' || !GRID_TYPES.includes(gridType as GridType)) return null
  if (typeof cols !== 'number' || !Number.isFinite(cols) || cols < 1) return null
  if (!Array.isArray(chars) || chars.length === 0) return null

  const cleanChars = chars.filter((char): char is string => typeof char === 'string' && char.length > 0)
  if (cleanChars.length === 0) return null

  return {
    id,
    name,
    gridType: gridType as GridType,
    cols: Math.round(cols),
    chars: cleanChars,
  }
}

export const COPYBOOK_SOURCES: CopybookSource[] = Object.entries(modules)
  .map(([file, raw]) => normalize(file, raw))
  .filter((source): source is CopybookSource => source !== null)

export function getCopybookSource(id: string): CopybookSource | undefined {
  return COPYBOOK_SOURCES.find((source) => source.id === id)
}

/** 按格子类型筛选字帖：四线三格 → 拼音字帖，方格类 → 汉字字帖 */
export function listCopybookSources(kind: 'pinyin' | 'hanzi'): CopybookSource[] {
  return COPYBOOK_SOURCES.filter((source) =>
    kind === 'pinyin' ? source.gridType === 'pinyin' : source.gridType !== 'pinyin',
  )
}
