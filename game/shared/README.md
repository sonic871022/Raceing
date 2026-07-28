# shared/

`shared/` 放跨端共用的规则和数据结构。

当前已提供：

- `racing-rules.mjs`：最小可运行的赛道规则、初始状态、状态推进和视图转换

后续建议补充：

- `types.ts`：正式的 `GameState` / `Action` / `TrackCell` 类型
- `track-data.ts`：把赛道图转成结构化格子数据
- `cards.ts`：技能卡定义和效果参数
