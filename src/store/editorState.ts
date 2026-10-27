/**
 * 编辑器 UI 状态（M2 阶段用轻量 reactive 单例）。
 *
 * 只有「界面需要感知」的状态放这里；笔迹与渲染状态留在 RenderEngine 内部，
 * 避免把高频写入的数据塞进 Vue 响应式系统。M3 引入页面元数据时可平滑迁移到 Pinia。
 */

import { reactive } from 'vue'
import type { PerfStats } from '@/core/perf/PerfMonitor'
import type { Tool } from '@/core/types'

interface EditorUiState {
  tool: Tool
  penMode: boolean
  canUndo: boolean
  canRedo: boolean
  strokeCount: number
  perf: PerfStats
}

export const editorState = reactive<EditorUiState>({
  tool: 'pen',
  penMode: false,
  canUndo: false,
  canRedo: false,
  strokeCount: 0,
  perf: { fps: 0, droppedRatio: 0, p95Latency: 0, lastLatency: 0, sampleCount: 0 },
})

/** 组件向 UI 暴露的命令入口，由 EditorView 在挂载时注册 */
export const editorCommands: {
  undo?: () => void
  redo?: () => void
  exitPenMode?: () => void
} = {}

/** 浮层开关（页列表 / 新建页 / 字帖选择） */
export const uiState = reactive({
  pageListOpen: false,
  newPageOpen: false,
  pickerKind: null as 'pinyin' | 'hanzi' | null,
  settingsOpen: false,
})

export function setTool(tool: Tool): void {
  editorState.tool = tool
}

export function runUndo(): void {
  editorCommands.undo?.()
}

export function runRedo(): void {
  editorCommands.redo?.()
}

export function runExitPenMode(): void {
  editorCommands.exitPenMode?.()
}
