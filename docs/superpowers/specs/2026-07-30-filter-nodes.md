# Filter 节点集成设计文档

> 把 `MultimodalWeldSystem/include/filter` 下的 8 个 filter 算法集成为流水线节点。

- 文档日期：2026-07-30
- 基线：流水线改造已完成（spec `2026-07-30-pipeline-redesign.md`），3 个内置节点（csv_input/pose_generate/pathview_export），后端 `/node/execute` 按 `node_type` 分发。
- 算法源：`E:\workspace\nexus\MultimodalWeldSystem/include/filter`（8 个 filter，`_MWS_API` 在 MWS DLL 里，后端已链接）。

---

## 1. 目标与范围

### 1.1 要解决的问题

当前流水线只有 3 个节点，filter 算法无法插入。焊接扫描点云常需先去噪/平滑再规划姿态——把 nexus 已有的 8 个 filter 集成为流水线节点，让用户能在 `csv_input` 与 `pose_generate` 之间（或任意位置）插入滤波步骤。

### 1.2 第一阶段范围

- 集成 8 个 filter 节点：`filter_distance` / `filter_angle` / `filter_mean` / `filter_gaussian` / `filter_savgol` / `filter_stat_outlier` / `filter_ransac_line` / （`CascadeRbtPathFilter` 排除——容器型，与流水线语义重复）。
- 后端抽 `filter_adapter`，`/node/execute` 路由扩展分发。
- 前端 `nodeRegistry` 加 8 个 `NodeDef`；`NodeChain` 添加列表按 category 分组。
- 不改 nexus 库、不改 pathview、不新增链接库（filter 全在已链接的 MWS DLL 里）。

### 1.3 不改 nexus 库（关键约束）

filter 不碰 `rx/ry/rz`（grep 确认）。姿态字段**原样搭便车透传**——后端 adapter 不清零，直接返回 filter 输出（含姿态字段原值）。

### 1.4 姿态搭便车的代价（用户自负责模型）

用户选了"姿态透传不干预"。**后果**：平滑类 filter（Mean/Gaussian/SavitzkyGolay）改位置但保留姿态 → 位置与姿态脱钩。系统不阻止、不警告。用户自行判断 filter 在链中的位置是否合理。过滤类（Distance/Angle/Stat/Ransac）只删点，姿态完整保留，无脱钩问题。

---

## 2. 集成的 8 个 filter

| filter | 节点 type | category | 参数（key/默认/min/max/step） | 语义 |
|---|---|---|---|---|
| DistanceFilter | `filter_distance` | tool | min_th(1.0, 0~50, 0.1), max_th(30.0, 0~500, 1) | 按相邻点距过滤 |
| AngleFilter | `filter_angle` | tool | angleThreshold(30.0, 0~90, 1), directionWindowSize(5, 2~50, 1) | 按与主方向夹角过滤 |
| MeanSmoothingFilter | `filter_mean` | tool | radius(5.0, 0.1~100, 0.1) | KNN 半径均值平滑 |
| GaussianSmoothingFilter | `filter_gaussian` | tool | sigma(1.0, 0.1~10, 0.1), kernelSize(9, 1~51, 2, forcedOdd) | 高斯平滑 |
| SavitzkyGolayFilter | `filter_savgol` | tool | halfWindow(5, 1~50, 1), degree(3, 1~10, 1) | 多项式平滑（保峰值） |
| StatisticalOutlierFilter | `filter_stat_outlier` | tool | threshold(0.5, 0~5, 0.1), k(5, 1~50, 1) | 统计离群点剔除 |
| RansacLineFilter | `filter_ransac_line` | tool | inlierThreshold(1.0, 0~50, 0.1), maxIterations(100, 1~1000, 1), minInlierRatio(0.7, 0~1, 0.05), enableProjection(0, select 0=关/1=开) | RANSAC 拟合直线剔外点 |

**特殊处理**：
- `kernelSize`（Gaussian）`forcedOdd: true`（高斯核奇数惯例，复用现有 forcedOdd 机制）。
- `enableProjection`（Ransac）用 `select`（0=关/1=开），不为单一布尔加 toggle 类型。
- `RansacLineFilter` 构造函数 `std::srand(time)`——非确定性，UI 标注"结果有随机性"。

**排除**：`CascadeRbtPathFilter`（容器型，内部串多 filter + 单点 accept 判定，与流水线节点链语义重复，不做成节点）。

---

## 3. 架构

### 3.1 数据流

```
csv_input → filter_distance → filter_savgol → pose_generate → pathview_export
                                                 ↑
                            filter 节点吃点序列、吐点序列，姿态搭便车透传
```

filter 节点的 `execute` 调 `/node/execute`（node_type=filter_xxx），后端 adapter 调对应 `XxxFilter::apply()`，返回 frame（位置被 filter 处理，姿态原样保留）。

### 3.2 后端 `filter_adapter`

新增 `backend/src/filter_adapter.h/.cpp`，同构 `pose_adapter`：

- `struct FilterRequest { std::string node_type; sa::PointList points; std::map<string,double> params; };`
- `struct FilterResponse { sa::PointList result; };`
- `bool parseFilterRequest(const nlohmann::json& j, FilterRequest& out);`
- `nlohmann::json serializeFilterResponse(const FilterResponse& resp);`
- `FilterResponse runFilter(const FilterRequest& req);` — 按 `node_type` switch：构造 filter、`setXxx(params)`、`apply(input.points)`，返回结果（姿态字段原样保留，不清零）。

`runFilter` 内部按 `node_type` 分发：

```cpp
if (node_type == "filter_distance") {
    DistanceFilter f(req.params["min_th"], req.params["max_th"]);
    return { f.apply(req.points) };
} else if (node_type == "filter_angle") {
    AngleFilter f(req.params["angleThreshold"], req.params["directionWindowSize"]);
    return { f.apply(req.points) };
}
// ... 其余 6 个
```

**姿态透传**：`apply` 返回的 `PointList` 是 filter 处理后的点。filter 不碰姿态，所以输出的 `RobotPointEx` 姿态字段是输入的原值（平滑类：位置变姿态不变；过滤类：删点剩余点姿态不变）。adapter 序列化时原样读 `toPos()` + `toRot()`，不清零。

### 3.3 main.cpp `/node/execute` 路由扩展

现有路由只认 `pose_generate`。扩展为：

```cpp
if (node_type == "pose_generate") { /* 现有逻辑 */ }
else if (node_type.starts_with("filter_")) {
    // 调 filter_adapter
    FilterRequest fr; parseFilterRequest(body, fr);
    FilterResponse resp = runFilter(fr);
    // 序列化输出 frame
}
else { 400 unknown node_type }
```

路由保持极薄，filter 逻辑全在 `filter_adapter`。

### 3.4 前端 `nodeRegistry` 加 8 项

每个 filter 节点一个 `NodeDef`：
- `category: 'tool'`，`isSource: false`，`isSink: false`。
- `params`: 照第 2 节表的 schema（含 forcedOdd/默认值/范围）。
- `execute(input, params, ctx)`: 取 input.points，`ctx.executeNode('filter_xxx', input, packedParams)`，返回 output frame。
- `visualizableMeta: []`（filter 不暴露中间产物）。

参数打包：filter 的 `params` 都是扁平 number（无嵌套 initial_pose），直接传 `params` 给 `/node/execute`，无需 `packPoseGenParams` 那种拆包。

### 3.5 前端 `NodeChain` 添加列表按 category 分组

`NodeChain` 的"添加节点"按钮列表改为按 `category` 分段渲染：
- **I/O**: csv_input, pathview_export
- **算法**: pose_generate
- **滤波**: 8 个 filter

复用现有 `NodeDef.category` 字段，不改类型系统。

### 3.6 RansacLineFilter UI 标注

`filter_ransac_line` 节点卡片显示提示"RANSAC 结果有随机性"。在 `NodeCard` 渲染时，若 `def.type === 'filter_ransac_line'` 显示该提示（或给 `NodeDef` 加可选 `note?: string` 字段，前端按需展示——更通用）。

---

## 4. 关键事实（已核实）

1. **不新增链接库**：8 个 filter 全部 `_MWS_API`（在 MWS DLL 里），后端已链接 7 个 lib（MultimodalWeldSystem + Toolkit + Nexus + pos_transform + RoboLinker + opencv + spdlog）。
2. **filter 契约纯函数式**：`PointList apply(const PointList&)` 无副作用，和 `/node/execute` 框架天然契合。
3. **filter 不碰姿态**：grep 确认 8 个 filter 无 `rx/ry/rz` 操作，姿态搭便车透传在 adapter 层零成本。
4. **依赖已就绪**：`MeanSmoothingFilter` 用的 `nanoflann.hpp` 在 `include/tool/`（已在 include 路径）；`AngleFilter` 用的 `Nexus_Math`（已链接）。
5. **不改 nexus/pathview**：姿态不清零、filter 库不碰、pathview 不改。

---

## 5. 已知风险与边界

1. **姿态脱钩**（§1.4）：平滑类 filter 放 `pose_generate` 之后会让位置/姿态脱钩。用户自负责，系统不警告。接受此代价。
2. **RANSAC 随机性**：`std::srand(time)` 非确定性，拖滑块重算结果可能变。UI 标注。不改库。
3. **filter 节点的"输出点数"**：过滤类会减点（DistanceFilter 可能从 100 点减到 30 点）。下游 `pose_generate` 用过滤后的点重算姿态——这是预期行为（去噪后规划）。状态徽章显示输入/输出点数让用户看到变化。
4. **`enableProjection` 用 select 0/1**：后端 adapter 读 `params["enableProjection"]`，转 bool 传给 `enableProjection(bool)`。
5. **空输入**：filter 对空输入返回空（库实现已处理 `if(input.empty()) return {}`）。adapter 不需特殊兜底。

---

## 6. 不做（YAGNI）

- `CascadeRbtPathFilter` 节点化（容器型，语义重复）。
- 改 nexus 库给 filter 加姿态同步（四元数平均）——未来若需姿态也平滑再做。
- 后端 filter 注册表（8 个 filter 用 switch 够，C++ 注册表过度设计）。
- filter 节点的 meta 可视化（filter 不暴露中间产物）。
- UI 警告"平滑放在 pose_generate 之后会脱钩"——用户自负责模型，不加警告（除非后续反馈）。
- toggle 类型参数（enableProjection 用 select 0/1 替代）。
