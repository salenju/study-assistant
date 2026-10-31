import { describe, expect, it } from 'vitest'
import {
  COPYBOOK_FONT_SIZES,
  COPYBOOK_FONT_SIZE_SCALE,
  buildRowCells,
  expandRowsPerChar,
  MAX_CUSTOM_CHARS,
  MAX_ROWS_PER_CHAR,
  PINYIN_MAX_TOKEN,
  PINYIN_TRACE_COUNT,
  resolveFontSizeLayout,
  sanitizeCustomChars,
  sanitizePinyinChars,
  splitIntoPages,
  upgradePinyinRows,
} from '@/core/copybook/types'

describe('buildRowCells', () => {
  it('1 示范 + 2 描红 + 其余空白', () => {
    expect(buildRowCells(6)).toEqual(['demo', 'trace', 'trace', 'blank', 'blank', 'blank'])
  })

  it('拼音 1 示范 + 6 描红 + 其余空白', () => {
    expect(buildRowCells(10, PINYIN_TRACE_COUNT)).toEqual([
      'demo',
      'trace',
      'trace',
      'trace',
      'trace',
      'trace',
      'trace',
      'blank',
      'blank',
      'blank',
    ])
  })

  it('列数不足时按顺序截断，不补位', () => {
    expect(buildRowCells(1)).toEqual(['demo'])
    expect(buildRowCells(2)).toEqual(['demo', 'trace'])
    expect(buildRowCells(3)).toEqual(['demo', 'trace', 'trace'])
    expect(buildRowCells(4, PINYIN_TRACE_COUNT)).toEqual(['demo', 'trace', 'trace', 'trace'])
  })

  it('列数非法时至少给一个格子', () => {
    expect(buildRowCells(0)).toEqual(['demo'])
    expect(buildRowCells(-5)).toEqual(['demo'])
  })
})

describe('upgradePinyinRows', () => {
  it('把旧的 2 次描红升级到 6 次，且不修改入参', () => {
    const rows = [{ char: 'a', cells: buildRowCells(10) }]
    const next = upgradePinyinRows(rows, 10)

    expect(next?.[0].cells).toEqual(buildRowCells(10, PINYIN_TRACE_COUNT))
    expect(next?.[0].char).toBe('a')
    expect(rows[0].cells).toEqual(buildRowCells(10))
  })

  it('已符合当前规则时返回 null', () => {
    const rows = [{ char: 'a', cells: buildRowCells(10, PINYIN_TRACE_COUNT) }]
    expect(upgradePinyinRows(rows, 10)).toBeNull()
  })

  it('空行或非法列数不动数据', () => {
    expect(upgradePinyinRows([], 10)).toBeNull()
    expect(upgradePinyinRows([{ char: 'a', cells: ['demo'] }], 0)).toBeNull()
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

  it('拼音按 6 次描红切分', () => {
    const pages = splitIntoPages(['a'], 4, 10, PINYIN_TRACE_COUNT)
    expect(pages[0][0].cells).toEqual([
      'demo',
      'trace',
      'trace',
      'trace',
      'trace',
      'trace',
      'trace',
      'blank',
      'blank',
      'blank',
    ])
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

describe('sanitizePinyinChars', () => {
  it('空格与标点作分隔，字母连写算一项', () => {
    expect(sanitizePinyinChars(' b p，m f！zh  ch\tsh 123')).toEqual([
      'b',
      'p',
      'm',
      'f',
      'zh',
      'ch',
      'sh',
    ])
  })

  it('保留带调韵母与 ü', () => {
    expect(sanitizePinyinChars('ā á ǎ à ü ǖ')).toEqual(['ā', 'á', 'ǎ', 'à', 'ü', 'ǖ'])
  })

  it('汉字、数字与大小写以外的符号都当分隔符', () => {
    expect(sanitizePinyinChars('a春b1c。d')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('保留输入顺序与重复项', () => {
    expect(sanitizePinyinChars('ang ang ai')).toEqual(['ang', 'ang', 'ai'])
  })

  it('连写超过最长音节时截断', () => {
    expect(PINYIN_MAX_TOKEN).toBe(6)
    expect(sanitizePinyinChars('zhuangzhuang')).toEqual(['zhuang'])
  })

  it('超过上限时截断', () => {
    const items = sanitizePinyinChars('a '.repeat(MAX_CUSTOM_CHARS + 20))
    expect(items).toHaveLength(MAX_CUSTOM_CHARS)
  })

  it('没有拼音字母时返回空数组', () => {
    expect(sanitizePinyinChars('春 风 123，。！')).toEqual([])
  })

  it('大写字母同样保留', () => {
    expect(sanitizePinyinChars('A B C')).toEqual(['A', 'B', 'C'])
  })
})

describe('resolveFontSizeLayout', () => {
  it('标准字号不动布局参数', () => {
    expect(resolveFontSizeLayout('pinyin', 10, 'standard', 100)).toEqual({ cols: 10, pitch: 100 })
    expect(resolveFontSizeLayout('tianzi', 10, 'standard', 100)).toEqual({ cols: 10, pitch: 100 })
  })

  it('拼音放大只加行距，槽位数不变', () => {
    expect(resolveFontSizeLayout('pinyin', 10, 'large', 100)).toEqual({ cols: 10, pitch: 125 })
    expect(resolveFontSizeLayout('pinyin', 10, 'xlarge', 100)).toEqual({ cols: 10, pitch: 150 })
  })

  it('方格类放大只减少列数，行距不变', () => {
    expect(resolveFontSizeLayout('tianzi', 10, 'large', 100)).toEqual({ cols: 8, pitch: 100 })
    expect(resolveFontSizeLayout('mizige', 10, 'xlarge', 100)).toEqual({ cols: 7, pitch: 100 })
  })

  it('列数至少保留 1 列，非法档位按标准处理', () => {
    expect(resolveFontSizeLayout('tianzi', 1, 'xlarge', 100).cols).toBe(1)
    expect(resolveFontSizeLayout('tianzi', 10, 'huge' as never, 100)).toEqual({ cols: 10, pitch: 100 })
  })

  it('三档的放大倍数递增', () => {
    expect(COPYBOOK_FONT_SIZES.map((size) => COPYBOOK_FONT_SIZE_SCALE[size])).toEqual([1, 1.25, 1.5])
  })
})

describe('expandRowsPerChar', () => {
  it('每项连续展开成指定行数，顺序不变', () => {
    expect(expandRowsPerChar(['a', 'b'], 2)).toEqual(['a', 'a', 'b', 'b'])
  })

  it('1 行时与输入一致，且返回新数组', () => {
    const input = ['a', 'b']
    const rows = expandRowsPerChar(input, 1)
    expect(rows).toEqual(['a', 'b'])
    expect(rows).not.toBe(input)
  })

  it('非法行数按 1 行处理', () => {
    expect(expandRowsPerChar(['a'], 0)).toEqual(['a'])
    expect(expandRowsPerChar(['a'], -2)).toEqual(['a'])
    expect(expandRowsPerChar(['a'], Number.NaN)).toEqual(['a'])
  })

  it('超过上限按上限截断', () => {
    expect(expandRowsPerChar(['a'], MAX_ROWS_PER_CHAR + 5)).toHaveLength(MAX_ROWS_PER_CHAR)
  })
})
