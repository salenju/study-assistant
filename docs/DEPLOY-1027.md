# 部署与真机验收手册

> 配套文档：`PRD-1027.md`（要什么）、`TECH-1027.md`（怎么做）、`PLAN-1027.md`（做到哪一步）

---

## 1. 部署到 GitHub Pages

### 1.1 现状

代码已就绪，流水线 `.github/workflows/deploy.yml` 已推送。首次运行结果：

| 步骤 | 结果 |
|---|---|
| checkout / setup-node / npm ci | 通过 |
| 单元测试（193 项） | 通过 |
| 子路径构建 | 通过 |
| **configure-pages** | **失败** |
| upload-pages-artifact / deploy | 跳过 |

失败原因是仓库尚未启用 Pages，**与代码无关**。

### 1.2 必须手动做的一步

只能由仓库管理员在网页上操作，命令行无法替代：

```
https://github.com/salenju/study-assistant/settings/pages
→ Build and deployment → Source → 选择「GitHub Actions」
```

设置完成后，到 Actions 页面重跑失败的那次，或再推一个提交。

#### 为什么不用 `enablement: true` 自动开通

GitHub 的报错里提到了这个参数，但 `configure-pages` 的官方输入说明写着：

> This option requires a token other than `GITHUB_TOKEN` to be provided.
> In the context of a Personal Access Token, the `repo` scope or Pages write permission is required.

也就是说，必须额外准备一个 PAT 或 GitHub App 令牌存进 Secrets，流水线才有权开通 Pages。
为一个一次性开关长期维护密钥不划算，所以工作流改成**先自检**：
未启用时直接在日志里打印设置页地址并以非零码退出，而不是抛一个看不懂的 404。

### 1.3 上线后校验

访问 `https://salenju.github.io/study-assistant/`，逐项确认：

- [ ] 页面正常渲染格子（不是白屏）
- [ ] 控制台无 404（尤其 `fonts/wenkai-subset.woff2`）
- [ ] DevTools → Application → Manifest：无报错，`start_url` 与 `scope` 均为 `/study-assistant/`
- [ ] Application → Service Workers：状态为 activated，作用域为 `/study-assistant/`
- [ ] 勾选 DevTools 的 Offline 后刷新，页面仍能打开并书写

### 1.4 已知限制

| 项 | 说明 |
|---|---|
| 私有仓库 | 免费账号的 Pages 只对 public 仓库开放，私有仓库需要 GitHub Pro / Team |
| 首次部署 | Source 未设为 GitHub Actions 前，流水线必然停在 configure-pages |
| 自定义域名 | 若绑定自有域名，`VITE_BASE` 要改回 `/` 并同步 manifest |
| 运行时版本 | 所有 action 已升到 node24 版本（`checkout@v7` / `setup-node@v7` / `configure-pages@v6` / `upload-pages-artifact@v5` / `deploy-pages@v5`），不再触发 Node 20 弃用告警 |

---

## 2. 真机验收清单（安卓平板）

> M1–M5 的全部验证都在桌面 Chrome 完成。以下项目**只能**在平板上做，
> 是 V1.0 能否算交付的唯一依据。

### 2.1 准备

1. 平板 Chrome 打开 `https://salenju.github.io/study-assistant/?debug=1`
2. 地址栏右侧菜单 → 安装应用 / 添加到主屏幕
3. **从桌面图标启动**（不是从浏览器标签页），确认没有地址栏

### 2.2 逐项操作与判定

| # | 操作 | 判定标准 | 结果 |
|---|---|---|---|
| T1 | 用手指在田字格里写一笔 | 笔画出现在手指下方，偏差 ≤ 2px；无延迟感 | ☐ |
| T2 | 快速连写 20 笔 | 无断线、无折角、无提前断尾 | ☐ |
| T3 | 用触控笔慢写一个字 | 笔画明显比快写粗（笔锋） | ☐ |
| T4 | 用力压 / 轻轻划（支持压感的笔） | 线宽随压力变化 | ☐ |
| T5 | 用笔写完一笔后，把整个手掌压在屏幕上 10 次 | **零笔迹**；顶栏出现「笔模式 · 手指已锁定」 | ☐ |
| T6 | 笔模式下点按钮（撤销/新建页） | 按钮正常响应（UI 不被锁定） | ☐ |
| T7 | 点「退出笔模式」后再用手指写 | 手指恢复可写 | ☐ |
| T8 | 连续书写 60 秒，观察 `?debug=1` 面板 | FPS ≥ 55，掉帧 < 3%，首笔延迟 P95 ≤ 32ms | ☐ |
| T9 | 横竖屏来回旋转 3 次 | 笔迹仍在正确格子内，无错位、无丢失 | ☐ |
| T10 | 切到后台再切回 | 笔迹完整；无重新加载 | ☐ |
| T11 | 新建「汉字字帖」页 | 描红字为楷体，居中不触边 | ☐ |
| T12 | 新建「拼音字帖」页 | 字母坐在第三线上，不悬空不入格 | ☐ |
| T13 | 页列表 → 导出本页图片 | 相册/下载目录能看到 PNG，含格子与笔迹 | ☐ |
| T14 | 关闭应用后重新从图标打开 | 自动回到上次所在页，笔迹完整 | ☐ |
| T15 | 飞行模式下打开应用 | 能正常进入并书写 | ☐ |

### 2.3 需要记录的数据

在 `?debug=1` 面板抄下这几个数，回填到 `PLAN-1027.md` 的 M5 记录里：

```
设备型号：
Android 版本：
Chrome 版本：
DPR：
列 × 行：
FPS（掉帧 %）：
首笔延迟 P95：
```

### 2.4 不达标时的排查顺序

| 现象 | 优先怀疑 | 处理方向 |
|---|---|---|
| 笔画明显落后于手指 | 输入采集或帧率 | 先看 FPS；若 FPS 低，查是否低端机 GPU 合成能力不足 |
| 快速书写断线 | `getCoalescedEvents` 未生效 | 确认 Chrome 版本；必要时提高插值密度 |
| 手掌仍留下笔迹 | `pointerType` 判定或笔模式未触发 | 确认触发笔为 `pen` 类型；检查 `PointerInput` 的过滤日志 |
| 笔锋看不出来 | 速度区间不匹配设备采样率 | 调 `DEFAULT_WIDTH_PARAMS` 的 `minSpeed` / `maxSpeed` |
| 旋转后笔迹跑偏 | 归一化坐标换算 | 检查 `cellRectAt` 与 `toPixelData` 的缩放是否一致 |

---

## 3. 回填与归档

真机做完后：

1. 截图存到 `docs/screenshots/`，命名 `m5-device-<项目>.png`
2. 把 2.3 的数据填进 `PLAN-1027.md` 的 M5 性能表
3. 更新 `PLAN-1027.md` 中 M5-1（真机未验证）的状态
4. 提交推送，Pages 会自动重新部署
