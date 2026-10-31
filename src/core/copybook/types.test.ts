import { describe, expect, it } from 'vitest'
import {
  buildRowCells,
  MAX_CUSTOM_CHARS,
  sanitizeCustomChars,
  splitIntoPages,
} from '@/core/copybook/types'

describe('buildRowCells', () => {
  it('1 示范 + 2 描红 + 其余空白', () => {
    expect(buildRowCells(6)).toEqual(['demo', 'trace', 'trace', 'blank', 'blank', 'blank'])
  })

  it('列数不足时按顺序截断，不补位', () => {
    expect(buildRowCells(1)).toEqual(['demo'])
    expect(buildRowCells(2)).toEqual(['demo', 'trace'])
    expect(buildRowCells(3)).toEqual(['demo', 'trace', 'trace'])
  })

  it('列数非法时至少给一个格子', () => {
    expect(buildRowCells(0)).toEqual(['demo'])
    expect(buildRowCells(-5)).toEqual(['demo'])
  })
})

describe('splitIntoPages', () => {
  it('按每页行数切分，顺序不变', () => {
    const pages = splitIntoPages(['一', '二', '三', '四', '五'], 2, 3)
    expect(pages).toHaveLength(3)
    expect(pages[0].map((r) => r.char)).toEqual(['一', '二'])
    expect(pages[1].map((r) => r.char)).toEqual(['三', '四'])
    expect(pages[2].map((r) => r.char)).toEqual(['五'])
  })

  it('每行都带上完整角色分布', () => {
    const pages = splitIntoPages(['一'], 4, 5)
    expect(pages[0][0].cells).toEqual(['demo', 'trace', 'trace', 'blank', 'blank'])
  })

  it('行与行之间不共享 cells 数组引用', () => {
    const pages = splitIntoPages(['一', '二'], 4, 4)
    expect(pages[0][0].cells).not.toBe(pages[0][1].cells)
  })

  it('恰好整除时不多出空页', () => {
    expect(splitIntoPages(['a', 'b', 'c', 'd'], 2, 3)).toHaveLength(2)
  })

  it('条目少于一行也至少生成一页', () => {
    expect(splitIntoPages(['a'], 6, 4)).toHaveLength(1)
  })

  it('空字库返回空数组', () => {
    expect(splitIntoPages([], 6, 4)).toEqual([])
  })
})

describe('sanitizeCustomChars', () => {
  it('只保留汉字，去掉空格、标点、字母和数字', () => {
    expect(sanitizeCustomChars(' 春 风，花。草！abc 123 ')).toEqual(['春', '风', '花', '草'])
  })

  it('保留输入顺序与重复字', () => {
    expect(sanitizeCustomChars('人人口')).toEqual(['人', '人', '口'])
  })

  it('超过上限时截断', () => {
    expect(sanitizeCustomChars('春'.repeat(MAX_CUSTOM_CHARS + 20))).toHaveLength(MAX_CUSTOM_CHARS)
  })

  it('没有汉字时返回空数组', () => {
    expect(sanitizeCustomChars('abc，。！123')).toEqual([])
  })

  it('扩展区汉字同样识别', () => {
    expect(sanitizeCustomChars('𠮷')).toEqual(['𠮷'])
  })
})
