# reducer/

这里已经补上一个最小可运行的 reducer 原型，用于把项目从“纯占位”推进到“可本地验证”。

当前文件：

- `reducer.mjs` — 最小 `TickReducer` 风格实现
- `smoke-test.mjs` — 本地冒烟脚本

运行方式：

```powershell
cd sdk
npm run build
cd ..
node game/reducer/smoke-test.mjs
```

建议后续演进：

- 把 `.mjs` 版本迁移成正式的 `types.ts` / `reducer.ts`
- 拆分 `mechanics/`，把弯道、油量、技能卡、路障做成独立模块
- 增加 `vitest` 单元测试和赛道 fixture

SDK 入口参考 `sdk/src/engine/`，具体接口见 `sdk/src/engine/contracts.ts`。
