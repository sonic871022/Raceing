# game/

本目录包含 Racing 游戏的全部自有代码。

```
game/
├── reducer/        # 游戏规则（TypeScript），实现 SDK 的 TickReducer 接口
├── server/         # Node.js 服务端，提供 WebSocket / HTTP 接口给 Godot 客户端
├── shared/         # 客户端和服务端共用的类型定义（与 reducer 共享）
└── client-godot/   # Godot 4.7 客户端（渲染、动画、UI、输入）
```

## 分工

- **reducer**：纯函数逻辑，决定游戏状态如何变化。可以本地跑测试，也可以跑 AI 对战。
- **server**：Node.js 进程，调用 reducer，提供 WebSocket 接口。
- **client-godot**：负责画面表现，把 reducer 的状态画出来，把玩家操作发回 server。
- **shared**：跨端类型，保证 reducer / server / client 用的是同一套 GameState / Action 定义。

## 当前状态

- `reducer/`：已补最小可运行原型，可本地推进状态
- `server/`：已补最小开发服务器，可用 HTTP 调试动作提交
- `shared/`：已补共用规则文件
- `client-godot/`：目录已创建，等待正式 Godot 工程

## 启动开发

1. 构建 SDK：
   ```powershell
   cd sdk
   npm run build
   ```

2. 跑 reducer 冒烟验证：
   ```powershell
   cd ..
   node game/reducer/smoke-test.mjs
   ```

3. 启动最小本地服务端：
   ```powershell
   node game/server/dev-server.mjs
   ```

4. 手动调试动作：
   ```powershell
   Invoke-RestMethod -Method Get http://127.0.0.1:8787/state

   Invoke-RestMethod -Method Post `
     -Uri http://127.0.0.1:8787/advance `
     -ContentType 'application/json' `
     -Body '{"id":"accelerate"}'
   ```
