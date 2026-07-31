# fitBsPLineAndRebuildPathUniform 节点适配 spec

- 日期：2026-07-31
- 算法：`mws::fitBsPLineAndRebuildPathUniform`（`MultimodalWeldSystem/include/core/MWS_Function.h:254`，自由函数，`_MWS_API`）

## 算法分析（Step 1）

- **签名**：`int fitBsPLineAndRebuildPathUniform(const sa::PointList& _in, sa::PointList& _out, float _step, float _Tol3D=3.0f, int _degMin=3, int _continuity=2)`
- **纯函数式**：是（不写文件/网络/全局）。用 OCCT 做 B 样条拟合，确定性（非随机）。
- **姿态**：从输入点取 `RobotPointEx`（含姿态），只 `setPos` 改位置，**姿态 rx/ry/rz 原样保留**（和 MeanSmoothing 同模式）→ 姿态搭便车透传，adapter `toRot()` 原样返回不清零。位置/姿态脱钩（用户自负责，UI 不警告，沿用既有约定）。
- **前置条件**：`size < 3` 返回 -2；`step <= 0` 返回 -2。
- **返回码**：0=成功，-1=拟合失败，-2=输入非法。adapter 要把非 0 当错误处理。
- **非 filter**：不继承 `NexusFilterInterface`，是 `core/MWS_Function.h` 的自由函数。但语义是路径处理工具，放 `filter_adapter` 的 switch 分支直接调自由函数（不构造 filter 对象）。

## node_type + 参数（Step 2）

- **node_type**：`filter_bspline`（蹭 `filter_` 前缀走 filter_adapter，避免改 main.cpp 分发）。
- **参数 schema**（默认值照搬头文件，`step` 无默认给 5.0）：
  | key | 默认 | 范围/step | 说明 |
  |---|---|---|---|
  | step | 5.0 | 0.1~100, 0.1 | 弧长步长 mm，必须 >0 |
  | Tol3D | 3.0 | 0.1~20, 0.1 | 三维拟合容差 |
  | degMin | 3 | 1~8, 1 | 最小曲线阶数（1线性/2二次/3三次） |
  | continuity | 2 | 0~2, 1 | 连续性（0位置/1切线/2曲率） |
- 无特殊参数（无布尔/奇数/条件禁用）。

## 后端 adapter（Step 3）

`backend/src/filter_adapter.cpp`：
- 加 `#include "core/MWS_Function.h"`。
- `runFilter` 加分支：
  ```cpp
  if (req.node_type == "filter_bspline") {
      float step = static_cast<float>(p.count("step") ? p.at("step") : 5.0);
      float tol3d = static_cast<float>(p.count("Tol3D") ? p.at("Tol3D") : 3.0);
      int degMin = static_cast<int>(p.count("degMin") ? p.at("degMin") : 3);
      int cont = static_cast<int>(p.count("continuity") ? p.at("continuity") : 2);
      sa::PointList out;
      int rc = mws::fitBsPLineAndRebuildPathUniform(req.points, out, step, tol3d, degMin, cont);
      if (rc != 0) throw std::runtime_error("fitBsPLine failed, code=" + std::to_string(rc));
      resp.result = out;
      return resp;
  }
  ```
- 姿态透传：`out` 里的点已含原姿态（算法 setPos 只改位置），adapter `serializeFilterResponse` 用 `toRot()` 原样，不清零。
- **不新增链接库**：`fitBsPLineAndRebuildPathUniform` 是 MWS DLL 导出符号，filter_adapter 复用现有 7 个 lib（OCCT 已在 MWS DLL 内）。

## 前端 NodeDef（Step 4）

`frontend/src/lib/nodeRegistry.ts` 加：
```ts
filter_bspline: {
  type: 'filter_bspline', label: 'B样条均匀重建', category: 'tool',
  isSource: false, isSink: false,
  params: [
    { key: 'step', label: 'step', type: 'number', min: 0.1, max: 100, step: 0.1, default: 5.0 },
    { key: 'Tol3D', label: 'Tol3D', type: 'number', min: 0.1, max: 20, step: 0.1, default: 3.0 },
    { key: 'degMin', label: 'degMin', type: 'number', min: 1, max: 8, step: 1, default: 3 },
    { key: 'continuity', label: 'continuity', type: 'number', min: 0, max: 2, step: 1, default: 2 },
  ],
  async execute(input, params, ctx) {
    if (!input) return EMPTY_FRAME;
    return ctx.executeNode('filter_bspline', input, params);
  },
  visualizableMeta: [],
},
```

## UI 标注（Step 5）

无特殊标注（非随机、不清姿态、非容器型）。位置/姿态脱钩沿用既有约定（不警告）。

## 测试（Step 6）

- `test_filter_adapter.cpp` 加烟雾测试：≥3 非共线点 + 默认参数，断言 `result.size() >= 2`（B 样条重建应输出多个均匀采样点）。
- curl 验证 + pose_generate 回归 + e2e。

## 不改 nexus

直接调 `mws::fitBsPLineAndRebuildPathUniform`，不碰库源码。
