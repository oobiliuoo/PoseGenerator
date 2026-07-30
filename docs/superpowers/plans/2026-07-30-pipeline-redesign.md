# 点位处理流水线改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前"单一姿态生成工具"重构为"点位处理流水线"——纵向节点链、可插拔节点、每节点显示结果、增量重算、多流水线持久化、后端统一 `/node/execute`。第一阶段内置 3 个节点（csv_input / pose_generate / pathview_export）。

**Architecture:** 前端持有流水线定义（节点列表+顺序+参数），混合执行（纯前端节点同步跑，算法节点发后端）。后端新增 `POST /node/execute` 按 `node_type` 分发，第一阶段只支持 `pose_generate`（复用现有 `generate()`）。节点间传 `PoseFrame = {points, meta}`。增量重算：参数变更只重算该节点及下游，算法节点 debounce 300ms 取消重发。

**Tech Stack:** React 19 + TypeScript + Vite（前端）；C++17 / MSVC / cpp-httplib / nlohmann/json（后端）；localStorage（多流水线持久化）。

## Global Constraints

- **不改 nexus 库**：`pose_generate` 节点的 `meta` 为空，只返回最终点+姿态。不显算法内部状态。
- **NEXUS_ROOT** = `E:\workspace\nexus`。后端链接 `MultimodalWeldSystem.lib` 等 7 个库（见 `backend/CMakeLists.txt` 现状）。
- **工具链**：MSVC / x64 / `/MD` / C++17 / RelWithDebInfo（后端）；React 19 + Vite（前端，端口 5174）。
- **端口**：前端 5174；pose_backend 8220；pathview 5173/3001（外部不改）。
- **数据契约**：`PoseFrame = {points: PosePoint[], meta: Record<string, unknown>}`。`PosePoint = {x,y,z,rx,ry,rz}`（rx/ry/rz 可选，由节点决定是否填）。`output_mode` 整数 0/1。
- **`/node/execute` 后端只收 params 的 initial_pose**：input frame 的姿态字段忽略（generate() 只收位置）。
- **线性流水线**：无分支/合流，无环路。
- **localStorage key**：`pose_generator_pipelines`。只存拓扑+参数，不存输出。
- **复用现有**：`parseCsvPoints`（csv.ts）、`eulerToVec`/`eulerToDirXY`（euler.ts）、`Preview2D`/`PoseTable`/`BackendStatus`（components）、`sendToPathview`/`openPathview`（api/pathview.ts）、`ParamsPanel` 紧凑控件、presets.ts 的 localStorage 模式。
- **`/generate` 保留**：迁移期兼容，迁移完成后前端全走 `/node/execute`。
- **Commit 风格**：conventional commits 中文，如 `feat(pipeline): 新增节点执行引擎`。

---

## File Structure

```
PoseGenerator/
├── backend/
│   ├── src/
│   │   ├── pose_adapter.h          # 现有，不改
│   │   ├── pose_adapter.cpp        # 现有，不改
│   │   └── main.cpp                # 改：新增 POST /node/execute 路由
│   └── src/tests/
│       └── test_adapter.cpp        # 现有，不改（/node/execute 复用 runGenerate）
└── frontend/
    └── src/
        ├── types/
        │   └── index.ts            # 改：新增 PoseFrame / NodeParamSpec / NodeDef / Pipeline / PipelineNode
        ├── lib/
        │   ├── nodeRegistry.ts     # 新：NODE_REGISTRY + 3 节点定义（参数 schema + execute）
        │   ├── pipeline.ts         # 新：引擎——增量重算 + 输出缓存 + 脏标记 + 拓扑序
        │   ├── pipelinesStore.ts   # 新：localStorage 多流水线（复用 presets 模式）
        │   ├── csv.ts              # 现有，不改
        │   ├── euler.ts            # 现有，不改
        │   └── presets.ts          # 现有，保留（参数预设仍用于 pose_generate 节点内）
        ├── api/
        │   ├── node.ts             # 新：POST /node/execute 客户端
        │   ├── generate.ts         # 现有，保留（迁移期）
        │   └── pathview.ts         # 现有，复用 sendToPathview/openPathview
        ├── hooks/
        │   └── usePipeline.ts      # 新：流水线 state + 引擎驱动 + selectedNodeId
        ├── components/
        │   ├── NodeChain.tsx       # 新：纵向节点链容器（增删节点、上移下移）
        │   ├── NodeCard.tsx        # 新：单节点卡片（头+内联参数+状态徽章）
        │   ├── NodeResult.tsx      # 新：选中节点的 2D 预览 + 数值表
        │   ├── PipelineBar.tsx     # 新：底部流水线选择/保存/运行全部
        │   ├── Preview2D.tsx       # 现有，复用
        │   ├── PoseTable.tsx       # 现有，复用
        │   └── BackendStatus.tsx   # 现有，复用
        ├── App.tsx                 # 改：重构为流水线布局
        └── App.css                 # 改：节点链/卡片样式
```

**职责边界：**
- `nodeRegistry.ts` — 节点定义的单一来源。每个节点的参数 schema、execute 函数、可视化声明都在这里。加新节点只改这个文件。
- `pipeline.ts` — 纯引擎逻辑，不碰 React。`runPipeline` 跑脏节点、`makeFrame` 构造空 frame。可单测。
- `pipelinesStore.ts` — localStorage 读写，复用 presets.ts 的 `loadX/ saveX/ deleteX` 三函数模式。
- `usePipeline.ts` — React 粘合层，把引擎和 state 接起来，暴露给 App。
- `NodeCard.tsx` — 一个节点的 UI，参数区复用 ParamsPanel 的紧凑控件。

---

## Task 1: 后端 `/node/execute` 接口

**Files:**
- Modify: `E:\person\project\PoseGenerator\backend\src\main.cpp`
- Test: 手动 curl（接口层）+ 复用现有 `test_adapter`（逻辑层不变）

**Interfaces:**
- Consumes: `parseGenerateRequest`, `runGenerate`, `serializeGenerateResponse`（现有 pose_adapter）
- Produces: `POST /node/execute`，body `{node_type, input: {points, meta}, params}` → `{output: {points, meta}}`。`node_type=="pose_generate"` 时调 generate()，其他返回 400。

- [ ] **Step 1: 在 main.cpp 加 `/node/execute` 路由**

打开 `E:\person\project\PoseGenerator\backend\src\main.cpp`，在现有 `svr.Post("/generate", ...)` 路由**之后**、`svr.listen(...)` **之前**插入：

```cpp
    svr.Post("/node/execute", [](const httplib::Request& req, httplib::Response& res) {
        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid JSON\"}", "application/json");
            return;
        }
        std::string node_type = body.value("node_type", "");
        if (node_type != "pose_generate") {
            res.status = 400;
            res.set_content("{\"error\":\"unknown node_type\"}", "application/json");
            return;
        }
        // Build a GenerateRequest-shaped JSON from the /node/execute frame,
        // then reuse the existing adapter. input.points -> points (pos only),
        // input pose fields ignored; params passed through.
        nlohmann::json genReq;
        genReq["points"] = body.value("input", nlohmann::json::object()).value("points", nlohmann::json::array());
        // params may carry initial_pose (rx,ry,rz) merged in by the frontend;
        // pull it out so parseGenerateRequest sees the legacy shape.
        nlohmann::json params = body.value("params", nlohmann::json::object());
        genReq["initial_pose"] = params.value("initial_pose", nlohmann::json::object());
        nlohmann::json paramsWithoutInit = params;
        paramsWithoutInit.erase("initial_pose");
        genReq["params"] = paramsWithoutInit;

        GenerateRequest gr;
        if (!parseGenerateRequest(genReq, gr)) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid request shape\"}", "application/json");
            return;
        }
        if (gr.points.size() < 3) {
            // Library returns input unchanged for <3 points; mirror that.
            GenerateResponse resp;
            resp.result = gr.points;
            nlohmann::json out;
            nlohmann::json arr = nlohmann::json::array();
            for (const auto& pt : resp.result) {
                cv::Point3f pos = pt.toPos();
                arr.push_back({{"x",pos.x},{"y",pos.y},{"z",pos.z},
                               {"rx",0.f},{"ry",0.f},{"rz",0.f}});
            }
            out["output"] = {{"points", arr}, {"meta", nlohmann::json::object()}};
            res.set_content(out.dump(), "application/json");
            return;
        }
        try {
            GenerateResponse resp = runGenerate(gr);
            nlohmann::json out;
            nlohmann::json arr = nlohmann::json::array();
            for (const auto& pt : resp.result) {
                cv::Point3f pos = pt.toPos();
                cv::Point3f rot = pt.toRot();
                arr.push_back({{"x",pos.x},{"y",pos.y},{"z",pos.z},
                               {"rx",rot.x},{"ry",rot.y},{"rz",rot.z}});
            }
            // meta is empty: we do not expose algorithm internals (spec §1.3).
            out["output"] = {{"points", arr}, {"meta", nlohmann::json::object()}};
            res.set_content(out.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });
```

需要在 main.cpp 顶部确保已 `#include "pose_adapter.h"`（现有代码已有）。`cv::Point3f` 通过 `NexusType.h` 间接可用（adapter 已 include）。

- [ ] **Step 2: 构建**

```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target pose_backend
```
Expected: 构建成功，`pose_backend.exe` 输出到 `backend\runtime\`。

- [ ] **Step 3: 启动并 curl 验证**

启动后端（背景）：
```powershell
cd E:\person\project\PoseGenerator\backend\runtime
.\pose_backend.exe
```
curl 三个场景：

```powershell
# (a) 正常 pose_generate
$body = '{"node_type":"pose_generate","input":{"points":[{"x":0,"y":0,"z":0},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"meta":{}},"params":{"curvature_threshold":0.07,"smooth_half_width":2,"tangent_smooth_window":5,"min_corner_region_length":2,"output_mode":0,"max_pose_change_angle":45.0,"all_curve_threshold":0.8,"keypoint_pose_angle_threshold":5.0,"initial_pose":{"rx":0,"ry":45,"rz":178}}}'
curl -X POST http://localhost:8220/node/execute -H "Content-Type: application/json" -d $body
# expected: {"output":{"points":[...3 points with rx/ry/rz...],"meta":{}}}

# (b) 未知 node_type
curl -X POST http://localhost:8220/node/execute -H "Content-Type: application/json" -d '{"node_type":"unknown","input":{"points":[],"meta":{}},"params":{}}'
# expected: HTTP 400 {"error":"unknown node_type"}

# (c) input 带姿态字段被忽略（只取位置）
$body2 = '{"node_type":"pose_generate","input":{"points":[{"x":0,"y":0,"z":0,"rx":99,"ry":99,"rz":99},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"meta":{}},"params":{"output_mode":0,"initial_pose":{"rx":0,"ry":45,"rz":178}}}'
curl -X POST http://localhost:8220/node/execute -H "Content-Type: application/json" -d $body2
# expected: 与 (a) 相同结果（input 的 rx/ry/rz=99 被忽略，姿态由 generate() 算出）
```
停止后端。捕获真实响应写入报告。

- [ ] **Step 4: 确认 /generate 仍可用（回归）**

```powershell
.\pose_backend.exe   # 启动
curl http://localhost:8220/health
curl -X POST http://localhost:8220/generate -H "Content-Type: application/json" -d '{"points":[{"x":0,"y":0,"z":0},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"initial_pose":{"rx":0,"ry":45,"rz":178},"params":{"output_mode":0}}'
```
Expected: `/health` 返回 `{"status":"ok"}`，`/generate` 仍返回 `{result:[...], point_count:3}`。停止后端。

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/src/main.cpp
git commit -m "feat(backend): 新增 /node/execute 统一节点执行接口"
```

---

## Task 2: 前端类型 + PoseFrame 契约

**Files:**
- Modify: `E:\person\project\PoseGenerator\frontend\src\types\index.ts`

**Interfaces:**
- Consumes: 现有 `PosePoint`, `GenerateParams`, `InitialPose`, `DEFAULT_PARAMS`, `DEFAULT_INITIAL_POSE`
- Produces: `PoseFrame`, `NodeParamSpec`, `NodeDef`, `PipelineNode`, `Pipeline`。后续所有任务引用这些类型。

- [ ] **Step 1: 在 types/index.ts 末尾追加新类型**

在 `E:\person\project\PoseGenerator\frontend\src\types\index.ts` 末尾追加（不改动现有内容）：

```ts
// =========================================================================
// 流水线 (Pipeline) 类型
// =========================================================================

/** 节点间数据契约:点序列 + 开放 meta map。 */
export interface PoseFrame {
  points: PosePoint[];
  meta: Record<string, unknown>;
}

/** 空帧(源节点无输入时用)。 */
export const EMPTY_FRAME: PoseFrame = { points: [], meta: {} };

/** 节点参数 schema 项。 */
export interface NodeParamSpec {
  key: string;
  label: string;
  type: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: number; label: string }[];
  default: number;
  /** 拖到偶数自动 +1 (tangent_smooth_window 用)。 */
  forcedOdd?: boolean;
  /** 条件禁用:返回 true 时该参数灰掉。 */
  disabledWhen?: (params: Record<string, number>) => boolean;
  /** 禁用时的提示文案。 */
  disabledHint?: string;
}

/** 执行上下文:前端节点用不到,算法节点用它发后端请求。 */
export interface ExecCtx {
  /** 算法节点调后端的 fetch 函数(便于测试时注入 mock)。 */
  executeNode: (nodeType: string, input: PoseFrame, params: Record<string, number>) => Promise<PoseFrame>;
}

/** 节点定义(注册表项)。 */
export interface NodeDef {
  type: string;
  label: string;
  category: 'io' | 'algorithm' | 'tool';
  isSource: boolean;
  isSink: boolean;
  params: NodeParamSpec[];
  /** input 为 null 表示源节点。返回输出 frame 或抛错。 */
  execute: (input: PoseFrame | null, params: Record<string, number>, ctx: ExecCtx) => Promise<PoseFrame>;
  /** 该节点能可视化哪些 meta key(用户可开关)。第一阶段 pose_generate 为空。 */
  visualizableMeta?: string[];
}

/** 流水线中的一个节点实例。 */
export interface PipelineNode {
  id: string;                       // 实例唯一 id(同一类型可多次出现)
  type: string;                     // 指向 NODE_REGISTRY 的 key
  params: Record<string, number>;   // 按 NodeParamSpec.key 存值
}

/** 一条流水线定义。 */
export interface Pipeline {
  name: string;
  nodes: PipelineNode[];
  builtin?: boolean;
}
```

- [ ] **Step 2: 类型检查**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend/src/types/index.ts
git commit -m "feat(types): 新增 PoseFrame/NodeDef/Pipeline 流水线类型"
```

---

## Task 3: 前端 `/node/execute` API 客户端

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\api\node.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\api\node.test.ts`

**Interfaces:**
- Consumes: `PoseFrame`（Task 2）、`/node/execute` 后端契约（Task 1）。
- Produces: `executeNode(nodeType, input, params, signal?): Promise<PoseFrame>`，供 `nodeRegistry` 的算法节点调用。

- [ ] **Step 1: 写 node.ts**

创建 `E:\person\project\PoseGenerator\frontend\src\api\node.ts`：

```ts
import type { PoseFrame } from '../types';

/**
 * 调后端 /node/execute。algorithm 节点的 execute 函数用这个。
 * signal 用于增量重算时取消进行中的请求(参数又变了)。
 */
export async function executeNode(
  nodeType: string,
  input: PoseFrame,
  params: Record<string, number>,
  signal?: AbortSignal,
): Promise<PoseFrame> {
  const res = await fetch('/node/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_type: nodeType, input, params }),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `node execute failed: ${res.status}`);
  }
  const data = await res.json();
  const output = (data as any).output;
  if (!output || !Array.isArray(output.points)) {
    throw new Error('node execute: malformed output frame');
  }
  return { points: output.points, meta: output.meta ?? {} };
}
```

- [ ] **Step 2: 写 node.test.ts（纯函数测试 fetch 封装）**

创建 `E:\person\project\PoseGenerator\frontend\src\api\node.test.ts`：

```ts
import assert from 'node:assert';

// 用全局 fetch mock 验证 executeNode 的请求体构造与响应解析。
async function run() {
  let captured: { url: string; body: any } | null = null;
  const origFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    captured = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      output: { points: [{ x: 1, y: 2, z: 3, rx: 0, ry: 0, rz: 0 }], meta: {} },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { executeNode } = await import('./node');
    const out = await executeNode('pose_generate',
      { points: [{ x: 0, y: 0, z: 0 }], meta: {} },
      { output_mode: 0 });
    assert(captured!.url === '/node/execute', 'posts to /node/execute');
    assert(captured!.body.node_type === 'pose_generate', 'body has node_type');
    assert(Array.isArray(captured!.body.input.points), 'body has input.points');
    assert(out.points.length === 1, 'parses output points');
    assert(out.meta && typeof out.meta === 'object', 'parses meta (default {})');
  } finally {
    (globalThis as any).fetch = origFetch;
  }
  console.log('node.test OK');
}
run();
```

- [ ] **Step 3: 运行测试**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsx src/api/node.test.ts
```
Expected: `node.test OK`。

- [ ] **Step 4: 类型检查并 Commit**

```powershell
npx tsc --noEmit
git add frontend/src/api/node.ts frontend/src/api/node.test.ts
git commit -m "feat(api): 新增 /node/execute 客户端封装"
```

---

## Task 4: 节点注册表（3 个内置节点）

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\nodeRegistry.ts`

**Interfaces:**
- Consumes: `NodeDef`, `PoseFrame`, `EMPTY_FRAME`, `DEFAULT_PARAMS`, `DEFAULT_INITIAL_POSE`（Task 2/types）；`parseCsvPoints`（csv.ts）；`sendToPathview`（api/pathview.ts）；`executeNode`（Task 3）。
- Produces: `NODE_REGISTRY: Record<string, NodeDef>`，含 `csv_input` / `pose_generate` / `pathview_export` 三项。

- [ ] **Step 1: 写 nodeRegistry.ts**

创建 `E:\person\project\PoseGenerator\frontend\src\lib\nodeRegistry.ts`：

```ts
import type { NodeDef, PoseFrame, NodeParamSpec } from '../types';
import { EMPTY_FRAME, DEFAULT_PARAMS, DEFAULT_INITIAL_POSE } from '../types';
import { parseCsvPoints } from './csv';
import { sendToPathview } from '../api/pathview';

// ---- pose_generate 参数 schema (8 算法参数 + 初始姿态,复用现有默认值) ----
const POSE_GEN_PARAMS: NodeParamSpec[] = [
  { key: 'curvature_threshold', label: 'curvature_threshold', type: 'number', min: 0, max: 0.5, step: 0.001, default: DEFAULT_PARAMS.curvature_threshold },
  { key: 'smooth_half_width', label: 'smooth_half_width', type: 'number', min: 0, max: 50, step: 1, default: DEFAULT_PARAMS.smooth_half_width },
  { key: 'tangent_smooth_window', label: 'tangent_smooth_window', type: 'number', min: 1, max: 51, step: 1, default: DEFAULT_PARAMS.tangent_smooth_window, forcedOdd: true },
  { key: 'min_corner_region_length', label: 'min_corner_region_length', type: 'number', min: 1, max: 50, step: 1, default: DEFAULT_PARAMS.min_corner_region_length },
  { key: 'output_mode', label: 'output_mode', type: 'select', default: 0, options: [{ value: 0, label: 'FULL' }, { value: 1, label: 'KEYPOINTS' }] },
  { key: 'max_pose_change_angle', label: 'max_pose_change_angle', type: 'number', min: 0, max: 180, step: 0.5, default: DEFAULT_PARAMS.max_pose_change_angle },
  { key: 'all_curve_threshold', label: 'all_curve_threshold', type: 'number', min: 0, max: 1, step: 0.01, default: DEFAULT_PARAMS.all_curve_threshold },
  { key: 'keypoint_pose_angle_threshold', label: 'keypoint_pose_angle_threshold', type: 'number', min: 0, max: 90, step: 0.5, default: DEFAULT_PARAMS.keypoint_pose_angle_threshold, disabledWhen: p => p.output_mode !== 1, disabledHint: '仅 KEYPOINTS 模式' },
  // 初始姿态作为 pose_generate 的参数(rx/ry/rz),用 number 类型存度数。
  { key: 'init_rx', label: 'init_rx', type: 'number', min: -180, max: 180, step: 0.5, default: DEFAULT_INITIAL_POSE.rx },
  { key: 'init_ry', label: 'init_ry', type: 'number', min: -180, max: 180, step: 0.5, default: DEFAULT_INITIAL_POSE.ry },
  { key: 'init_rz', label: 'init_rz', type: 'number', min: -180, max: 180, step: 0.5, default: DEFAULT_INITIAL_POSE.rz },
];

// 把节点的扁平 params 转成后端期望的 {算法参数..., initial_pose:{rx,ry,rz}}
function packPoseGenParams(p: Record<string, number>): Record<string, any> {
  const { init_rx, init_ry, init_rz, ...algo } = p;
  return { ...algo, initial_pose: { rx: init_rx, ry: init_ry, rz: init_rz } };
}

// csv_input 的"文件"是交互对象,不进 params。文件文本暂存在模块闭包里,
// 由 NodeCard 调 setFileText 写入,execute 读取。
let csvFileText: { name: string; text: string } | null = null;
export function setCsvFile(name: string, text: string) {
  csvFileText = { name, text };
}

export const NODE_REGISTRY: Record<string, NodeDef> = {
  csv_input: {
    type: 'csv_input',
    label: 'CSV 输入',
    category: 'io',
    isSource: true,
    isSink: false,
    params: [],   // 文件不进 params schema
    async execute(_input, _params, _ctx) {
      if (!csvFileText) {
        return { ...EMPTY_FRAME, meta: { error: '未选择文件' } };
      }
      const res = parseCsvPoints(csvFileText.text);
      if (res.error) {
        return { points: [], meta: { error: res.error, ignored: res.ignored } };
      }
      const points = res.points.map((p, i) => {
        const r = res.rotations?.[i];
        return r ? { ...p, ...r } : { ...p, rx: 0, ry: 0, rz: 0 };
      });
      return { points, meta: { fileName: csvFileText.name, hasRotation: !!res.rotations, ignored: res.ignored } };
    },
  },

  pose_generate: {
    type: 'pose_generate',
    label: '姿态生成',
    category: 'algorithm',
    isSource: false,
    isSink: false,
    params: POSE_GEN_PARAMS,
    async execute(input, params, ctx) {
      if (!input || input.points.length < 3) {
        // 点数不足,原样透传(后端也会透传,但前端短路省一次请求)
        return input ?? EMPTY_FRAME;
      }
      // 前端编排逻辑:若上游首点带真实姿态(非 csv_input 填的 0),
      // 用首点姿态覆盖 params 的初始姿态默认值(spec §6.2 / §7.2 边界)。
      const first = input.points[0];
      const packed = packPoseGenParams(params);
      // 注意:这里不自动用首点姿态覆盖——首点姿态是否"真实"无法可靠判断
      // (csv_input 给无姿态点填了 0)。初始姿态由用户在节点参数里设。
      // (若未来 csv_input 能区分"有姿态"vs"无姿态",再恢复首点覆盖逻辑。)
      void first;
      return ctx.executeNode('pose_generate', input, packed);
    },
    visualizableMeta: [],   // 不改 nexus,无算法中间产物
  },

  pathview_export: {
    type: 'pathview_export',
    label: 'pathview 导出',
    category: 'io',
    isSource: false,
    isSink: true,
    params: [],
    async execute(input, _params, _ctx) {
      if (!input) return EMPTY_FRAME;
      // 副作用:推到 pathview。输出 = 输入(导出不改数据,选中仍可看)。
      await sendToPathview(input.points, String(input.meta?.fileName ?? 'pose'));
      return input;
    },
  },
};

/** 从 NodeDef.params 生成默认 params 对象。 */
export function defaultParamsFor(type: string): Record<string, number> {
  const def = NODE_REGISTRY[type];
  if (!def) return {};
  const out: Record<string, number> = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}

/** 新建一个节点实例(带唯一 id)。 */
export function makeNode(type: string): { id: string; type: string; params: Record<string, number> } {
  // 简单 id:类型+时间戳后4位。够用(单会话内冲突可忽略)。
  const id = `${type}_${Date.now().toString(36).slice(-4)}`;
  return { id, type, params: defaultParamsFor(type) };
}
```

> **关于"首点姿态覆盖"**：spec §6.2 说"若上游首点带姿态，前端用首点姿态覆盖 params 的 initial_pose 默认值"。但 `csv_input` 给无姿态的点填了 `rx:0,ry:0,rz:0`，导致 execute 无法区分"CSV 真带姿态"vs"无姿态被填 0"。**本任务实现里不自动覆盖**——初始姿态由用户在节点参数里设（默认 0/45/178）。这是对 spec 的一个保守实现，记录在代码注释里。若后续要恢复覆盖逻辑，需先让 csv_input 在 meta 里标记 `hasRotation`（已标记），pose_generate 据此判断——但首点未必代表整体，且会与用户手改的初始姿态冲突，故第一阶段不做。

- [ ] **Step 2: 类型检查**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
```
Expected: 无错误。若有 `Date.now` 报错（某些严格配置），`makeNode` 改用 `Math.random().toString(36).slice(2,6)`。

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/lib/nodeRegistry.ts
git commit -m "feat(pipeline): 新增节点注册表与三个内置节点"
```

---

## Task 5: 流水线引擎（增量重算 + 缓存）

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\pipeline.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\pipeline.test.ts`

**Interfaces:**
- Consumes: `Pipeline`, `PipelineNode`, `PoseFrame`, `EMPTY_FRAME`, `NodeDef`（Task 2）；`NODE_REGISTRY`（Task 4）；`executeNode`（Task 3）。
- Produces:
  - `type NodeOutput = PoseFrame | { error: string };`
  - `function runPipeline(nodes: PipelineNode[], fromIndex: number, ctx: ExecCtx, outputs: Record<string, NodeOutput>): Promise<Record<string, NodeOutput>>` — 从 fromIndex 跑到末尾，更新 outputs。
  - `function getOutput(outputs, nodeId): PoseFrame | null` — 取某节点的成功输出（错误返回 null）。

- [ ] **Step 1: 写 pipeline.test.ts（先写测试）**

创建 `E:\person\project\PoseGenerator\frontend\src\lib\pipeline.test.ts`：

```ts
import assert from 'node:assert';
import { runPipeline, getOutput } from './pipeline';
import { NODE_REGISTRY, makeNode } from './nodeRegistry';
import type { PipelineNode, PoseFrame, ExecCtx } from '../types';

// mock executeNode: 记录调用,返回可识别的 frame。
async function run() {
  const calls: string[] = [];
  const ctx: ExecCtx = {
    executeNode: async (nodeType, input, _params) => {
      calls.push(nodeType);
      // 透传 input,加个标记 meta 证明算法节点跑过
      return { points: input.points, meta: { ...input.meta, via: 'backend' } };
    },
  };

  // 造一条 csv_input -> pose_generate 的链(2 节点)
  const csv = makeNode('csv_input');
  const pose = makeNode('pose_generate');
  const nodes: PipelineNode[] = [csv, pose];

  // 注入 csv 文件文本让 csv_input 能解析
  const { setCsvFile } = await import('./nodeRegistry');
  setCsvFile('t.csv', 'x,y,z\n0,0,0\n10,0,0\n20,0,0');

  const outputs = await runPipeline(nodes, 0, ctx, {});
  // csv_input 是源,跑完应有 3 点
  const csvOut = getOutput(outputs, csv.id);
  assert(csvOut && csvOut.points.length === 3, 'csv_input produced 3 points');
  // pose_generate 跑过(调了 executeNode)
  assert(calls.includes('pose_generate'), 'pose_generate executed via backend');
  const poseOut = getOutput(outputs, pose.id);
  assert(poseOut && (poseOut.meta as any).via === 'backend', 'pose_generate output has backend marker');

  // 增量:只重算 csv_input(fromIndex=0),pose_generate 也得重算(它是下游)
  calls.length = 0;
  await runPipeline(nodes, 0, ctx, {});
  assert(calls.includes('pose_generate'), 'rerun from 0 re-executes downstream');

  console.log('pipeline.test OK');
}
run();
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsx src/lib/pipeline.test.ts
```
Expected: FAIL（`runPipeline`/`getOutput` 未定义）。

- [ ] **Step 3: 写 pipeline.ts**

创建 `E:\person\project\PoseGenerator\frontend\src\lib\pipeline.ts`：

```ts
import type { PipelineNode, PoseFrame, ExecCtx } from '../types';
import { EMPTY_FRAME } from '../types';
import { NODE_REGISTRY } from './nodeRegistry';

export type NodeOutput = PoseFrame | { error: string };

/**
 * 从 fromIndex 跑到 nodes 末尾,依次执行节点,更新并返回 outputs。
 * - 上游输出作为下游输入(源节点 input=null)。
 * - 任一节点抛错或返回 error,该节点 outputs 记 error,下游以 EMPTY_FRAME 继续。
 * - 不会跑 fromIndex 之前的节点(增量重算:上游不动)。
 */
export async function runPipeline(
  nodes: PipelineNode[],
  fromIndex: number,
  ctx: ExecCtx,
  outputs: Record<string, NodeOutput>,
): Promise<Record<string, NodeOutput>> {
  const out = { ...outputs };
  let input: PoseFrame | null = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (i < fromIndex) {
      // 上游:从已有 outputs 取输入(若该上游是源则 input 保持 null)
      input = getOutput(out, node.id);
      continue;
    }
    const def = NODE_REGISTRY[node.type];
    if (!def) {
      out[node.id] = { error: `未知节点类型: ${node.type}` };
      input = EMPTY_FRAME;
      continue;
    }
    // 源节点 input=null;否则用上一个成功输出
    const nodeInput = def.isSource ? null : input;
    try {
      const result = await def.execute(nodeInput, node.params, ctx);
      out[node.id] = result;
      input = result;
    } catch (e) {
      out[node.id] = { error: (e as Error).message };
      input = EMPTY_FRAME;
    }
  }
  return out;
}

/** 取某节点的成功输出;若是 error 或不存在,返回 null。 */
export function getOutput(outputs: Record<string, NodeOutput>, nodeId: string): PoseFrame | null {
  const o = outputs[nodeId];
  if (!o || 'error' in o) return null;
  return o;
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
npx tsx src/lib/pipeline.test.ts
```
Expected: `pipeline.test OK`。

- [ ] **Step 5: 类型检查并 Commit**

```powershell
npx tsc --noEmit
git add frontend/src/lib/pipeline.ts frontend/src/lib/pipeline.test.ts
git commit -m "feat(pipeline): 实现增量重算引擎与输出缓存"
```

---

## Task 6: 多流水线 localStorage 持久化

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\pipelinesStore.ts`

**Interfaces:**
- Consumes: `Pipeline`（Task 2）；`NODE_REGISTRY` / `defaultParamsFor`（Task 4，用于造内置默认流水线）。
- Produces: `BUILTIN_PIPELINES: Pipeline[]`，`loadPipelines()`，`savePipeline(p)`，`deletePipeline(name)`。

- [ ] **Step 1: 写 pipelinesStore.ts**

创建 `E:\person\project\PoseGenerator\frontend\src\lib\pipelinesStore.ts`：

```ts
import type { Pipeline } from '../types';
import { makeNode } from './nodeRegistry';

const STORAGE_KEY = 'pose_generator_pipelines';

/** 内置默认流水线:csv_input -> pose_generate -> pathview_export。 */
export const BUILTIN_PIPELINES: Pipeline[] = [
  {
    name: '默认',
    nodes: [
      makeNode('csv_input'),
      makeNode('pose_generate'),
      makeNode('pathview_export'),
    ],
    builtin: true,
  },
];

export function loadPipelines(): Pipeline[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Pipeline[];
    return arr.filter(p => p && p.name && Array.isArray(p.nodes));
  } catch { return []; }
}

export function savePipeline(p: Pipeline): Pipeline[] {
  const list = loadPipelines().filter(x => x.name !== p.name);
  list.push({ ...p, builtin: false });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function deletePipeline(name: string): Pipeline[] {
  const list = loadPipelines().filter(x => x.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}
```

- [ ] **Step 2: 类型检查**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/lib/pipelinesStore.ts
git commit -m "feat(pipeline): 多流水线 localStorage 持久化"
```

---

## Task 7: usePipeline hook（引擎 + React 粘合）

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\hooks\usePipeline.ts`

**Interfaces:**
- Consumes: `runPipeline` / `getOutput` / `NodeOutput`（Task 5）；`NODE_REGISTRY` / `makeNode` / `setCsvFile`（Task 4）；`BUILTIN_PIPELINES` / `loadPipelines` / `savePipeline` / `deletePipeline`（Task 6）；`executeNode`（Task 3）。
- Produces: `usePipeline()` hook 返回 `{ pipeline, outputs, selectedNodeId, actions, loading }`，供 App 使用。

- [ ] **Step 1: 写 usePipeline.ts**

创建 `E:\person\project\PoseGenerator\frontend\src\hooks\usePipeline.ts`：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pipeline, PoseFrame, ExecCtx } from '../types';
import { EMPTY_FRAME } from '../types';
import { runPipeline, getOutput, type NodeOutput } from '../lib/pipeline';
import { NODE_REGISTRY, makeNode, setCsvFile } from '../lib/nodeRegistry';
import { BUILTIN_PIPELINES, loadPipelines, savePipeline, deletePipeline } from '../lib/pipelinesStore';
import { executeNode as apiExecuteNode } from '../api/node';

const DEBOUNCE_MS = 300;

export function usePipeline() {
  const [pipeline, setPipeline] = useState<Pipeline>(BUILTIN_PIPELINES[0]);
  const [outputs, setOutputs] = useState<Record<string, NodeOutput>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx: ExecCtx = {
    executeNode: (nodeType, input, params) => apiExecuteNode(nodeType, input, params, abortRef.current?.signal),
  };

  // 跑流水线:从 fromIndex 开始。可选立即跑(不等 debounce)。
  const run = useCallback(async (nodes: Pipeline['nodes'], fromIndex: number, immediate = false) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const doRun = async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const out = await runPipeline(nodes, fromIndex, ctx, {});
        setOutputs(out);
      } finally {
        setLoading(false);
      }
    };
    if (immediate) {
      await doRun();
    } else {
      debounceTimer.current = setTimeout(doRun, DEBOUNCE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 节点参数变更:标记该节点及下游脏,debounce 重算。
  const updateNodeParams = useCallback((nodeId: string, patch: Record<string, number>) => {
    setPipeline(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      if (idx < 0) return prev;
      const nodes = prev.nodes.map((n, i) =>
        i === idx ? { ...n, params: { ...n.params, ...patch } } : n
      );
      run(nodes, idx);
      return { ...prev, nodes };
    });
  }, [run]);

  // CSV 文件载入:写文本 + 触发 csv_input 重算(及下游)
  const loadCsv = useCallback((name: string, text: string) => {
    setCsvFile(name, text);
    setPipeline(prev => {
      const csvNode = prev.nodes.find(n => n.type === 'csv_input');
      if (csvNode) run(prev.nodes, prev.nodes.indexOf(csvNode));
      return prev;
    });
  }, [run]);

  // 增删/移动节点
  const addNode = useCallback((type: string, afterId?: string) => {
    setPipeline(prev => {
      const node = makeNode(type);
      let nodes: typeof prev.nodes;
      if (afterId) {
        const idx = prev.nodes.findIndex(n => n.id === afterId);
        nodes = [...prev.nodes.slice(0, idx + 1), node, ...prev.nodes.slice(idx + 1)];
      } else {
        nodes = [...prev.nodes, node];
      }
      const insertIdx = afterId ? prev.nodes.findIndex(n => n.id === afterId) + 1 : nodes.length - 1;
      run(nodes, insertIdx);
      return { ...prev, nodes };
    });
  }, [run]);

  const removeNode = useCallback((nodeId: string) => {
    setPipeline(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      if (idx < 0) return prev;
      const nodes = prev.nodes.filter(n => n.id !== nodeId);
      // 重算从被删节点的上游(若有)或新的同位置节点开始
      const fromIdx = Math.max(0, idx - 1);
      run(nodes, fromIdx);
      return { ...prev, nodes };
    });
  }, [run]);

  const moveNode = useCallback((nodeId: string, dir: -1 | 1) => {
    setPipeline(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.nodes.length) return prev;
      const nodes = [...prev.nodes];
      [nodes[idx], nodes[target]] = [nodes[target], nodes[idx]];
      run(nodes, Math.min(idx, target));
      return { ...prev, nodes };
    });
  }, [run]);

  // 运行全部(立即,从头)
  const runAll = useCallback(() => {
    run(pipeline.nodes, 0, true);
  }, [pipeline.nodes, run]);

  // 选中节点(默认选末节点)
  useEffect(() => {
    if (!selectedNodeId && pipeline.nodes.length > 0) {
      setSelectedNodeId(pipeline.nodes[pipeline.nodes.length - 1].id);
    }
  }, [pipeline.nodes, selectedNodeId]);

  // 流水线切换/保存/删除
  const selectPipeline = useCallback((p: Pipeline) => {
    setPipeline(p);
    setOutputs({});
    setSelectedNodeId(p.nodes[p.nodes.length - 1]?.id ?? null);
    run(p.nodes, 0, true);
  }, [run]);

  const saveCurrentAs = useCallback((name: string) => {
    const p: Pipeline = { name, nodes: pipeline.nodes.map(n => ({ ...n, params: { ...n.params } })) };
    savePipeline(p);
  }, [pipeline]);

  const removePipeline = useCallback((name: string) => {
    deletePipeline(name);
  }, []);

  const selectedOutput: PoseFrame | null = selectedNodeId ? getOutput(outputs, selectedNodeId) : null;

  return {
    pipeline,
    outputs,
    selectedNodeId,
    selectedOutput,
    loading,
    customPipelines: loadPipelines(),
    builtinPipelines: BUILTIN_PIPELINES,
    actions: {
      setSelectedNodeId,
      updateNodeParams,
      loadCsv,
      addNode,
      removeNode,
      moveNode,
      runAll,
      selectPipeline,
      saveCurrentAs,
      removePipeline,
    },
  };
}
```

> 注意：`run` 用闭包捕获最新的 `ctx`（含最新 abort signal）。`runPipeline` 第三参 `ctx` 每次新建会拿到当前 abortRef。状态更新用函数式 `setPipeline(prev => ...)` 避免闭包陈旧。

- [ ] **Step 2: 类型检查**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/hooks/usePipeline.ts
git commit -m "feat(pipeline): usePipeline hook 串联引擎与 React state"
```

---

## Task 8: 节点卡片 NodeCard + 节点链 NodeChain

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\components\NodeCard.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\NodeChain.tsx`
- Modify: `E:\person\project\PoseGenerator\frontend\src\App.css`（追加节点链样式）

**Interfaces:**
- Consumes: `NodeDef`, `PipelineNode`, `NodeOutput`（Task 2/5）；`NODE_REGISTRY`（Task 4）；`usePipeline` actions（Task 7）。
- Produces: `NodeChain`（纵向节点链容器）、`NodeCard`（单节点卡片）。

- [ ] **Step 1: 写 NodeCard.tsx**

创建 `E:\person\project\PoseGenerator\frontend\src\components\NodeCard.tsx`：

```tsx
import { useState } from 'react';
import type { PipelineNode, NodeOutput, PoseFrame } from '../types';
import { NODE_REGISTRY } from '../lib/nodeRegistry';

interface Props {
  node: PipelineNode;
  output: NodeOutput | undefined;
  selected: boolean;
  onSelect: () => void;
  onParams: (patch: Record<string, number>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onCsvFile: (name: string, text: string) => void;
}

function NumCtrl(p: {
  spec: import('../types').NodeParamSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  const { spec, value, onChange } = p;
  const disabled = spec.disabledWhen ? spec.disabledWhen({ [spec.key]: value }) : false;
  const set = (v: number) => {
    if (spec.forcedOdd) {
      const i = Math.max(1, Math.round(v));
      onChange(i % 2 === 0 ? i + 1 : i);
    } else {
      onChange(v);
    }
  };
  if (spec.type === 'select') {
    return (
      <div className="ctrl compact">
        <label>
          <span className="ctrl-name">{spec.label}</span>
          <select value={value} disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}>
            {spec.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
    );
  }
  return (
    <div className={`ctrl compact${disabled ? ' is-disabled' : ''}`}>
      <label>
        <span className="ctrl-name">
          {spec.label}
          {disabled && spec.disabledHint && <span className="hint">{spec.disabledHint}</span>}
        </span>
        <input type="number" min={spec.min} max={spec.max} step={spec.step} value={value}
          disabled={disabled}
          onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set(n); }} />
      </label>
      <input type="range" min={spec.min} max={spec.max} step={spec.step} value={value}
        disabled={disabled}
        onChange={e => set(parseFloat(e.target.value))}
        aria-label={spec.label} />
    </div>
  );
}

export function NodeCard({ node, output, selected, onSelect, onParams, onRemove, onMove, onCsvFile }: Props) {
  const [expanded, setExpanded] = useState(true);
  const def = NODE_REGISTRY[node.type];
  if (!def) return <div className="node-card">未知节点: {node.type}</div>;

  const frame: PoseFrame | null = output && !('error' in output) ? output : null;
  const err: string | null = output && 'error' in output ? output.error : null;
  const inCount = frame?.points.length ?? 0;  // 输出点数(卡片显示自己输出)

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => onCsvFile(f.name, String(reader.result ?? ''));
    reader.readAsText(f);
  };

  return (
    <div className={`node-card${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <div className="nc-head">
        <span className="nc-dot" />
        <span className="nc-label">{def.label}</span>
        <span className="nc-cat">{def.category}</span>
        {err
          ? <span className="nc-status nc-err">错误</span>
          : <span className="nc-status">{inCount} pts</span>}
        <button className="nc-toggle" onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}>
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="nc-body">
          {/* 源节点:文件选择 */}
          {def.isSource && (
            <label className="nc-file">
              <input type="file" accept=".csv,text/csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              <span>{(frame?.meta as any)?.fileName ?? '选择 CSV / 拖入'}</span>
              {(frame?.meta as any)?.hasRotation && <span className="hint"> 含姿态</span>}
            </label>
          )}
          {/* 算法/工具节点:参数 */}
          {def.params.map(spec => (
            <NumCtrl key={spec.key} spec={spec} value={node.params[spec.key] ?? spec.default}
              onChange={v => onParams({ [spec.key]: v })} />
          ))}
          {/* 终点节点:导出按钮 */}
          {def.isSink && (
            <button className="nc-export" onClick={e => { e.stopPropagation(); }}
              disabled={!frame || frame.points.length === 0}>
              推送到 pathview
            </button>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      )}
      <div className="nc-actions" onClick={e => e.stopPropagation()}>
        <button onClick={() => onMove(-1)} title="上移">↑</button>
        <button onClick={() => onMove(1)} title="下移">↓</button>
        <button onClick={onRemove} title="删除">×</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 NodeChain.tsx**

创建 `E:\person\project\PoseGenerator\frontend\src\components\NodeChain.tsx`：

```tsx
import type { PipelineNode, NodeOutput } from '../types';
import { NODE_REGISTRY } from '../lib/nodeRegistry';
import { NodeCard } from './NodeCard';

interface Props {
  nodes: PipelineNode[];
  outputs: Record<string, NodeOutput>;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onParams: (id: string, patch: Record<string, number>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAddNode: (type: string, afterId?: string) => void;
  onCsvFile: (id: string, name: string, text: string) => void;
}

export function NodeChain(props: Props) {
  const { nodes, outputs, selectedNodeId } = props;
  const addableTypes = Object.values(NODE_REGISTRY).map(d => ({ type: d.type, label: d.label }));

  return (
    <div className="node-chain">
      {nodes.map((n, i) => (
        <div key={n.id} className="node-slot">
          <NodeCard
            node={n}
            output={outputs[n.id]}
            selected={selectedNodeId === n.id}
            onSelect={() => props.onSelect(n.id)}
            onParams={patch => props.onParams(n.id, patch)}
            onRemove={() => props.onRemove(n.id)}
            onMove={dir => props.onMove(n.id, dir)}
            onCsvFile={(name, text) => props.onCsvFile(n.id, name, text)}
          />
          {/* 节点间"添加"按钮 */}
          <div className="node-add">
            {addableTypes.map(t => (
              <button key={t.type} onClick={() => props.onAddNode(t.type, n.id)} title={`在之后插入 ${t.label}`}>
                + {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {nodes.length === 0 && <div className="node-empty">流水线为空,从下方添加节点。</div>}
      {/* 链尾添加 */}
      <div className="node-add node-add-tail">
        {addableTypes.map(t => (
          <button key={t.type} onClick={() => props.onAddNode(t.type)}>+ {t.label}</button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 追加 App.css 节点链样式**

在 `E:\person\project\PoseGenerator\frontend\src\App.css` 末尾追加：

```css
/* --- 节点链 ----------------------------------------------------------- */
.node-chain { display: flex; flex-direction: column; gap: 0; }
.node-slot { display: flex; flex-direction: column; }
.node-card {
  background: linear-gradient(180deg, var(--bg-panel-2), var(--bg-panel));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}
.node-card.is-selected { border-color: var(--arc); box-shadow: 0 0 0 1px var(--arc) inset; }
.nc-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-inset); border-bottom: 1px solid var(--line); }
.nc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--data); }
.nc-label { font-family: var(--display); font-weight: 700; font-size: 13px; }
.nc-cat { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); padding: 1px 5px; border: 1px solid var(--line); border-radius: 2px; }
.nc-status { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--ink-dim); }
.nc-status.nc-err { color: var(--danger); }
.nc-toggle { padding: 2px 6px; background: transparent; border: none; color: var(--ink-dim); cursor: pointer; }
.nc-body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.nc-file { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-family: var(--mono); font-size: 11px; color: var(--ink-dim); }
.nc-file input[type='file'] { position: absolute; width: 1px; height: 1px; opacity: 0; }
.nc-export { width: 100%; padding: 8px; background: var(--arc); border: 1px solid var(--arc); border-radius: 2px; color: var(--bg-void); font-family: var(--display); font-weight: 700; cursor: pointer; }
.nc-export:disabled { background: var(--bg-inset); border-color: var(--line); color: var(--ink-faint); cursor: not-allowed; }
.nc-actions { display: flex; gap: 4px; padding: 4px 10px 8px; }
.nc-actions button { padding: 2px 8px; font-size: 11px; }
.node-add { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0; }
.node-add button { padding: 3px 8px; font-size: 10px; }
.node-add-tail { padding-top: 10px; border-top: 1px dashed var(--line); margin-top: 8px; }
.node-empty { padding: 24px; color: var(--ink-faint); font-family: var(--mono); font-size: 11px; text-align: center; }
```

- [ ] **Step 4: 类型检查并 Commit**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
git add frontend/src/components/NodeCard.tsx frontend/src/components/NodeChain.tsx frontend/src/App.css
git commit -m "feat(pipeline): 节点链 NodeChain 与节点卡片 NodeCard"
```

---

## Task 9: NodeResult + PipelineBar + App 组装

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\components\NodeResult.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\PipelineBar.tsx`
- Modify: `E:\person\project\PoseGenerator\frontend\src\App.tsx`
- Modify: `E:\person\project\PoseGenerator\frontend\src\App.css`（追加结果区/底栏样式）

**Interfaces:**
- Consumes: `usePipeline`（Task 7）；`Preview2D` / `PoseTable` / `BackendStatus`（现有）；`NodeChain`（Task 8）。
- Produces: 完整流水线 UI。

- [ ] **Step 1: 写 NodeResult.tsx**

创建 `E:\person\project\PoseGenerator\frontend\src\components\NodeResult.tsx`：

```tsx
import type { PoseFrame } from '../types';
import { Preview2D } from './Preview2D';
import { PoseTable } from './PoseTable';

export function NodeResult({ frame, loading }: { frame: PoseFrame | null; loading: boolean }) {
  const points = frame?.points ?? [];
  return (
    <div className="panel preview-panel">
      <div className="panel-head panel-head-row">
        <span className="title">节点输出 · 2D 投影</span>
        <span className="badge">
          {points.length} PTS
          {loading && <span className="loading-dot" aria-label="计算中" />}
        </span>
      </div>
      <div className="panel-body">
        <Preview2D points={points} />
      </div>
      <div className="panel">
        <div className="panel-head"><span className="title">位姿数据流</span><span className="badge">{points.length} × 6</span></div>
        <PoseTable points={points} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 PipelineBar.tsx**

创建 `E:\person\project\PoseGenerator\frontend\src\components\PipelineBar.tsx`：

```tsx
import { useState } from 'react';
import type { Pipeline } from '../types';
import { BackendStatus } from './BackendStatus';

interface Props {
  current: Pipeline;
  builtinPipelines: Pipeline[];
  customPipelines: Pipeline[];
  onSelect: (p: Pipeline) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  onRunAll: () => void;
  loading: boolean;
}

export function PipelineBar(props: Props) {
  const { current, builtinPipelines, customPipelines } = props;
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');

  const save = () => {
    const name = draft.trim();
    if (!name) { setNaming(false); return; }
    props.onSave(name);
    setNaming(false); setDraft('');
  };

  return (
    <div className="pipeline-bar action-bar">
      <span className="pb-label">流水线</span>
      {builtinPipelines.map(p => (
        <button key={p.name} className={current.name === p.name ? 'seg-on' : ''} onClick={() => props.onSelect(p)}>{p.name}</button>
      ))}
      {customPipelines.length > 0 && <span className="preset-sep" aria-hidden="true" />}
      {customPipelines.map(p => (
        <span key={p.name} className="preset-item">
          <button className={current.name === p.name ? 'seg-on' : ''} onClick={() => props.onSelect(p)}>{p.name}</button>
          <button className="del" onClick={() => props.onDelete(p.name)} aria-label={`删除 ${p.name}`}>×</button>
        </span>
      ))}
      {naming ? (
        <span className="preset-name-input">
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); }}
            placeholder="流水线名称" autoFocus />
          <button className="primary" onClick={save} disabled={!draft.trim()}>保存</button>
          <button onClick={() => setNaming(false)}>取消</button>
        </span>
      ) : (
        <button onClick={() => { setNaming(true); setDraft(current.name === '默认' ? '我的流水线' : current.name); }}>+ 保存当前</button>
      )}
      <span className="preset-sep" aria-hidden="true" />
      <button className="pb-run" onClick={props.onRunAll} disabled={props.loading}>{props.loading ? '运行中…' : '运行全部'}</button>
      <span style={{ marginLeft: 'auto' }}><BackendStatus /></span>
    </div>
  );
}
```

- [ ] **Step 3: 重写 App.tsx**

替换 `E:\person\project\PoseGenerator\frontend\src\App.tsx` 全部内容：

```tsx
import { usePipeline } from './hooks/usePipeline';
import { NodeChain } from './components/NodeChain';
import { NodeResult } from './components/NodeResult';
import { PipelineBar } from './components/PipelineBar';

export default function App() {
  const { pipeline, outputs, selectedNodeId, selectedOutput, loading,
    builtinPipelines, customPipelines, actions } = usePipeline();

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>PoseGenerator<span className="sub">点位流水线 · ZYX</span></h1>
        </div>
      </header>

      <div className="layout">
        <aside className="left">
          <div className="panel">
            <div className="panel-head"><span className="title">节点链</span><span className="badge">{pipeline.nodes.length} 节点</span></div>
            <div className="panel-body">
              <NodeChain
                nodes={pipeline.nodes}
                outputs={outputs}
                selectedNodeId={selectedNodeId}
                onSelect={actions.setSelectedNodeId}
                onParams={actions.updateNodeParams}
                onRemove={actions.removeNode}
                onMove={actions.moveNode}
                onAddNode={actions.addNode}
                onCsvFile={(_id, name, text) => actions.loadCsv(name, text)}
              />
            </div>
          </div>
        </aside>

        <main className="right">
          <NodeResult frame={selectedOutput} loading={loading} />
        </main>
      </div>

      <PipelineBar
        current={pipeline}
        builtinPipelines={builtinPipelines}
        customPipelines={customPipelines}
        onSelect={actions.selectPipeline}
        onSave={actions.saveCurrentAs}
        onDelete={actions.removePipeline}
        onRunAll={actions.runAll}
        loading={loading}
      />
    </div>
  );
}
```

- [ ] **Step 4: 追加 App.css 结果区/底栏样式**

在 `E:\person\project\PoseGenerator\frontend\src\App.css` 末尾追加：

```css
/* --- 流水线底栏 ------------------------------------------------------- */
.pipeline-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pb-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); }
.pb-run { background: var(--arc); border: 1px solid var(--arc); color: var(--bg-void); font-family: var(--display); font-weight: 700; padding: 6px 14px; }
.pb-run:disabled { background: var(--bg-inset); border-color: var(--line); color: var(--ink-faint); }
.layout { grid-template-columns: 420px minmax(0, 1fr); }
```

- [ ] **Step 5: 类型检查 + 构建**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
npm run build
```
Expected: tsc 干净；vite build 产出 dist/ 无错误。

- [ ] **Step 6: 端到端手动验证**

启动 pose_backend（`backend\runtime\pose_backend.exe`）、pathview（3001/5173 已在跑）、前端（`npm run dev`，5174）。浏览器打开 5174：
1. 默认流水线载入（csv_input → pose_generate → pathview_export）。
2. 在 csv_input 卡片选一个 CSV（用 `frontend/public/corrugated_sample.csv`）。
3. 选中 pose_generate 卡片 → 应在右侧 NodeResult 看到算法生成的姿态（2D 投影+数值表）。
4. 拖 pose_generate 的 curvature_threshold 滑块 → 300ms 后右侧结果刷新。
5. 选中 pathview_export 卡片 → 点"推送到 pathview" → 新标签打开 5173，新路径在列表顶部。
6. 点"+ 保存当前"存一条自定义流水线 → 刷新页面后仍在。

Expected: 全流程通过。

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/components/NodeResult.tsx frontend/src/components/PipelineBar.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat(pipeline): 组装流水线主界面,打通节点链到结果展示全流程"
```

---

## Task 10: 回归验证 + 清理

**Files:**
- 无新文件；验证现有测试与端到端。

**目的**：确认流水线改造未破坏既有能力，清理迁移期遗留。

- [ ] **Step 1: 跑全部前端单测**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsx src/lib/euler.test.ts
npx tsx src/lib/csv.test.ts
npx tsx src/api/node.test.ts
npx tsx src/lib/pipeline.test.ts
```
Expected: 四个测试全 OK。

- [ ] **Step 2: 确认 `/generate` 仍可用（后端回归）**

启动 pose_backend：
```powershell
curl http://localhost:8220/health
curl -X POST http://localhost:8220/generate -H "Content-Type: application/json" -d '{"points":[{"x":0,"y":0,"z":0},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"initial_pose":{"rx":0,"ry":45,"rz":178},"params":{"output_mode":0}}'
```
Expected: `/health` ok；`/generate` 返回 `{result:[...], point_count:3}`。停止后端。

- [ ] **Step 3: 确认 test_adapter 仍通过**

```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target test_adapter
.\runtime\test_adapter.exe
```
Expected: `test_adapter OK`。

- [ ] **Step 4: 记录迁移状态**

`/generate` 保留（迁移期兼容）。前端已全走 `/node/execute`。无需改代码，仅在 `backend/README.md` 末尾追加一行说明：

在 `E:\person\project\PoseGenerator\backend\README.md` 末尾追加：
```markdown

## 节点执行接口
`POST /node/execute`：统一节点执行接口，body `{node_type, input, params}` → `{output}`。第一阶段支持 `node_type=pose_generate`。`POST /generate` 为迁移期兼容保留。
```

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/README.md
git commit -m "docs(backend): 记录 /node/execute 接口与迁移期兼容策略"
```

---

## Self-Review

**1. Spec coverage:**
- §2.1 PoseFrame 契约 → Task 2（类型）+ Task 5（引擎用它）。
- §2.2/2.3 NodeDef + NODE_REGISTRY → Task 2（类型）+ Task 4（注册表）。
- §3.1 前端编排+混合执行 → Task 7（usePipeline 编排）+ Task 4（execute 分前端/后端）。
- §3.2 增量重算（C+a）→ Task 5（runPipeline fromIndex）+ Task 7（debounce 300ms + abort）。
- §3.3 选中节点可视化（B）→ Task 7（selectedNodeId/selectedOutput）+ Task 9（NodeResult）。
- §3.4 `/node/execute` 后端 → Task 1。
- §4 节点 UI（纵向链+内联参数）→ Task 8（NodeChain/NodeCard）。
- §5 多流水线 localStorage → Task 6。
- §6 三个内置节点 → Task 4（csv_input/pose_generate/pathview_export）。
- §7 后端改动 → Task 1。
- §8 前端目录 → Tasks 2-9 全覆盖。
- §1.3 不改 nexus / meta 为空 → Task 4（pose_generate visualizableMeta: []）+ Task 1（meta: {}）。
- §10 不做（工具节点/动态发现/DAG）→ 计划未涉及，符合 YAGNI。

**2. Placeholder scan:** 无 TBD/TODO。"首点姿态覆盖"在 Task 4 有明确说明为何不实现（csv_input 填 0 无法区分），是有据的保守实现，非占位符。

**3. Type consistency:**
- `PoseFrame` / `NodeDef` / `PipelineNode` / `Pipeline`（Task 2）→ 全后续任务引用一致。
- `runPipeline(nodes, fromIndex, ctx, outputs)` / `getOutput(outputs, nodeId)`（Task 5）→ Task 7 调用签名一致。
- `executeNode(nodeType, input, params, signal?)`（Task 3）→ Task 7 ctx 调用一致。
- `usePipeline()` 返回结构（Task 7）→ Task 9 App 解构一致（pipeline/outputs/selectedNodeId/selectedOutput/loading/builtinPipelines/customPipelines/actions）。
- `NODE_REGISTRY` / `makeNode` / `setCsvFile` / `defaultParamsFor`（Task 4）→ Tasks 5/6/7/8 调用一致。

无类型/签名不一致。

**4. Scope check:** 单一子系统（流水线引擎+UI+后端接口），无需拆分。
