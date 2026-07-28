# client-godot/

Godot 4.7 客户端目录已创建，当前仍是占位状态。

建议下一步：

- 创建 Godot 工程并固定版本为 4.7.x
- 先实现一个只读调试界面，从 `GET /state` 拉取状态
- 再接 `POST /advance`，把按钮操作映射为 reducer action

当前和服务端的最小接口：

- `GET /state`
- `POST /advance`
- `POST /reset`
