# Reducer 占位

Racing 游戏的 reducer 代码将放在这里。

预期结构：
- `types.ts` — GameState / Action / Player / TrackCell 等类型定义
- `reducer.ts` — TickReducer 的 init / advance / view / viewFor 实现
- `mechanics/` — 各机制（弯道、技能卡、油量、路障等）拆分模块
- `tests/` — vitest 单元测试

SDK 入口参考 `sdk/src/engine/`，具体接口见 `sdk/src/engine/contracts.ts`。
