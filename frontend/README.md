# PoseGenerator Frontend

React 19 + TypeScript + Vite 节点链调控前端。

## 启动
需 pathview 后端运行在 `localhost:3001`,pose_backend 运行在 `localhost:8220`。

```powershell
cd frontend
npm install
npm run dev
```
访问 `http://localhost:5174`。Vite proxy 将 `/generate`、`/health`、`/node/execute`、`/pipeline/*` 转发到 8220,`/api/paths` 转发到 3001,浏览器侧零跨域。

## 结构速览

- `src/lib/nodeRegistry.ts` — 12 种节点定义(参数 schema / execute / 分组)
- `src/lib/pipeline.ts` — 节点链执行(脏节点标记 + 屏蔽直通,带 `.test.ts`)
- `src/lib/pipelineCodec.ts` — 节点链 ↔ `MWS_PathFilterAndPoseGenerator` 序列化文件互导(调后端 `/pipeline/*` 走库 `toJson`/`analysisJson`,本地仅做请求组装与响应映射,带 `.test.ts`)
- `src/lib/csvStore.ts` — IndexedDB 存 CSV 文本(key=流水线名);流水线结构进 localStorage
- `src/hooks/usePipeline.ts` — 状态中枢:增量重算(debounce 300ms + AbortController)、流水线增删切换
- `src/components/` — NodeChain / NodeCard / NodeResult / AllNodesView / Preview2D / PipelineBar / AddNodeMenu / BackendStatus

## 测试(tsx 直跑,无框架)
```powershell
npx tsx src/lib/nodeRegistry.test.ts
npx tsx src/lib/pipeline.test.ts
npx tsx src/lib/pipelineCodec.test.ts
npx tsc --noEmit
```
