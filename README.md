# Racing - 加油！

一款 2-4 人的竞速骰子桌游，基于 GAOS Turn-Based Grid SDK 实现。

## 项目结构

```
Raceing/
├── sdk/                # GAOS Turn-Based Grid SDK（subtree 方式管理，可从官方同步）
├── game/               # 赛车游戏自己的代码
│   ├── reducer/        # 游戏规则（TypeScript，与 SDK 接口对接）
│   ├── server/         # Node.js 服务端（WebSocket/HTTP）
│   └── client-godot/   # Godot 4.7 客户端（渲染、动画、UI）
├── tools/              # 工具脚本
│   └── sync-sdk.ps1    # 一键从 GAOS 官方拉取最新更新
├── docs/               # 游戏设计文档
└── README.md
```

## 同步 GAOS 官方 SDK

需要更新 SDK 到最新版本时，运行：

```powershell
pwsh tools/sync-sdk.ps1
```

或手动执行：

```powershell
git fetch GAOS-Official main
git subtree pull --prefix=sdk GAOS-Official main --squash -m "Merge GAOS SDK updates"
```

## 快速开始

1. 安装依赖：
   ```powershell
   cd sdk
   npm install
   ```

2. 跑 SDK 自带测试（验证环境）：
   ```powershell
   cd sdk
   npm test
   ```

3. （待补充）启动游戏服务端 + Godot 客户端

## 关联项目

- [GAOS Turn-Based Grid SDK](https://github.com/yugao-gaos/GAOS-TurnBasedGrid-SDK) — 上游依赖
- [Zonoid](https://zonoid.ai/) — 同样基于 GAOS SDK 的生产级游戏
