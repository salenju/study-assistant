import { describe, expect, it } from 'vitest'
import { UndoStack } from '@/core/history/UndoStack'
import type { Stroke } from '@/core/stroke/StrokeModel'

function stroke(id: string): Stroke {
  return { id, color: '#000', points: [0, 0, 0.5, 0.01] }
}

describe('UndoStack', () => {
  it('初始不可撤销也不可重做', () => {
    const stack = new UndoStack()
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
    expect(stack.takeUndo()).toBeNull()
    expect(stack.takeRedo()).toBeNull()
  })

  it('撤销后进入重做栈，重做后回到撤销栈', () => {
    const stack = new UndoStack()
    const s = stroke('a')
    stack.record({ kind: 'add', index: 0, stroke: s })

    const undone = stack.takeUndo()
    expect(undone).toEqual({ kind: 'add', index: 0, stroke: s })
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(true)

    const redone = stack.takeRedo()
    expect(redone).toEqual({ kind: 'add', index: 0, stroke: s })
    expect(stack.canUndo).toBe(true)
    expect(stack.canRedo).toBe(false)
  })

  it('记录新操作会清空重做栈', () => {
    const stack = new UndoStack()
    stack.record({ kind: 'add', index: 0, stroke: stroke('a') })
    stack.takeUndo()
    expect(stack.canRedo).toBe(true)

    stack.record({ kind: 'add', index: 1, stroke: stroke('b') })
    expect(stack.canRedo).toBe(false)
  })

  it('超过深度上限时丢弃最早的记录', () => {
    const stack = new UndoStack(3)
    for (let i = 0; i < 5; i += 1) {
      stack.record({ kind: 'add', index: i, stroke: stroke(`s${i}`) })
    }
    expect(stack.depth).toBe(3)

    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const op = stack.takeUndo()
      ids.push(op && 'stroke' in op ? op.stroke.id : '')
    }
    // 后进先出，且 s0 / s1 已被丢弃
    expect(ids).toEqual(['s4', 's3', 's2'])
    expect(stack.canUndo).toBe(false)
  })

  it('remove 操作可被撤销', () => {
    const stack = new UndoStack()
    const s = stroke('x')
    stack.record({ kind: 'remove', index: 4, stroke: s })
    const op = stack.takeUndo()
    expect(op).toEqual({ kind: 'remove', index: 4, stroke: s })
  })

  it('clear 清空两个栈', () => {
    const stack = new UndoStack()
    stack.record({ kind: 'add', index: 0, stroke: stroke('a') })
    stack.takeUndo()
    stack.record({ kind: 'add', index: 0, stroke: stroke('b') })
    stack.clear()
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
  })
})
