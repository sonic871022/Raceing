# client-web/

Racing 的临时浏览器调试前端，用于在 Godot 客户端接入前先验证游戏流程与逻辑。

## 文件

- `index.html` — 最小页面结构与样式
- `app.js` — 状态拉取、赛道渲染、动作提交

## 启动

```powershell
npm run server
```

然后浏览器打开：

```text
http://127.0.0.1:8787/
```

`dev-server.mjs` 会同时托管 API 与 `game/client-web/` 下的静态文件。

## 范围

仅验证现有 reducer 逻辑：

- `cruise` / `accelerate` / `brake` / `pit-stop`
- 油耗、弯道惩罚、胜负判定

技能卡、骰子、多玩家、Godot 客户端为后续迭代。
