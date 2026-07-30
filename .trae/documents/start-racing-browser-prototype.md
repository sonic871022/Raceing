# 计划：Racing 浏览器前端原型验证

## 摘要

基于用户决策：先使用**纯 HTML + 原生 JS 浏览器前端**验证游戏流程与逻辑，Godot 客户端暂不接入；后端保持现有 `.mjs` 不变，不迁移 TypeScript。

本计划目标：在现有 `dev-server.mjs` 基础上增加静态文件服务，新增一个最小浏览器客户端，能通过按钮提交 action 并实时看到状态变化，完成单局可玩的流程验证。

---

## 当前状态分析

已阅读的关键文件：

- [package.json](file:///f:/AI_Test/Yu_SDK/Raceing/package.json) — 仅依赖 `@yugao-gaos/turn-based-grid-sdk`，脚本 `smoke` / `server`。
- [game/shared/racing-rules.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs) — 核心状态机：默认关卡、状态初始化、动作应用、弯道惩罚、胜负判定、视图转换。
- [game/reducer/reducer.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/reducer.mjs) — `TickReducer` 薄封装。
- [game/server/dev-server.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/server/dev-server.mjs) — 原生 http 服务，提供 `/health`、`/state`、`/advance`、`/reset`。
- [docs/game-design.md](file:///f:/AI_Test/Yu_SDK/Raceing/docs/game-design.md) — 玩法、技能卡、流程说明。
- [docs/track-design.md](file:///f:/AI_Test/Yu_SDK/Raceing/docs/track-design.md) — 默认赛道占位与后续 `TrackCell` 建议。

当前已实现：
- SDK 接入
- reducer 最小原型
- 最小开发服务器
- 共享规则

缺失：
- 任何前端（Godot 仅目录占位）
- 静态文件服务
- CORS / 同域访问方案

---

## 决策与假设

1. **前端技术栈**：纯 HTML + 原生 JS，无构建工具、无框架，后期可完全抛弃。
2. **后端保持 `.mjs`**：不引入 TypeScript，避免额外配置。
3. **同域服务**：由 `dev-server.mjs` 直接托管 `game/client-web/` 静态文件，避免 CORS 问题。
4. **玩法范围**：本次只验证现有 reducer 逻辑（cruise / accelerate / brake / pit-stop、油耗、弯道、胜负），不新增骰子、技能卡、多玩家。
5. **Godot 暂缓**：等浏览器端逻辑验证通过后再接入。

---

## 拟议变更

### 1. 扩展开发服务器以支持静态文件

**文件**：`game/server/dev-server.mjs`

**内容**：
- 在现有路由之前（或作为兜底）增加静态文件服务。
- 静态根目录指向 `game/client-web/`。
- URL `/` 映射到 `game/client-web/index.html`。
- 其他路径映射到 `game/client-web/<path>`，并做路径安全检查，防止越界访问。
- 保留现有 `/health`、`/state`、`/advance`、`/reset` JSON 路由。
- 对未知 API 路径仍返回 404 JSON；未知静态路径返回 404 文本或 JSON。

**实现要点**：
- 使用 Node 原生 `fs/promises` 读取文件。
- 使用 `path` 解析路径，使用 `fileURLToPath(import.meta.url)` 获取当前文件目录，再定位到 `../client-web/`。
- 根据文件扩展名设置 `Content-Type`（至少 `.html`、`.js`、`.css`）。
- 安全检查：解析请求路径后，确保最终绝对路径以静态根目录为前缀。

### 2. 创建浏览器前端

#### 2.1 `game/client-web/index.html`

**内容**：
- 最小页面结构：标题、状态面板（lap、position、speed、fuel、status、message）、赛道可视化区域、动作按钮区、重置按钮。
- 引入 `app.js`。
- 无外部 CSS 框架，仅内联或最小样式。

#### 2.2 `game/client-web/app.js`

**内容**：
- `fetchState()`：调用 `GET /state`，拿到 `{ state, view }`。
- `render(state, view)`：
  - 更新 HUD（lap、position、speed、fuel、status、message）。
  - 渲染赛道：用 12 格线性格子表示，高亮弯道，标出赛车位置。
  - 根据 `view.actions` 动态生成动作按钮；游戏结束（`status !== 'playing'`）时禁用动作按钮。
- `submitAction(id)`：调用 `POST /advance`，body 为 `{ id }`，成功后重新拉取状态。
- `resetGame()`：调用 `POST /reset`，成功后重新拉取状态。
- 页面加载时自动拉取一次状态。

**实现要点**：
- 不依赖任何第三方库。
- 使用 `fetch` API。
- 赛道渲染采用简单 DOM 元素（如 `div` 网格），后期可丢弃。

### 3. 更新 `package.json` 脚本（可选但建议）

**文件**：`package.json`

**内容**：
- 保持 `smoke` 与 `server` 不变。
- 如用户需要，可新增 `dev` 别名指向 `node game/server/dev-server.mjs`，但不必须。

### 4. 更新文档（可选）

**文件**：`docs/CODE_WIKI.md` 或 `game/client-web/README.md`

**内容**：
- 说明浏览器前端位置与启动方式。
- 记录该前端是临时验证用途，后续由 Godot 替代。

（如时间紧张，可在实现完成后再补充。）

---

## 验证步骤

1. 启动服务器：
   ```powershell
   npm run server
   ```
2. 在浏览器打开 `http://127.0.0.1:8787/`。
3. 确认页面正常加载，显示初始状态：
   - lap: 0 / 3
   - position: 0
   - speed: 1
   - fuel: 3
   - status: playing
4. 点击 `accelerate`：
   - speed 增加为 2
   - fuel 减少为 2
   - position 前进 2 格
5. 点击 `cruise`：
   - 按当前 speed 前进
6. 测试 `brake` 减速、弯道超速惩罚、进站加油。
7. 继续游戏直到 `status` 变为 `won` 或 `failed`：
   - 获胜：`lap >= 3`
   - 失败：`fuel < 0`
8. 点击 `reset` 后状态重置，可重新开始。
9. 保持 `npm run smoke` 仍能通过，确保 reducer 逻辑未被破坏。

---

## 范围外（后续迭代）

- 多玩家支持
- 技能卡系统
- 结构化赛道 `TrackCell[]`
- TypeScript 迁移
- Godot 客户端
- 接入 GAOS SDK session / arena

这些将在浏览器端逻辑验证完成后再排期。
