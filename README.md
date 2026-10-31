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
多页管理、IndexedDB 落盘与节流、单页 PNG 导出、整本 JSON 备份与导入、描红字帖（拼音/汉字/自定义汉字，
自动分页）、PWA 安装与离线、笔宽三档。

## 构建与预览

```bash
npm run build       # 产物在 dist/，含 Service Worker
npm run preview     # 本地预览生产构建（PWA 只在构建产物里生效）
```

> PWA 需要 HTTPS 或 localhost 才能注册 Service Worker。上线前必须有 HTTPS 地址。

## 部署到 GitHub Pages

仓库已内置 `.github/workflows/deploy.yml`：推送到 `main` 即自动「装依赖 → 跑单测 → 构建 → 发布」。

**首次启用只需手动做一步**（必须由仓库管理员在网页上操作）：

> Settings → Pages → Build and deployment → Source 选 **GitHub Actions**

设置好之前，workflow 会在开头的「检查 Pages 是否已启用」步骤停下，并在日志里给出设置页地址，属正常现象；
设置后重新运行即可（或再推一次）。

完成后访问：`https://<用户名>.github.io/<仓库名>/`

### 为什么构建要带 `VITE_BASE`

GitHub Pages 的项目站点挂在 `/<仓库名>/` 子路径下。若按根路径构建：

- `index.html` 里的 JS/CSS 会 404 → 页面白屏
- manifest 的 `start_url`/`scope` 指到根路径 → 安装后打开空白
- Service Worker 作用域跑到根目录 → 离线失效

workflow 里用 `VITE_BASE=/${仓库名}/` 解决，仓库改名或 fork 都不需要改代码。

本地验证子路径构建：

```bash
VITE_BASE=/study-assistant/ npm run build
mkdir -p /tmp/pages/study-assistant && cp -R dist/. /tmp/pages/study-assistant/
cd /tmp/pages && python3 -m http.server 5190
# 打开 http://localhost:5190/study-assistant/
```

### 首次部署卡在 configure-pages？

说明仓库还没启用 Pages，属于设置问题而非代码问题。按本文开头的「首次启用」一步设置即可。
完整的部署排查与**真机验收清单**见 [`docs/DEPLOY-1027.md`](docs/DEPLOY-1027.md)。

### 限制

- GitHub Pages 强制 HTTPS，正好满足 PWA 的 Service Worker 前提
- **免费账号的 Pages 只对 public 仓库开放**；私有仓库需 GitHub Pro / Team
- Pages 只托管静态文件，本项目的「纯本地存储」设计天然适配，无需后端

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

脚本生成两份字体，避免为自定义内容牺牲首屏：

| 文件 | 内容 | 体积 | 加载时机 |
|---|---|---|---|
| `wenkai-subset.woff2` | 内置字库用到的字符 | 约 12KB | 启动即加载 |
| `wenkai-common.woff2` | GB2312 一级常用字 + 内置字 | 约 850KB | 自定义描红出现子集外字符时 |

「新建 → 汉字字帖 → 自定义描红内容」可输入任意汉字（最多 80 个，标点和空格自动忽略），
按当前视口行数自动分页；超出常用字子集的生僻字会回退到系统字体。

字体为 LXGW WenKai（SIL OFL 1.1），许可证见 `public/fonts/OFL.txt`。

## 参数调整注意

`src/config/gridConfig.ts` 是格子参数的唯一来源。改动 `GRID_THEME` / `GRID_METRICS` 后请重新跑
`npm run test` 并复核 8/11/13 寸、横竖屏下的格数与留白；M4 替换楷体字体时必须重新校准
`COPYBOOK_STYLE.pinyinFontScale`（见 TECH-1027.md §7.3）。

笔锋手感参数在 `src/core/stroke/WidthModel.ts` 的 `DEFAULT_WIDTH_PARAMS`（线宽上下限、速度阈值、平滑系数）。
