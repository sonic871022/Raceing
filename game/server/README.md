# server/

当前提供一个最小本地开发服务器：`dev-server.mjs`

功能：

- `GET /health`：健康检查
- `GET /state`：读取当前状态和 reducer view
- `POST /advance`：提交一个最小动作，如 `{"id":"accelerate"}`
- `POST /reset`：重置为新局

启动方式：

```powershell
cd sdk
npm run build
cd ..
node game/server/dev-server.mjs
```
