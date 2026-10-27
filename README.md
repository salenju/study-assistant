# 格子本

拼音田字格手写本 —— 面向安卓平板的离线 PWA 手写格子本 + 描红字帖。

| 文档 | 说明 |
|---|---|
| [docs/PRD-1027.md](docs/PRD-1027.md) | 产品需求 |
| [docs/TECH-1027.md](docs/TECH-1027.md) | 技术方案 |
| [docs/PLAN-1027.md](docs/PLAN-1027.md) | 执行计划（M1–M5） |

## 当前进度

| 里程碑 | 状态 |
|---|---|
| M1 地基与格子渲染 | 已完成 |
| M2 手写核心 | 已完成（桌面环境验证，真机待验） |
| M3 页面、存储与导出 | 已完成（桌面环境验证） |
| M4 描红字帖 | 已完成（桌面环境验证） |
| M5 PWA、打磨与验收 | 已完成（部署与真机待办） |

已实现：三层画布、田字格 / 米字格 / 四线三格渲染、DPR 像素对齐、横竖屏自适应、Pointer Events 采集（含
`getCoalescedEvents` 补点）、速度/压感笔锋、中点贝塞尔平滑、笔模式防误触、撤销 / 重做、整笔擦除、
多页管理、IndexedDB 落盘与节流、单页 PNG 导出、整本 JSON 备份与导入、描红字帖（拼音/汉字，自动分页）、
PWA 安装与离线、笔宽三档。

## 构建与预览

```bash
npm run build       # 产物在 dist/，含 Service Worker
npm run preview     # 本地预览生产构建（PWA 只在构建产物里生效）
```

> PWA 需要 HTTPS 或 localhost 才能注册 Service Worker。上线前必须有 HTTPS 地址。

## 常用命令

```bash
npm install         # 安装依赖
npm run dev         # 开发服务器（--host，可用平板局域网访问）
npm run test        # 单元测试
npm run typecheck   # 类型检查
npm run build       # 类型检查 + 生产构建
```

调试参数：`http://<ip>:5173/?debug=1` 显示浮层面板（视口、DPR、格数、格尺寸、笔画数、FPS、首笔延迟 P95）。

## 目录结构

```
src/
├── config/gridConfig.ts          # 格子主题、度量、描红样式的唯一参数源
├── core/
│   ├── layout/GridLayout.ts      # 格子自适应布局（纯函数）
│   ├── engine/
│   │   ├── GridRenderer.ts       # 格子绘制
│   │   ├── RenderEngine.ts       # 三层画布编排、笔迹生命周期、撤销/擦除
│   │   └── StrokePainter.ts      # 中点贝塞尔 + 逐段可变线宽
│   ├── input/PointerInput.ts     # 指针采集、coalesced 补点、笔模式过滤
│   ├── stroke/
│   │   ├── StrokeModel.ts        # 归一化笔迹模型
│   │   └── WidthModel.ts         # 速度/压感 → 线宽
│   ├── hit/EraseHitTest.ts       # 整笔擦除命中检测
│   ├── history/UndoStack.ts      # 笔画级撤销/重做
│   ├── perf/PerfMonitor.ts       # FPS 与首笔延迟采样
│   ├── page/types.ts             # 页面元数据 / 内容模型
│   └── export/compose.ts         # 导出图片与缩略图的画布合成
├── store/
│   ├── PageStore.ts              # IndexedDB / 内存两套仓储实现
│   ├── SaveQueue.ts              # 落盘节流与失败重试
│   ├── notebook.ts               # 页面集合、当前页、导入导出编排
│   └── editorState.ts            # 界面共享状态与命令入口
├── components/                   # TopBar / EditorView / ToolBar / 页列表 / 新建页
└── utils/                        # 画布像素吸附、格式化、备份校验、id 生成
```

## 描红字帖与字体

内置 4 个字库（`src/lib/copybooks/*.json`）：

| 字库 | 格子 | 字数 |
|---|---|---|
| 拼音字母表 | 四线三格 | 26 |
| 拼音声调 | 四线三格 | 24 |
| 一年级 · 独体字 | 田字格 | 24 |
| 一年级 · 常用字 | 田字格 | 36 |

新增字库只需往该目录丢一个 JSON，构建时自动收录，无需改代码。但**必须重新子集化字体**，
否则新字会回退到系统字体：

```bash
mkdir -p .font-src && cd .font-src
npm pack lxgw-wenkai-webfont@1.7.0 && tar -xzf lxgw-wenkai-webfont-*.tgz
cd .. && python3 scripts/build-font.py      # 需要 pip3 install fonttools brotli
```

字体为 LXGW WenKai（SIL OFL 1.1），许可证见 `public/fonts/OFL.txt`。

## 描红字帖与字体

内置 4 个字库（`src/lib/copybooks/*.json`）：

| 字库 | 格子 | 字数 |
|---|---|---|
| 拼音字母表 | 四线三格 | 26 |
| 拼音声调 | 四线三格 | 24 |
| 一年级 · 独体字 | 田字格 | 24 |
| 一年级 · 常用字 | 田字格 | 36 |

新增字库只需往该目录丢一个 JSON，构建时自动收录，无需改代码。但**必须重新子集化字体**，
否则新字会回退到系统字体：

```bash
mkdir -p .font-src && cd .font-src
npm pack lxgw-wenkai-webfont@1.7.0 && tar -xzf lxgw-wenkai-webfont-*.tgz
cd .. && python3 scripts/build-font.py      # 需要 pip3 install fonttools brotli
```

字体为 LXGW WenKai（SIL OFL 1.1），许可证见 `public/fonts/OFL.txt`。

## 参数调整注意

`src/config/gridConfig.ts` 是格子参数的唯一来源。改动 `GRID_THEME` / `GRID_METRICS` 后请重新跑
`npm run test` 并复核 8/11/13 寸、横竖屏下的格数与留白；M4 替换楷体字体时必须重新校准
`COPYBOOK_STYLE.pinyinFontScale`（见 TECH-1027.md §7.3）。

笔锋手感参数在 `src/core/stroke/WidthModel.ts` 的 `DEFAULT_WIDTH_PARAMS`（线宽上下限、速度阈值、平滑系数）。
