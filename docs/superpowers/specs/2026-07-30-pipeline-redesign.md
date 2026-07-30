# 点位处理流水线改造设计文档

> 把当前"单一姿态生成工具"升级为"点位处理流水线"：可插拔算法节点、纵向串行编排、每节点显示结果。

- 文档日期：2026-07-30
- 基线：当前项目（C++ 后端 `pose_backend` + React 前端 + pathview 外部展示）
- 前序 spec：`2026-07-29-pose-visualizer-design.md`

---

## 1. 目标与范围

### 1.1 要解决的问题

当前项目是写死的"CSV → generate → pathview"单链路。用户无法插入额外的处理步骤（下采样、平滑、反向、坐标变换），也无法对比"同一算法在不同参数链路上的结果"。本设计把项目重构为**点位处理流水线**：节点是可插拔的数据变换步骤，纵向串行编排，每个节点的输出都可单独查看。

### 1.2 第一阶段范围

- 内置 3 个节点：`csv_input` / `pose_generate` / `pathview_export`，覆盖当前能力。
- 流水线引擎：节点链 + 增量重算 + 节点输出缓存 + 选中节点可视化。
- 后端统一节点执行接口 `/node/execute`（第一阶段只支持 `pose_generate`）。
- 多流水线持久化（localStorage，复用参数预设模式）。
- 不做的：工具节点（下采样/平滑/反向等）后续增量加；后端算法节点动态发现；运行时自定义节点；改 nexus 库暴露算法中间产物。

### 1.3 不改 nexus 库（关键约束）

姿态生成节点（`pose_generate`）的 `meta` **为空**——只返回最终点+姿态，不显算法内部状态（角点/分段/过渡区/曲率）。理由：这些状态目前是 `generate()` 的私有局部变量，无公开 API；要拿到必须改 nexus 加只读 `analyze()`，本设计明确**不改生产库**。代价：姿态生成节点无法可视化算法内部决策过程。未来若需要，回头走"加 `analyze()`"路径。

---

## 2. 核心数据结构

### 2.1 PoseFrame —— 节点间数据契约

节点间统一传 `PoseFrame`：

```ts
interface PoseFrame {
  points: PosePoint[];   // 带可选姿态的点序列（x,y,z,rx?,ry?,rz?）
  meta: Record<string, unknown>;  // 开放 map，节点塞中间产物供下游/可视化
}
```

- `points`：主数据流。姿态字段 `rx/ry/rz` 可选（CSV 原始数据可能无姿态，pose_generate 节点输出带姿态）。
- `meta`：开放 map。节点可往里塞任意中间产物（如 `meta.is_closed`、`meta.segments`），下游节点按 key 取，前端可视化按 key 查。第一阶段 pose_generate 的 meta 为空（见 1.3）。

### 2.2 节点定义（注册表项）

```ts
interface NodeParamSpec {
  key: string;
  label: string;
  type: 'number' | 'select' | 'toggle';
  min?: number; max?: number; step?: number;
  options?: { value: number; label: string }[];
  default: number;
  /** UI 行为：强制奇数、条件禁用等 */
  forcedOdd?: boolean;
  disabledWhen?: (params: Record<string, number>) => boolean;
}

interface NodeDef {
  type: string;                // 'csv_input' | 'pose_generate' | ...
  label: string;
  category: 'io' | 'algorithm' | 'tool';
  /** 输入契约：true 表示该节点接受无上游的输入（流水线起点） */
  isSource: boolean;
  /** 输出契约：true 表示该节点是终点（不再喂下游） */
  isSink: boolean;
  /** 参数 schema */
  params: NodeParamSpec[];
  /**
   * 执行函数。input 为 null 表示该节点是源节点（无上游）。
   * 返回输出 PoseFrame，或抛错。
   * 实现分两路：纯前端节点同步返回；算法节点发后端请求（async）。
   */
  execute: (input: PoseFrame | null, params: Record<string, number>, ctx: ExecCtx) => Promise<PoseFrame>;
  /** 该节点能可视化哪些 meta key（可选，用户可开关） */
  visualizableMeta?: string[];
}
```

### 2.3 节点注册表

```ts
const NODE_REGISTRY: Record<string, NodeDef> = {
  csv_input: { ... },
  pose_generate: { ... },
  pathview_export: { ... },
};
```

第一阶段三项。加新节点 = 往注册表加项 + 提供执行函数。

---

## 3. 架构

### 3.1 总览

```
┌──────────────────────────────────────────────────────────────────┐
│ 前端 (React + Vite, 5174)                                         │
│                                                                   │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐ │
│  │ 流水线编辑器     │   │ 流水线引擎       │   │ 节点可视化       │ │
│  │ (纵向节点链)     │   │ (增量重算+缓存)  │   │ (选中节点结果)   │ │
│  └────────┬────────┘   └────────┬────────┘   └─────────────────┘ │
│           │ 编排                   │ 执行分发                          │
│           v                       v                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 节点执行器                                                   │ │
│  │  - 纯前端节点: 同步跑 (csv_input / pathview_export / tool)   │ │
│  │  - 算法节点: POST /node/execute (pose_generate)             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│           │                         │                              │
│  localStorage (流水线定义)        Vite proxy                      │
└──────────┼─────────────────────────┼──────────────────────────────┘
            │                         │
            ▼                         ▼
┌────────────────────┐    ┌──────────────────────────────────────────┐
│ pose_backend (8220) │    │ pathview (3001/5173, 外部, 不改)         │
│ POST /node/execute  │    │ POST /api/paths                          │
│ 按 node_type 分发    │    └──────────────────────────────────────────┘
└────────────────────┘
```

### 3.2 前端编排 + 混合执行（C）

- **编排在前端**：流水线定义（节点列表 + 顺序 + 各节点参数 + 节点 id）是用户交互对象，存前端 state / localStorage。后端不持有会话状态。
- **执行分两路**：
  - 纯前端节点（`csv_input` / `pathview_export` / 未来的工具节点）：执行函数同步在前端跑。
  - 算法节点（`pose_generate`）：执行函数发 `POST /node/execute` 给后端，后端调 nexus 库返回结果。

### 3.3 后端统一节点执行（选项 2）

新增 `POST /node/execute`：

```
请求:
{
  "node_type": "pose_generate",
  "input": { "points": [{x,y,z,rx?,ry?,rz?}, ...], "meta": {} },
  "params": { "curvature_threshold": 0.07, ... }
}

响应:
{
  "output": { "points": [{x,y,z,rx,ry,rz}, ...], "meta": {} }
}
```

- 按 `node_type` 分发到对应后端实现。第一阶段只认 `"pose_generate"`。
- `pose_generate` 实现：从 input frame 取 points（仅位置，姿态忽略），用 params 构造 `Params`（复用现有 `pose_adapter` 的参数解析），调 `generate()`，输出 frame 带 points+姿态，`meta` 为空（见 1.3）。
- 现有 `POST /generate` **保留**作为兼容（当前前端迁移期间仍用，迁移完成后可移除或保留为 alias）。
- `GET /health` 保留。

### 3.4 增量重算（C + a）

任意节点或其参数变更时：

1. 标记该节点及**全部下游**节点为脏（输出缓存失效）。
2. 按拓扑序（链式即顺序）重算脏节点：
   - 纯前端节点：即时重算。
   - 算法节点：debounce 300ms，若 debounce 内参数又变，**取消进行中的请求**，用最新参数重发（与当前 `useGenerate` 行为一致）。
3. 每个节点重算完缓存其输出 frame。
4. 若用户当前选中的是脏节点，重算后刷新可视化。
5. 全局"运行全部"按钮：强制从头跑完整条链，兜底"改了多处想一次性重跑"。

节点输出缓存：`Record<nodeId, PoseFrame | { error: string } | null>`。`null` 表示尚未计算。

### 3.5 选中节点可视化（B）

- 前端持有 `selectedNodeId`。
- 2D 预览 + 数值表的数据源 = 该节点缓存的输出 frame（而非最终结果）。
- 节点卡片显示状态徽章：输入 N 点 / 输出 M 点 / 错误 / 计算中。
- `meta` 可视化（可选）：节点声明 `visualizableMeta`，用户可在选中节点时开关"显示 meta.X"，前端按节点声明画。第一阶段 pose_generate 无 meta，该开关不出现。

---

## 4. 节点 UI 编排（A + a）

### 4.1 布局

主区域改为**纵向节点链**（左侧），从上到下即数据流方向。每节点一张卡片：

```
┌─────────────────────────────────────────────────────┐
│ [节点链]                                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● csv_input        [✓ 6 pts]            [展开 v]│ │  ← 卡片头（类型/状态徽章/展开）
│ │   ┌───────────────────────────────────────┐    │ │
│ │   │ 文件: corrugated.csv  [选择/拖入]       │    │ │  ← 内联参数（展开时）
│ │   └───────────────────────────────────────┘    │ │
│ │ └─────────────────────────────────────────────┘ │
│         │                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● pose_generate    [算法]   [✓ 6 pts]    [展开 v]│ │
│ │   ┌───────────────────────────────────────┐    │ │
│ │   │ curvature_threshold [——●——] 0.07       │    │ │  ← 内联参数
│ │   │ smooth_half_width    [—●———] 2          │    │ │
│ │   │ ...                                     │    │ │
│ │   └───────────────────────────────────────┘    │ │
│ │ └─────────────────────────────────────────────┘ │
│         │                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● pathview_export [终点]  [→ pathview]           │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
            │ 选中节点
            ▼
┌─────────────────────────────────────────────────────┐
│ [2D 预览 + 数值表]  显示选中节点的输出 frame         │
└─────────────────────────────────────────────────────┘
```

- 底部保留全局操作栏：流水线选择/保存/删除 + "运行全部" + 双服务状态 + 统计。
- CSV 导入从"底部操作栏按钮"回归为"流水线首节点"。pathview 导出从"底部按钮"回归为"流水线末节点"。

### 4.2 节点卡片内联参数（a）

- 卡片头：节点类型图标 + 标签 + 状态徽章（输入/输出点数、错误、计算中）+ 展开开关。
- 展开后：该节点参数内联显示（复用 `ParamsPanel` 的紧凑滑块+数值框组件）。参数变 → 触发增量重算（3.4）。
- 源节点（csv_input）的"参数"是文件选择/拖入。
- 终点节点（pathview_export）的"参数"是导出按钮。

### 4.3 流水线编辑

- 卡片间"添加节点"按钮：从 `NODE_REGISTRY` 列表挑节点插入。
- 节点卡片删除按钮（源/终点节点删除即移除该节点；中间节点删除即上下游直连）。
- 拖拽节点重排（可选，第一阶段可只做"上移/下移"按钮）。

---

## 5. 持久化（B）

### 5.1 多流水线 + localStorage

- 流水线定义序列化：`{ name: string, nodes: [{ id: string, type: string, params: Record<string, number> }] }`。只存拓扑+参数，**不存输出缓存**。
- localStorage key：`pose_generator_pipelines`。
- 内置流水线：`默认`（csv_input → pose_generate → pathview_export，全默认参数）。其他由用户保存。
- UI：底部操作栏的"流水线选择/保存/删除"，复用参数预设的内联命名模式（PresetBar 的做法）。

### 5.2 不持久化的

- 节点输出 frame（结果执行时重算）。
- 选中节点 id（会话态，关了重置为末节点）。

---

## 6. 第一阶段内置节点

### 6.1 `csv_input`（源节点）

- category: io，isSource: true，isSink: false。
- 参数：无（"文件"是交互对象，非数值参数；文件选择/拖入在卡片内联）。
- execute：读文件 → `parseCsvPoints` → 输出 frame `{points, meta: {}}`。若 CSV 带姿态，points 带 rx/ry/rz。
- 状态徽章：点数 / 含姿态 / 忽略行数。

### 6.2 `pose_generate`（算法节点）

- category: algorithm，isSource: false，isSink: false。
- 参数：8 个算法参数 + 初始姿态（rx/ry/rz），与当前 `GenerateParams` + `InitialPose` 同构（复用类型）。
  - `tangent_smooth_window` 强制奇数。
  - `keypoint_pose_angle_threshold` 当 `output_mode !== 1` 时禁用。
  - 初始姿态默认 `(0, 45, 178)`。**若上游 csv_input 的首点带姿态，前端在发请求前用首点姿态覆盖 params 的 initial_pose 默认值**（这是前端编排逻辑，不是后端执行逻辑——见 7.2）。
- execute：取 input frame 的 points（仅位置），拼 params（含 initial_pose），`POST /node/execute`（node_type=pose_generate），返回 output frame（points+姿态，meta 为空，见 1.3）。**后端只取位置，input frame 里的姿态字段被忽略**（见 7.2）。
- 状态徽章：算法标签 / 计算中 / 错误。
- visualizableMeta: []（无）。

### 6.3 `pathview_export`（终点节点）

- category: io，isSource: false，isSink: true。
- 参数：无（"导出"是交互按钮）。
- execute：取 input frame 的 points+姿态，`POST /api/paths` 到 pathview（副作用），**返回 input frame 原样**（导出不改数据，输出 frame = 输入 frame，这样选中该终点节点仍能在 2D 预览看到数据）。
- 卡片内联：导出按钮 + "在 pathview 中查看"（打开 5173）。
- 状态徽章：上次导出 id / 错误。

---

## 7. 后端改动

### 7.1 新增 `/node/execute`

`backend/src/main.cpp` 加路由：

```cpp
svr.Post("/node/execute", [](const httplib::Request& req, httplib::Response& res) {
  // 解析 {node_type, input, params}
  // 按 node_type 分发
  // 第一阶段: node_type=="pose_generate" -> 调 generate()
  // 其他 -> 400 {error: "unknown node_type"}
});
```

### 7.2 pose_adapter 复用

现有 `parseGenerateRequest` / `runGenerate` / `serializeGenerateResponse` 大部分复用。新增一个从 `/node/execute` 的 frame 结构到 `GenerateRequest` 的转换：input.points → `RobotPointEx`（**仅取位置 x/y/z，input frame 里若带姿态字段则忽略**——`generate()` 本来就只收位置），params 直接复用现有解析。

> 边界澄清："用上游首点姿态作 initial_pose 默认"是**前端编排逻辑**（节点 execute 在发请求前从 input frame 首点读姿态、填进 params.initial_pose），后端 `/node/execute` 不做这事——它只收 params 里传来的 initial_pose，input 的姿态字段不看。

### 7.3 现有 `/generate`

保留（迁移期兼容）。迁移完成后可移除或保留为 `node_type=pose_generate` 的 alias。

---

## 8. 前端改动

### 8.1 目录结构（新增/调整）

```
frontend/src/
├── types/
│   └── index.ts              # + PoseFrame, NodeParamSpec, NodeDef, Pipeline
├── lib/
│   ├── nodeRegistry.ts       # NODE_REGISTRY + 3 个节点定义
│   ├── pipeline.ts           # 引擎: 增量重算 + 输出缓存 + 脏标记
│   ├── pipelinesStore.ts     # localStorage 多流水线 (复用 presets 模式)
│   └── csv.ts / euler.ts     # 保留
├── hooks/
│   └── usePipeline.ts        # 流水线 state + 引擎驱动 + 选中节点
├── api/
│   └── node.ts               # POST /node/execute 客户端
├── components/
│   ├── NodeChain.tsx         # 纵向节点链容器
│   ├── NodeCard.tsx          # 单节点卡片 (头+内联参数+状态)
│   ├── NodeResult.tsx        # 选中节点的 2D 预览 + 数值表
│   ├── PipelineBar.tsx       # 底部: 流水线选择/保存/运行全部
│   ├── Preview2D.tsx / PoseTable.tsx / BackendStatus.tsx  # 保留复用
├── App.tsx                   # 重构为流水线布局
└── App.css
```

### 8.2 保留的组件

`Preview2D`（三视图）、`PoseTable`、`BackendStatus`、`PresetBar`（流水线选择复用其交互模式）、`ParamsPanel` 的紧凑控件（复用到 NodeCard 参数区）。

### 8.3 移除/重构

当前 `App.tsx` 的散落 state（points/params/initialPose/poseSrc/csvRotations）让位给 `usePipeline` 返回的 `{ pipeline, outputs, selectedNodeId, ... }`。`useGenerate` hook 被流水线引擎取代。

---

## 9. 已知风险与边界

1. **姿态生成节点无可视化 meta**（1.3）：不改 nexus，pose_generate 的 meta 为空，无法显示角点/分段/过渡区/曲率。接受此代价。
2. **后端会话状态**：`/node/execute` 无状态，每次请求自包含（input frame + params）。无会话泄漏风险。
3. **增量重算的取消**：算法节点 debounce 内参数再变，取消进行中请求。实现上用 `AbortController`（fetch）+ 计数器防串。
4. **流水线环路**：线性链无环路，引擎不处理 DAG 分支/合流（YAGNI，第一阶段纯线性）。
5. **节点输出缓存内存**：每节点缓存一个 frame，点序列几百点级别无压力。
6. **向后兼容**：`/generate` 保留，当前前端若未迁移完仍可用；迁移完成后前端全走 `/node/execute`。

---

## 10. 不做（YAGNI）

- 工具节点（下采样/平滑/反向/坐标变换/过滤）——第二阶段增量加。
- 后端算法节点动态发现（`/node/types` 接口）——未来需要再加。
- 运行时自定义节点（脚本/代码编辑器）——不做。
- 改 nexus 库加 `analyze()` 暴露算法中间产物——不做（见 1.3）。
- DAG 分支/合流（多输入多输出节点）——第一阶段纯线性链。
- 流水线后端持久化/跨机器——localStorage 足够。
- 拖拽节点重排（第一阶段用上移/下移按钮，拖拽可选后续加）。
