# Racing - 加油！Code Wiki

> 本文档是对 `Raceing` 仓库的完整结构化说明，覆盖项目架构、模块职责、关键类/函数、依赖关系与运行方式。

---

## 1. 项目概述

`Raceing` 是一款基于 **GAOS Turn-Based Grid SDK** 的 2~4 人竞速骰子桌游原型。

- **核心玩法**：玩家每回合掷骰子决定前进距离，并通过技能卡、油量管理与弯道限速进行博弈，先完成指定圈数者获胜。
- **技术栈**：Node.js (ESM)、Godot 4.7（客户端预留）、TypeScript 类型定义（当前实现为 `.mjs` 原型）。
- **架构风格**：
  - `reducer` 为纯函数式权威状态机；
  - `server` 仅负责 HTTP/WebSocket 接入与状态托管；
  - `client-godot` 负责渲染与输入；
  - `shared` 提供跨端共享的状态结构与规则。

---

## 2. 整体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                        Godot 4.7 客户端                      │
│  (game/client-godot/)  渲染 / UI / 输入 → 调用 server API     │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP / WebSocket
┌─────────────────────────────▼───────────────────────────────┐
│                     Node.js 开发服务器                        │
│              (game/server/dev-server.mjs)                    │
│   路由：/health /state /advance /reset                       │
└─────────────────────────────┬───────────────────────────────┘
                              │ 调用 reducer.advance
┌─────────────────────────────▼───────────────────────────────┐
│                      Racing Reducer                          │
│            (game/reducer/reducer.mjs)                        │
│   实现 TickReducer 接口：init / view / advance               │
└─────────────────────────────┬───────────────────────────────┘
                              │ 调用共享规则
┌─────────────────────────────▼───────────────────────────────┐
│                    共享规则与数据结构                         │
│           (game/shared/racing-rules.mjs)                     │
│   初始状态、动作应用、弯道规则、视图转换                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              @yugao-gaos/turn-based-grid-sdk
              (sdk/dist/* — 预编译 GAOS SDK)
```

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| 权威状态机在 reducer | 所有游戏逻辑必须幂等、可重放，server 不做业务判断。 |
| 客户端无逻辑 | Godot 仅做“状态 → 画面”的展示，防止客户端作弊。 |
| 共享类型/规则 | `shared/` 保证 server、reducer、client 看到一致的 `GameState` 与 `Action`。 |
| SDK 托管通用能力 | 协议、会话、回放生效、观测增量、排行榜等由 SDK 提供。 |

---

## 3. 目录结构

```text
Raceing/
├── docs/                       # 设计文档
│   ├── game-design.md          # 游戏玩法与技能卡设计
│   ├── track-design.md         # 赛道设计占位与 TrackCell 类型
│   └── CODE_WIKI.md            # 本文档
├── game/                       # 游戏自有代码
│   ├── README.md
│   ├── reducer/
│   │   ├── README.md
│   │   ├── reducer.mjs         # TickReducer 实现
│   │   └── smoke-test.mjs      # 本地冒烟脚本
│   ├── server/
│   │   ├── README.md
│   │   └── dev-server.mjs      # 最小开发服务器
│   ├── shared/
│   │   ├── README.md
│   │   └── racing-rules.mjs    # 规则与状态函数
│   └── client-godot/
│       └── README.md           # Godot 工程占位说明
├── sdk/dist/                   # 预编译 GAOS SDK（npm 依赖）
│   ├── index.d.ts              # SDK 顶层导出
│   ├── protocol.d.ts           # 稳定 wire 协议
│   ├── session.d.ts            # 会话内核
│   ├── session-host.d.ts       # 会话主机封装
│   ├── engine/                 # 引擎/模拟模块
│   ├── agent/                  # LLM Agent 驱动
│   ├── agent-cli/              # Agent CLI 工具
│   ├── benchmark.d.ts          # 基准测试
│   ├── verifier-kit.d.ts       # 校验工具包
│   └── ...
├── package.json                # npm 项目配置
├── package-lock.json
├── README.md
└── .gitignore
```

---

## 4. 主要模块职责

### 4.1 game/reducer — 权威状态机

- 实现 SDK 的 `TickReducer` 接口：
  - `init(level, seed)`：创建初始状态。
  - `view(state)`：把内部状态转换为客户端可渲染的视图。
  - `advance(state, inputs)`：接收动作列表，推进一个 tick。
- 当前实现极其轻量，只是对 `racing-rules.mjs` 的薄封装，方便后续替换为正式 TypeScript 版本。

详见 [game/reducer/reducer.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/reducer.mjs)。

### 4.2 game/server — Node.js 开发服务器

- 提供最小 HTTP 接口用于调试 reducer。
- 路由：
  - `GET /health` — 健康检查。
  - `GET /state` — 读取当前状态与视图。
  - `POST /advance` — 提交动作（如 `{"id":"accelerate"}`）。
  - `POST /reset` — 重置为新对局。
- 使用 Node 原生 `http` 模块，无外部 WebSocket 实现（可后续扩展）。

详见 [game/server/dev-server.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/server/dev-server.mjs)。

### 4.3 game/shared — 共享规则与数据结构

- 定义默认关卡 `DEFAULT_LEVEL`。
- 提供 `createInitialState`、`applyAction`、`stateToView` 等纯函数。
- 是 reducer、server、未来 Godot 客户端的唯一真实数据源。

详见 [game/shared/racing-rules.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs)。

### 4.4 game/client-godot — Godot 4.7 客户端（占位）

- 目录已创建，正式工程待补充。
- 推荐实现顺序：
  1. 只读调试界面，轮询 `GET /state`。
  2. 接入 `POST /advance` 与 `POST /reset`，把按钮/输入映射为 action。
  3. 逐步补齐动画、技能卡 UI、多玩家座位等。

### 4.5 sdk/dist — GAOS Turn-Based Grid SDK

`package.json` 通过 GitHub 主分支安装：

```json
"dependencies": {
  "@yugao-gaos/turn-based-grid-sdk": "github:yugao-gaos/GAOS-TurnBasedGrid-SDK#main"
}
```

SDK 当前以**预编译产物**形式存在于 `sdk/dist/`，主要分为：

| 模块域 | 代表文件 | 职责 |
|--------|----------|------|
| 顶层客户端 | `index.d.ts` | Arena API 客户端、观测、排行榜、VerifierKit 等高级封装。 |
| 协议层 | `protocol.d.ts` | tick 信封、指令提交、会话绑定、意图收集等稳定 wire 类型。 |
| 会话层 | `session.d.ts` / `session-host.d.ts` | 同步内核、观测增量、意图持久化、重放终化。 |
| 引擎层 | `engine/index.d.ts` | 移动、结算、资源、区域、目标选择、行为树、锁定步、重放、求解器等核心模拟能力。 |
| Agent 层 | `agent/index.d.ts` | LLM Agent 驱动注册、决策运行、OpenAI/Anthropic 兼容 provider。 |
| 校验层 | `verifier-kit.d.ts` / `verify-cli.d.ts` | 重放校验、受限 verifier、kit 打包与解析。 |
| 基准层 | `benchmark.d.ts` | 可复现 benchmark、排行榜条目、证据验证。 |
| 展示层 | `presentation-client.d.ts` | 客户端 snapshot/patch/ack 状态机。 |

---

## 5. 关键类型与数据结构

### 5.1 内部状态 (GameState)

定义于 [game/shared/racing-rules.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L30-L45)：

```js
{
  seed,           // 随机种子（当前未使用）
  level,          // 关卡配置
  seat: 'driver-1',
  lap,            // 当前圈数
  position,       // 当前赛道位置（0 ~ trackLength-1）
  speed,          // 当前车速
  fuel,           // 剩余油量
  turn,           // 已执行回合数
  lastAction,     // 上一步动作 id
  status,         // 'playing' | 'won' | 'failed'
  message,        // 人类可读提示
}
```

### 5.2 关卡配置 (Level)

```js
{
  trackLength: 12,
  lapsToWin: 3,
  maxFuel: 5,
  maxSpeed: 4,
  corners: [3, 7, 10],
}
```

未来会扩展为结构化 `TrackCell[]`（见 [docs/track-design.md](file:///f:/AI_Test/Yu_SDK/Raceing/docs/track-design.md)）。

### 5.3 动作 (Action)

最小动作仅含 `id`：

```js
{ id: 'accelerate' }
{ id: 'cruise' }
{ id: 'brake' }
{ id: 'pit-stop' }
```

SDK 侧动作类型为 `SubmittedAction`，可携带 `x/y/index/payload/targets/commit/reveal` 等字段（详见 `engine/contracts.d.ts`）。

### 5.4 视图 (View)

`stateToView` 输出：

```js
{
  status,        // 游戏状态
  activeSeat,    // 当前活动座位
  actions,       // 当前可选动作列表
  hud: { actionsUsed: turn, items: [] },
  race: { lap, lapsToWin, position, trackLength, speed, fuel, lastAction, message, corners }
}
```

---

## 6. 关键类与函数说明

### 6.1 game/shared/racing-rules.mjs

| 名称 | 类型 | 说明 | 位置 |
|------|------|------|------|
| `DEFAULT_LEVEL` | 常量 | 默认关卡参数。 | [L1-L7](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L1-L7) |
| `normalizeLevel(level)` | 函数 | 合并默认关卡与用户传入关卡。 | [L9-L15](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L9-L15) |
| `nextActionList(state)` | 函数 | 根据当前状态生成合法动作列表。 | [L17-L28](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L17-L28) |
| `createInitialState(level, seed)` | 函数 | 创建初始游戏状态。 | [L30-L45](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L30-L45) |
| `applyCornerRule(state)` | 函数 | 弯道超速惩罚：车速 > 3 时重置为 1。 | [L47-L55](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L47-L55) |
| `applyAction(state, action)` | 函数 | 核心状态推进函数，处理加速、刹车、进站、移动、油耗、胜负判定。 | [L57-L117](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L57-L117) |
| `stateToView(state)` | 函数 | 把内部状态转换为客户端视图。 | [L119-L140](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs#L119-L140) |

### 6.2 game/reducer/reducer.mjs

| 名称 | 类型 | 说明 | 位置 |
|------|------|------|------|
| `racingReducer` | 对象 | 实现 `TickReducer`：`init`、`view`、`advance`。 | [L3-L18](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/reducer.mjs#L3-L18) |
| `createDemoState(level, seed)` | 函数 | 快速生成演示状态。 | [L20-L22](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/reducer.mjs#L20-L22) |

### 6.3 game/server/dev-server.mjs

| 名称 | 类型 | 说明 | 位置 |
|------|------|------|------|
| `writeJson(response, statusCode, body)` | 函数 | 统一 JSON 响应。 | [L8-L11](file:///f:/AI_Test/Yu_SDK/Raceing/game/server/dev-server.mjs#L8-L11) |
| `collectJson(request)` | 函数 | 异步读取并解析请求体。 | [L13-L33](file:///f:/AI_Test/Yu_SDK/Raceing/game/server/dev-server.mjs#L13-L33) |
| `http.createServer(...)` | 路由 | 处理 `/health`、`/state`、`/advance`、`/reset`。 | [L35-L82](file:///f:/AI_Test/Yu_SDK/Raceing/game/server/dev-server.mjs#L35-L82) |

### 6.4 game/reducer/smoke-test.mjs

- 使用 SDK 的 `advanceTick` 依次执行脚本动作，最后打印状态与视图。
- 用于在本地快速验证 reducer 链路。

详见 [game/reducer/smoke-test.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/smoke-test.mjs)。

### 6.5 SDK 关键函数/类

| 名称 | 模块 | 说明 |
|------|------|------|
| `advanceTick(reducer, state, inputs)` | `engine/contracts` | 统一推进一个 tick，兼容 `TickReducer` 与旧 `ActionReducer`。 |
| `createSessionKernel(options)` | `session` | 创建同步、无 IO 的权威会话内核。 |
| `SessionKernelHost` | `session-host` | `prepare → persist → commit → publish` 的参考主机实现。 |
| `ArenaClient` | `index` | 连接 GAOS Arena 的 TypeScript 客户端（session、queue、match、tick）。 |
| `PresentationClient` | `presentation-client` | 客户端 snapshot/patch/ack 状态机。 |
| `AgentEnvironment` / `MultiAgentEnvironment` | `engine/agent-environment` / `engine/multi-agent-environment` | 本地 Agent 运行环境。 |
| `AgentDriverRegistry` | `agent/driver` | Agent 驱动注册表与合法性校验。 |
| `runBenchmark` / `verifyBenchmarkBundle` | `benchmark` | 可复现 benchmark 执行与校验。 |
| `packVerifierKit` / `resolveVerifierKit` | `verifier-kit` | Verifier kit 打包与解析。 |

---

## 7. 依赖关系

### 7.1 项目内部依赖图

```text
client-godot (future)
        │
        ▼ HTTP
  dev-server.mjs
        │
        ├──────► racingReducer (reducer.mjs)
        │              │
        │              ▼
        │      racing-rules.mjs
        │              │
        └──────────────┘ (shared state/view)
```

### 7.2 与 SDK 的依赖关系

```text
reducer.mjs ──────┐
smoke-test.mjs ───┼──► @yugao-gaos/turn-based-grid-sdk/engine ──► advanceTick
                  │
dev-server.mjs ───┘
```

当前最小实现仅使用了 SDK 的 `engine` 子模块；未来接入 Arena 时会使用 `ArenaClient`、`createSessionKernel`、`SessionKernelHost` 等。

### 7.3 npm 依赖

| 包名 | 来源 | 用途 |
|------|------|------|
| `@yugao-gaos/turn-based-grid-sdk` | GitHub `yugao-gaos/GAOS-TurnBasedGrid-SDK#main` | GAOS 回合制网格 SDK。 |

---

## 8. 项目运行方式

### 8.1 安装依赖

```powershell
npm install
```

### 8.2 运行 reducer 冒烟测试

```powershell
npm run smoke
# 等价于
node game/reducer/smoke-test.mjs
```

### 8.3 启动开发服务器

```powershell
npm run server
# 等价于
node game/server/dev-server.mjs
```

默认监听 `http://127.0.0.1:8787`，可通过环境变量 `PORT` 修改。

### 8.4 手动调试 HTTP 接口

```powershell
# 健康检查
Invoke-RestMethod -Method Get http://127.0.0.1:8787/health

# 读取当前状态
Invoke-RestMethod -Method Get http://127.0.0.1:8787/state

# 提交动作
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8787/advance `
  -ContentType 'application/json' `
  -Body '{"id":"accelerate"}'

# 重置对局
Invoke-RestMethod -Method Post http://127.0.0.1:8787/reset
```

### 8.5 Godot 客户端（待补充）

1. 在 `game/client-godot/` 创建 Godot 4.7 工程。
2. 先实现只读调试界面，轮询 `GET /state`。
3. 再接入 `POST /advance` 与 `POST /reset`。

---

## 9. 状态流转与规则

### 9.1 动作效果

| 动作 id | 效果 | 油耗/代价 |
|---------|------|----------|
| `cruise` | 按当前 `speed` 前进 | 无 |
| `accelerate` | `speed += 1`（不超过 `maxSpeed`），然后前进 | -1 油 |
| `brake` | `speed -= 1`（不低于 1），然后前进 | 无 |
| `pit-stop` | 油量 +2（不超过 `maxFuel`），本回合不移动 | 无 |

### 9.2 弯道规则

- 当赛车落在弯道格（`corners`）且 `speed > 3` 时：
  - 车速被强制重置为 `1`。
  - 提示信息变为 `Corner penalty: overspeed, reset to speed 1`。

### 9.3 油耗规则

- 每完整跑完一圈（`lap` 增加），油量 -1。
- `accelerate` 额外 -1 油。
- `fuel < 0` 时状态变为 `failed`，提示 `Out of fuel`。

### 9.4 胜负判定

| 条件 | 结果 | 状态 |
|------|------|------|
| `lap >= lapsToWin` | 完成比赛 | `won` |
| `fuel < 0` | 油量耗尽 | `failed` |
| 其他 | 继续比赛 | `playing` |

---

## 10. 扩展路线与待办

### 10.1 当前已完成

- [x] SDK 部署与接入
- [x] reducer 最小原型
- [x] 最小 Node.js 开发服务器
- [x] 共享规则文件

### 10.2 建议后续工作

1. **正式 reducer**
   - 将 `.mjs` 迁移为 `types.ts` / `reducer.ts`。
   - 拆分 `mechanics/`：弯道、油量、技能卡、路障。
2. **赛道数据**
   - 用 `TrackCell[]` 替换简单 `trackLength` + `corners`。
   - 区分 `track-layout`（拓扑）与 `track-balance`（参数）。
3. **技能卡系统**
   - 在 `shared/cards.ts` 中定义所有技能卡效果。
   - 在 `applyAction` 中处理卡牌打出时机。
4. **多玩家支持**
   - 将 `seat: 'driver-1'` 扩展为座位数组。
   - 接入 SDK `createSessionKernel` 与 `SessionKernelHost`。
5. **单元测试**
   - 引入 `vitest`，为 `racing-rules` 编写赛道 fixture。
6. **Godot 客户端**
   - 创建工程并固定版本 4.7.x。
   - 实现状态轮询、动作提交、动画表现。

---

## 11. 相关文件索引

| 文件 | 说明 |
|------|------|
| [README.md](file:///f:/AI_Test/Yu_SDK/Raceing/README.md) | 项目根说明 |
| [package.json](file:///f:/AI_Test/Yu_SDK/Raceing/package.json) | npm 配置与脚本 |
| [docs/game-design.md](file:///f:/AI_Test/Yu_SDK/Raceing/docs/game-design.md) | 玩法与技能卡设计 |
| [docs/track-design.md](file:///f:/AI_Test/Yu_SDK/Raceing/docs/track-design.md) | 赛道设计占位 |
| [game/README.md](file:///f:/AI_Test/Yu_SDK/Raceing/game/README.md) | game 目录说明 |
| [game/reducer/reducer.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/reducer.mjs) | TickReducer 实现 |
| [game/reducer/smoke-test.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/reducer/smoke-test.mjs) | 冒烟测试 |
| [game/server/dev-server.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/server/dev-server.mjs) | 开发服务器 |
| [game/shared/racing-rules.mjs](file:///f:/AI_Test/Yu_SDK/Raceing/game/shared/racing-rules.mjs) | 核心规则与状态函数 |
| [sdk/dist/index.d.ts](file:///f:/AI_Test/Yu_SDK/Raceing/sdk/dist/index.d.ts) | SDK 顶层类型 |
| [sdk/dist/engine/index.d.ts](file:///f:/AI_Test/Yu_SDK/Raceing/sdk/dist/engine/index.d.ts) | 引擎模块索引 |
| [sdk/dist/protocol.d.ts](file:///f:/AI_Test/Yu_SDK/Raceing/sdk/dist/protocol.d.ts) | 协议类型 |
| [sdk/dist/session.d.ts](file:///f:/AI_Test/Yu_SDK/Raceing/sdk/dist/session.d.ts) | 会话内核类型 |
