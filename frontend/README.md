# PoseGenerator Frontend

React + Vite 参数调控前端。

## 启动
需 pathview 后端运行在 `localhost:3001`，pose_backend 运行在 `localhost:8220`。

```powershell
cd frontend
npm install
npm run dev
```
访问 `http://localhost:5174`。Vite proxy 将 `/generate` 转发到 8220，`/api/paths` 转发到 3001。
