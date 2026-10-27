import { describe, expect, it } from 'vitest'
import type { CellRole } from '@/core/copybook/types'
import type { BackupEntry } from '@/utils/backup'
import { BackupError, buildBackup, parseBackup, serializeBackup } from '@/utils/backup'

function entry(id: string, points: number[] = [0.1, 0.2, 0.5, 0.004]): BackupEntry {
  return {
    meta: {
      id,
      createdAt: 1000,
      updatedAt: 2000,
      title: `田字格 ${id}`,
      gridType: 'tianzi',
      kind: 'blank',
      strokeCount: 1,
    },
    strokes: [{ id: `${id}-s1`, color: '#2b2b2b', points }],
  }
}

describe('buildBackup / serializeBackup', () => {
  it('写入应用标识与版本号', () => {
    const file = buildBackup([entry('a')], 12345)
    expect(file.app).toBe('grid-notebook')
    expect(file.schemaVersion).toBe(1)
    expect(file.exportedAt).toBe(12345)
    expect(file.pages).toHaveLength(1)
  })

  it('序列化后是可解析的 JSON', () => {
    const text = serializeBackup(buildBackup([entry('a')]))
    expect(() => JSON.parse(text)).not.toThrow()
  })
})

describe('parseBackup / 往返', () => {
  it('导出再导入内容一致', () => {
    const original = [entry('a'), entry('b', [0.3, 0.4, 0.6, 0.01, 0.5, 0.6, 0.4, 0.02])]
    const parsed = parseBackup(serializeBackup(buildBackup(original)))

    expect(parsed.skipped).toBe(0)
    expect(parsed.pages).toHaveLength(2)
    expect(parsed.pages[0].meta.title).toBe('田字格 a')
    expect(parsed.pages[1].strokes[0].points).toEqual([0.3, 0.4, 0.6, 0.01, 0.5, 0.6, 0.4, 0.02])
  })

  it('strokeCount 以实际笔迹数为准', () => {
    const parsed = parseBackup(serializeBackup(buildBackup([entry('a')])))
    expect(parsed.pages[0].meta.strokeCount).toBe(1)
  })

  it('解析结果是新的数组，不与原对象共享引用', () => {
    const source = entry('a')
    const parsed = parseBackup(serializeBackup(buildBackup([source])))
    parsed.pages[0].strokes[0].points[0] = 99
    expect(source.strokes[0].points[0]).not.toBe(99)
  })
})

describe('parseBackup / 文件级错误', () => {
  it('非 JSON 抛「文件无法解析」', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
    expect(() => parseBackup('not json')).toThrow('文件无法解析')
  })

  it('不是本应用备份时拒绝', () => {
    expect(() => parseBackup('{"app":"other","schemaVersion":1,"pages":[]}')).toThrow(
      '不是本应用的备份文件',
    )
  })

  it('版本高于当前时拒绝', () => {
    expect(() =>
      parseBackup('{"app":"grid-notebook","schemaVersion":9,"pages":[]}'),
    ).toThrow('备份来自更高版本')
  })

  it('缺少 pages 时拒绝', () => {
    expect(() => parseBackup('{"app":"grid-notebook","schemaVersion":1}')).toThrow('缺少页面数据')
  })

  it('全部页面损坏时拒绝，而不是静默导入 0 页', () => {
    const file = buildBackup([entry('a')])
    const broken = JSON.parse(serializeBackup(file))
    broken.pages[0].strokes = 'oops'
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('没有可导入的页面')
  })
})

describe('parseBackup / 单页容错', () => {
  it('损坏的页被跳过，其余页正常导入', () => {
    const file = buildBackup([entry('a'), entry('b'), entry('c')])
    const raw = JSON.parse(serializeBackup(file))
    raw.pages[1].meta.gridType = 'hexagon'
    raw.pages[2].strokes[0].points = [0.1, 0.2, 0.3]

    const parsed = parseBackup(JSON.stringify(raw))
    expect(parsed.pages).toHaveLength(1)
    expect(parsed.skipped).toBe(2)
    expect(parsed.pages[0].meta.id).toBe('a')
  })

  it('点数据含 NaN 时该页跳过', () => {
    const file = buildBackup([entry('a')])
    const raw = JSON.parse(serializeBackup(file))
    raw.pages[0].strokes[0].points = [0.1, null, 0.5, 0.004]
    const parsed = (() => {
      try {
        return parseBackup(JSON.stringify(raw))
      } catch {
        return null
      }
    })()
    // 只有一页且损坏 → 直接整体报错
    expect(parsed).toBeNull()
  })

  it('米字格页面可以正常导入', () => {
    const source = entry('m')
    source.meta.gridType = 'mizige'
    const parsed = parseBackup(serializeBackup(buildBackup([source])))
    expect(parsed.skipped).toBe(0)
    expect(parsed.pages[0].meta.gridType).toBe('mizige')
  })

  it('字帖页带描红内容时可正常往返', () => {
    const copybookEntry: BackupEntry = {
      meta: {
        id: 'cb',
        createdAt: 1,
        updatedAt: 2,
        title: '拼音字母表 1',
        gridType: 'pinyin',
        fixedCols: 8,
        fixedRows: 4,
        kind: 'copybook',
        strokeCount: 0,
        copybook: {
          sourceId: 'pinyin-letters',
          sourceName: '拼音字母表',
          rows: [
            { char: 'a', cells: ['demo', 'trace', 'trace', 'blank'] },
            { char: 'o', cells: ['demo', 'trace', 'trace', 'blank'] },
          ],
        },
      },
      strokes: [],
    }

    const parsed = parseBackup(serializeBackup(buildBackup([copybookEntry])))
    expect(parsed.skipped).toBe(0)
    expect(parsed.pages[0].meta.kind).toBe('copybook')
    expect(parsed.pages[0].meta.fixedRows).toBe(4)
    expect(parsed.pages[0].meta.copybook?.rows[1].char).toBe('o')
  })

  it('字帖页缺少描红内容时该页跳过', () => {
    const broken = JSON.parse(
      serializeBackup(
        buildBackup([
          {
            meta: {
              id: 'cb',
              createdAt: 1,
              updatedAt: 2,
              title: '拼音字母表 1',
              gridType: 'pinyin',
              kind: 'copybook',
              strokeCount: 0,
              copybook: {
                sourceId: 's',
                sourceName: 'S',
                rows: [{ char: 'a', cells: ['demo'] }],
              },
            },
            strokes: [],
          },
          entry('ok'),
        ]),
      ),
    )
    delete broken.pages[0].meta.copybook
    const parsed = parseBackup(JSON.stringify(broken))
    expect(parsed.pages).toHaveLength(1)
    expect(parsed.skipped).toBe(1)
  })

  it('字帖角色非法时该页跳过', () => {
    const broken = JSON.parse(
      serializeBackup(
        buildBackup([
          {
            meta: {
              id: 'cb',
              createdAt: 1,
              updatedAt: 2,
              title: 't',
              gridType: 'pinyin',
              kind: 'copybook',
              strokeCount: 0,
              copybook: {
                sourceId: 's',
                sourceName: 'S',
                rows: [{ char: 'a', cells: ['demo', 'ghost'] as unknown as CellRole[] }],
              },
            },
            strokes: [],
          },
          entry('ok'),
        ]),
      ),
    )
    const parsed = parseBackup(JSON.stringify(broken))
    expect(parsed.skipped).toBe(1)
    expect(parsed.pages[0].meta.id).toBe('ok')
  })

  it('网格类型非法时该页跳过', () => {
    const raw = JSON.parse(serializeBackup(buildBackup([entry('a'), entry('b')])))
    raw.pages[0].meta.gridType = 'mixed'
    const parsed = parseBackup(JSON.stringify(raw))
    expect(parsed.pages).toHaveLength(1)
    expect(parsed.pages[0].meta.id).toBe('b')
    expect(parsed.skipped).toBe(1)
  })
})
