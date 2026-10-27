/**
 * 撤销 / 重做栈（笔画级，PRD F4.1）。
 *
 * 只记录「可逆操作」本身，不保存整页快照：
 * - add    → 撤销时从 index 处移除，重做时插回
 * - remove → 撤销时插回 index，重做时再次移除
 * 笔迹本身是不可变对象，两个栈共享同一引用，内存开销可忽略。
 */

import type { Stroke } from '@/core/stroke/StrokeModel'

export interface AddOp {
  kind: 'add'
  index: number
  stroke: Stroke
}

export interface RemoveOp {
  kind: 'remove'
  index: number
  stroke: Stroke
}

export type HistoryOp = AddOp | RemoveOp

/** 撤销栈深度（PRD F4.1） */
export const DEFAULT_HISTORY_LIMIT = 30

export class UndoStack {
  private undoOps: HistoryOp[] = []
  private redoOps: HistoryOp[] = []

  constructor(private readonly limit: number = DEFAULT_HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.undoOps.length > 0
  }

  get canRedo(): boolean {
    return this.redoOps.length > 0
  }

  get depth(): number {
    return this.undoOps.length
  }

  /** 记录一次新操作，同时清空重做栈 */
  record(op: HistoryOp): void {
    this.undoOps.push(op)
    if (this.undoOps.length > this.limit) this.undoOps.shift()
    this.redoOps.length = 0
  }

  /** 取出待撤销的操作（调用方负责执行其逆操作） */
  takeUndo(): HistoryOp | null {
    const op = this.undoOps.pop()
    if (!op) return null
    this.redoOps.push(op)
    return op
  }

  /** 取出待重做的操作 */
  takeRedo(): HistoryOp | null {
    const op = this.redoOps.pop()
    if (!op) return null
    this.undoOps.push(op)
    return op
  }

  clear(): void {
    this.undoOps.length = 0
    this.redoOps.length = 0
  }
}
