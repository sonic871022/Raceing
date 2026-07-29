# Racing - 加油！

一款 2-4 人的竞速骰子桌游，基于 GAOS Turn-Based Grid SDK 实现。

## 项目结构

```
Raceing/
├── game/               # 赛车游戏自己的代码
│   ├── reducer/        # 游戏规则（与 SDK 接口对接）
│   ├── server/         # Node.js 服务端（WebSocket/HTTP）
│   ├── client-godot/   # Godot 4.7 客户端（渲染、动画、UI）
│   └── shared/         # 共享的赛车规则逻辑
├── docs/               # 游戏设计文档
├── package.json        # 项目依赖（SDK 通过 npm 包安装）
└── README.md
```

## 安装

```powershell
npm install
```

SDK 通过 npm 包方式安装（`@yugao-gaos/turn-based-grid-sdk`），无需手动管理 subtree。

## 更新 SDK

当 GAOS 官方发布新版本时，更新 `package.json` 中的版本号：

```powershell
npm install @yugao-gaos/turn-based-grid-sdk@latest
```

## 快速开始

1. 安装依赖：
   ```powershell
   npm install
   ```

2. 跑 Racing reducer 冒烟脚本：
   ```powershell
   npm run smoke
   ```

3. 启动最小本地服务端：
   ```powershell
   npm run server
   ```

4. 手动验证服务端：
   ```powershell
   Invoke-RestMethod -Method Get http://127.0.0.1:8787/state

   Invoke-RestMethod -Method Post `
     -Uri http://127.0.0.1:8787/advance `
     -ContentType 'application/json' `
     -Body '{"id":"accelerate"}'
   ```

5. Godot 客户端

   `game/client-godot/` 目录已创建，但正式工程仍待补充。当前建议先用 HTTP 调试方式把 reducer / server 跑通，再接 Godot 4.7 客户端。

## 关联项目

- [GAOS Turn-Based Grid SDK](https://github.com/yugao-gaos/GAOS-TurnBasedGrid-SDK) — 上游依赖
- [Zonoid](https://zonoid.ai/) — 同样基于 GAOS SDK 的生产级游戏
