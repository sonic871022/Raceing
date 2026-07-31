# 赛道数据结构改造：格子索引 → SDK 图布局（createGraphLayout）

## 摘要

将赛车游戏的赛道从一维环形整数索引（`position: number`）改造为 GAOS SDK 的 `createGraphLayout` 图布局（`position: string` 节点 ID）。P 房通道节点统一纳入图结构，通过有向边与主赛道连接。表现层暂时保持 6×8 格子矩阵，为未来迁移 Godot 后的任意拓扑赛道打下数据结构基础。

## 当前状态分析

### 当前数据结构（racing-rules.mjs）
- **位置**：`position: number`（0-47 整数索引），P 房用 `inPit: boolean` + `pitPosition: number`（0/1/2）单独管理
- **赛道**：`trackLength: 48`，`corners: [8, 16, 24, 32, 40]`（整数数组），`speedLimits` 派生自 corners
- **移动**：`moveCells` 用 `(pos + 1) % trackLength` 逐格推进，无分支无图结构
- **P 房**：`PIT_LANE = ['entrance', 'pit', 'exit']`，`pitTrackCells: [0, 2]`，硬编码常量 `PIT_P_TRACK_CELL = 1`

### SDK 图布局能力（layouts.js / layouts.d.ts）
- `createGraphLayout({ nodes: string[], edges: Record<string, string[]> })` → `BoardLayout<string>`
- `layout.neighbors(node)` 返回有向邻接节点数组（顺序 = edges 中定义的顺序）
- `layout.line(from, to)` 返回 BFS 最短路径（排除 from，包含 to）
- `layout.distance(from, to)` 返回最短距离
- `layout.contains(node)` / `layout.key(node)` 节点存在性检验

### 前端渲染（app.js）
- `renderTrack`：遍历 `0..trackLength-1`，用 `i === state.position` 匹配赛车位置
- P 房通道：独立 3 格 flex 布局，用 `inPit && pitPosition` 匹配
- CSS Grid `repeat(8, 1fr)` 排成 6×8 矩阵

## 设计决策

### 1. 节点命名
- 主赛道节点：`"0"` ~ `"47"`（数字字符串，保持与当前索引对应，便于前端渲染）
- P 房节点：`"pit-entrance"`、`"pit"`、`"pit-exit"`

### 2. 边（有向邻接表）
```
主赛道环：  "0"→["1"], "1"→["2"], ..., "46"→["47"], "47"→["0"]
0号格分叉：  "0"→["1", "pit-entrance"]  （主赛道方向在前，P房入口在后）
P房通道：   "pit-entrance"→["pit"], "pit"→["pit-exit"], "pit-exit"→["2"]
```
- 正常移动取 `neighbors(current)[0]`（主赛道方向）
- 进 P 房取 `neighbors("0")[1]`（pit-entrance 方向）
- 出 P 房从 `pit-exit` 沿 neighbors 自然回到 `"2"`

### 3. 状态字段变化
| 字段 | 当前 | 改造后 | 说明 |
|---|---|---|---|
| `position` | `number` (0-47) | `string` ("0"-"47", "pit-entrance", "pit", "pit-exit") | 统一用节点 ID |
| `inPit` | `boolean` | 移除 | 从 position 推断（是否以 "pit" 开头） |
| `pitPosition` | `number` (0/1/2) | 移除 | 从 position 推断 |
| `corners` | `[8,16,24,32,40]` | `["8","16","24","32","40"]` | 节点 ID 字符串 |
| `speedLimits` | `[{at: 11, limit: 3}, ...]` | `[{at: "11", limit: 3}, ...]` | at 改为字符串 |
| `level.layout` | 不存在 | `BoardLayout<string>` | createGraphLayout 创建 |
| `level.nodes` | 不存在 | `string[]` | 所有节点 ID 列表 |
| `level.edges` | 不存在 | `Record<string, string[]>` | 有向邻接表 |
| `level.pitNodes` | 不存在 | `string[]` | `["pit-entrance","pit","pit-exit"]` |

### 4. 移动逻辑
- **正常移动**（resolveMovement）：从当前节点出发，每步取 `layout.neighbors(current)[0]`（主赛道方向），前进 distance 步，沿途检查限速/冲出赛道
- **进 P 房**（resolvePitMovement）：从 `"0"` 出发，取 `neighbors("0")[1]`（pit-entrance），再继续沿 P 房边前进
- **出 P 房**：从 `"pit"` / `"pit-exit"` 出发，沿 neighbors 前进，自然回到主赛道 `"2"`
- **圈数计算**：移动过程中检测是否经过节点 `"0"`，每经过一次 lap+1

### 5. P 房状态推断
```js
function isOnMainTrack(position) { return !position.startsWith('pit'); }
function isAtPitEntrance(position) { return position === 'pit-entrance'; }
function isAtPit(position) { return position === 'pit'; }
function isAtPitExit(position) { return position === 'pit-exit'; }
```

## 改造步骤

### 步骤 1：重构 level 定义与图布局创建（racing-rules.mjs）

**文件**：`f:\AI_Test\Yu_SDK\Raceing\game\shared\racing-rules.mjs`

修改内容：
1. 导入 SDK 图布局：`import { createGraphLayout } from '@yugao-gaos/turn-based-grid-sdk/engine';`
2. 新增 `buildTrackGraph(trackLength)` 函数：生成 `nodes` 和 `edges`
   - 主赛道节点 `"0"` ~ `"{trackLength-1}"`
   - 主赛道边：`"{i}"` → `["{i+1}"]`，`"{trackLength-1}"` → `["0"]`
   - `"0"` 的边改为 `["1", "pit-entrance"]`（主赛道 + P房入口）
   - P 房节点和边：`pit-entrance`→`["pit"]`，`pit`→`["pit-exit"]`，`pit-exit`→`["2"]`
3. 修改 `DEFAULT_LEVEL`：
   - `corners: ["8", "16", "24", "32", "40"]`（字符串）
   - 新增 `pitNodes: ["pit-entrance", "pit", "pit-exit"]`
   - 移除 `pitTrackCells`（改为从 edges 推断）
4. 修改 `normalizeLevel`：
   - 调用 `buildTrackGraph` 生成 `nodes` 和 `edges`
   - 调用 `createGraphLayout({ nodes, edges })` 创建 `layout`，存入 level
   - `buildSpeedLimits` 的 `at` 改为字符串节点 ID
5. 移除常量 `PIT_P_TRACK_CELL`、`PIT_EXIT_TRACK_CELL`、`PIT_LANE`，改用节点 ID 字符串 `"pit-entrance"` / `"pit"` / `"pit-exit"`

### 步骤 2：重构状态与初始状态（racing-rules.mjs）

修改内容：
1. `createInitialState`：
   - `position: "0"`（字符串）
   - 移除 `inPit`、`pitPosition` 字段
2. 新增辅助函数：
   - `isOnMainTrack(position)`：`!position.startsWith('pit')`
   - `isPitNode(position)`：判断是否 P 房节点

### 步骤 3：重构移动逻辑（racing-rules.mjs）

修改内容：
1. 新增 `moveOnGraph(state, fromNode, distance, edgeIndex = 0)`：
   - `edgeIndex = 0`：正常移动，每步取 `layout.neighbors(current)[0]`
   - `edgeIndex = 1`：进 P 房，第一步取 `neighbors("0")[1]`，后续取 `[0]`
   - 逐步前进，沿途检查 speedLimits（用节点 ID 匹配）
   - 冲出赛道逻辑保持：经过红格超速 → 停在红格下一格
   - 圈数：检测是否经过 `"0"` 节点
   - 返回 `{ position: string, lap, fuelCost, offTrack }`
2. 移除 `moveCells` 函数
3. 修改 `resolveMovement`：调用 `moveOnGraph(state, state.position, distance, 0)`
4. 修改 `resolvePitMovement`：
   - 进入 P 房：`moveOnGraph(state, "0", distance, 1)`（走 pit-entrance 边）
   - 根据最终位置判断：`"pit-entrance"`（1步）或 `"pit"`（2步）
   - 到达 `"pit"` → 补油、清零速度/骰子、lastAction='enter-pit'
   - 到达 `"pit-entrance"` → 下回合再前进到 `"pit"`
5. 修改 `resolvePitExitMovement`：
   - 从 `"pit"` 或 `"pit-exit"` 出发，沿 neighbors 正常前进
   - 出口格算 1 格：`pit`→`pit-exit`→`"2"`→`"3"`...

### 步骤 4：重构动作列表与 applyAction（racing-rules.mjs）

修改内容：
1. `nextActionList`：
   - 用 `isOnMainTrack(state.position)` 替代 `!state.inPit`
   - 用 `state.position === "0"` 判断是否在起点可进 P 房
   - 用 `state.position === "pit"` + `lastAction === 'enter-pit'` 判断 P 房本回合
   - 用 `state.position === "pit-exit"` 判断出口格
2. `applyAction`：
   - 移除 `inPit` / `pitPosition` 相关分支
   - 用 position 节点 ID 判断当前所处位置类型
   - `enter-pit`：从 `"0"` 出发，走 P 房边
   - P 房格本回合结束：position 还是 `"pit"`，不移动
   - 下回合从 `"pit"` 出发：正常掷骰子、移动

### 步骤 5：重构 stateToView（racing-rules.mjs）

修改内容：
1. `race.position` 改为 string
2. 移除 `inPit`、`pitPosition`、`pitLane`、`pitTrackCells`
3. 新增：
   - `race.nodes`：主赛道节点 ID 列表 `["0","1",...,"47"]`
   - `race.pitNodes`：`["pit-entrance","pit","pit-exit"]`
   - `race.corners`：字符串节点 ID 数组
   - `race.speedLimits`：`[{at: "11", limit: 3}, ...]`
4. `race.isOnPit`：派生字段，`!isOnMainTrack(state.position)`（方便前端渲染）

### 步骤 6：重构前端渲染（app.js + index.html）

修改内容：
1. `renderTrack`（app.js）：
   - 主赛道遍历 `race.nodes`（`["0","1",...,"47"]`），用 `position === nodeId` 匹配
   - 格子索引显示：`nodeId`（字符串）
   - `corners.includes(nodeId)` / `limitMap.has(nodeId)` 用字符串匹配
   - P 房通道：遍历 `race.pitNodes`，用 `position === pitNode` 匹配赛车
2. `renderHud`：
   - `els.position.textContent`：显示 `state.position`（字符串节点 ID）
3. 移除 `inPit` / `pitPosition` 相关判断，改用 `position` 字符串匹配

### 步骤 7：更新 smoke-test 与验证

修改内容：
1. `smoke-test.mjs`：脚本不变（动作 ID 不变），验证输出 position 为字符串
2. 新增图结构验证：
   - `layout.neighbors("0")` 返回 `["1", "pit-entrance"]`
   - `layout.neighbors("pit")` 返回 `["pit-exit"]`
   - `layout.neighbors("pit-exit")` 返回 `["2"]`
   - `layout.distance("0", "2")` === 2
3. 验证移动：从 `"0"` 前进 7 步 → `"7"`；进 P 房 → `"pit"`

## 注意事项

### SDK 兼容性（用户强调）
- 只用 SDK 公开导出的 API：`createGraphLayout`、`BoardLayout` 接口（`neighbors`/`distance`/`line`/`contains`/`key`）
- 不依赖 SDK 内部实现细节
- SDK 调用集中在 `racing-rules.mjs`，reducer 和前端不直接调用 SDK
- SDK 更新时只需检查 `createGraphLayout` 的 API 签名是否变化

### 逻辑与表现解耦（用户强调）
- `racing-rules.mjs` 纯逻辑，输出 `stateToView` 包含所有渲染所需数据
- `app.js` 只消费 view，不包含游戏逻辑
- 节点 ID 用字符串，迁移 Godot 时可直接用作节点标识

### 扩展性（用户强调）
- 未来添加分叉路：只需在 edges 中为节点添加多个邻居 + 让玩家选择边
- 未来添加新赛道类型：只需定义新的 nodes/edges
- P 房逻辑预留技能卡扩展：P 房格本回合只允许 end-turn

## 验证步骤

1. **smoke-test**：`npm run smoke` 通过，position 为字符串节点 ID
2. **图结构验证**：neighbors/distance/line 返回正确结果
3. **移动验证**：
   - 正常移动：速度 1 + 骰子 6 = 7 步 → position = "7"
   - 进 P 房（distance≥2）：position = "pit"，油满
   - 进 P 房（distance=1）：position = "pit-entrance"
   - P 房本回合结束：position 不变（"pit"）
   - 下回合从 P 房出发：pit→pit-exit→"2"→"3"...
4. **冲出赛道验证**：超速经过红格 → 冲出赛道
5. **圈数验证**：经过 "0" 节点 → lap+1
6. **前端验证**：浏览器渲染正确，赛车位置匹配，P 房通道显示正确
