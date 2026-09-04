---
name: nexus-node-adapter
description: 把 nexus / MultimodalWeldSystem 库的具体算法（filter、pose generator 等）适配成 PoseGenerator 流水线节点。使用场景：用户要把某个 nexus 算法集成成流水线可插拔节点、新增 filter/算法节点、扩 /node/execute 支持新算法、在 nodeRegistry 注册新 NodeDef。触发词："把 X 算法做成节点"、"集成 X filter/pose 节点"、"新增 X 节点"、"适配 nexus 算法成节点"。
---

# nexus 算法适配成节点

把 nexus `MultimodalWeldSystem` 库的一个算法（如某个 filter、pose generator）适配成 PoseGenerator 流水线节点：前端可加该节点到节点链，后端 `/node/execute` 按 node_type 分发执行。

**先读 [references/nexus-conventions.md](references/nexus-conventions.md)**——库路径、7 个链接库、`sa::RobotPointEx` 类型、已知坑（RANSAC 随机性/投影清姿态、filter 默认值、裸 max() 等）。适配时逐一核对。

## 工作流

### 1. 判断算法能否适配

读算法头文件（`${NEXUS_ROOT}/MultimodalWeldSystem/include/...`），核对：

- **纯函数式 apply？** `T apply(const T& input)` 输入输出同型（如 `PointList→PointList`）= 可适配。若有副作用（写文件/网络/全局状态）、依赖外部配置文件、非确定随机——仍可适配但要标注（见第 5 步）。
- **非 filter 自由函数也算可适配**：`core/MWS_Function.h` 里 `mws::` 自由函数（不继承 filter 接口，如 `alignSegment_TrimmedICP_*`）只要"点序列进、点序列出"也可塞 filter_adapter——node_type 蹭 `filter_` 前缀走分发，adapter 直接调自由函数（不构造 filter 对象）。详见 [references/nexus-conventions.md](references/nexus-conventions.md) "非 filter 自由函数"节。注意自由函数常返回 int 错误码，adapter 要检查非 0 抛错。**优先看有没有同名 filter 子类**（如 B 样条曾有自由函数版本、后有 `BSplineFilter` 类——filter 类封装更完整：透传兜底、参数默认值权威），有则走 filter 类。
- **姿态字段怎么处理？** grep 算法源码是否碰 `rx/ry/rz`。多数不碰→姿态搭便车透传（adapter 用 `toRot()` 原样返回，不清零）。若算法改位置不改姿态（平滑类、B样条重建类）→ 位置/姿态脱钩，UI 不警告（用户自负责）。若算法清零姿态（如 RansacLine 投影）→ UI 必须警告。
- **容器型/单点型？** 如 `CascadeRbtPathFilter`（内部串多 filter + 单点 accept）= 容器型，与流水线节点链语义重复，**排除**，不做节点。

### 2. 定 node_type 和参数 schema

- **node_type**：`filter_<algo>` 或 `<algo>`（如 `filter_distance`、`pose_generate`）。前后端字符串必须完全一致。**非 filter 自由函数（core/MWS_Function.h）也用 `filter_<algo>` 前缀**——蹭 main.cpp 的 `filter_*` 分发走 filter_adapter，避免改 main.cpp。
- **参数**：从算法构造函数/setXxx 方法的参数提炼。默认值照搬库构造默认。范围/step 按物理意义定（点距 mm 级、角度度、窗口整数）。**记下每个参数的库构造签名**（构造设参 vs setXxx）——adapter 实现时按此构造。
- **特殊参数**：
  - 布尔参数（如 `enableProjection`）用 `select`（0=关/1=开），不加 toggle 类型。
  - 应为奇数的（如 `kernelSize`、`tangent_smooth_window`）加 `forcedOdd: true`。
  - 条件禁用参数（如 `keypoint_pose_angle_threshold` 仅 KEYPOINTS 生效）加 `disabledWhen`，但注意 `disabledWhen` 接收**完整节点 params**（非单参）——见第 4 步 NumCtrl 实现。

### 3. 后端 adapter

在 `backend/src/filter_adapter.cpp`（filter 类）或对应 adapter（pose 类用 `pose_adapter`）的 `runFilter`/`runGenerate` 里加分支。**filter 类用 filter_adapter，pose 类用 pose_adapter——别混。**

```cpp
if (req.node_type == "filter_xxx") {
    float th = static_cast<float>(p.count("th") ? p.at("th") : 1.0);  // 默认值照搬库
    mws::XxxFilter f(th);                  // 构造设参(优先),或先默认构造再 setXxx
    resp.result = f.apply(req.points);
    return resp;
}
```

要点：
- **参数取值**：`p.count(key) ? p.at(key) : <库默认>`，`static_cast` 转库期望类型（float/int/double/bool）。
- **bool 转换**：`bool b = p.count("k") ? (p.at("k") != 0) : false;`。
- **姿态透传**：`serializeFilterResponse` 用 `toRot()` 原样序列化，**不清零**。算法若清姿态（如 RansacLine 投影），那也只在特定参数下发生——记录，第 5 步加 UI 警告。
- **`#include`**：加算法头（如 `filter/MWS_XxxFilter.h`）。若 nexus 头用裸 `max()/min()` 等无 `std::` 前缀，加 `#include <algorithm>` + `using std::max;`（见 references 已知坑 1）。
- **新增链接库**：若算法头带 `_MWS_API`（在 MWS DLL 里）→ **不新增库**，复用现有 7 个。若算法在别的 nexus 子项目 DLL 里→加对应 `.lib` 到 CMake（见 references 链接库表）。

**非 filter 自由函数（core/MWS_Function.h）的分支写法不同**——不构造 filter 对象、不调 `apply`，直接调自由函数；常有 int 返回码（0=成功）和出参引用：

```cpp
if (req.node_type == "filter_xxx") {
    float step = static_cast<float>(p.count("step") ? p.at("step") : 5.0);
    sa::PointList out;
    int rc = mws::xxxFunc(req.points, out, step);   // 自由函数,出参引用 + int 返回码
    if (rc != 0) throw std::runtime_error("xxx failed, code=" + std::to_string(rc));
    resp.result = out;
    return resp;
}
```

### 4. 前端 NodeDef

在 `frontend/src/lib/nodeRegistry.ts` 的 `NODE_REGISTRY` 加一项：

```ts
filter_xxx: {
  type: 'filter_xxx',            // 与后端 node_type 完全一致
  label: '中文名',
  category: 'tool',             // filter='tool', pose 算法='algorithm', I/O='io'
  isSource: false, isSink: false,
  params: [ /* 第 2 步的 schema,默认值/范围/forcedOdd/disabledWhen */ ],
  async execute(input, params, ctx) {
    if (!input) return EMPTY_FRAME;
    return ctx.executeNode('filter_xxx', input, params);  // 姿态搭便车,前端不碰
  },
  visualizableMeta: [],         // 不改 nexus 时算法无中间产物,留空
},
```

要点：
- **参数扁平** `Record<string, number>`（不像 pose_generate 有嵌套 `initial_pose`）。
- **`disabledWhen` 收完整 params**：`NodeCard` 的 NumCtrl 要传 `allParams={node.params}`（非 `{[key]: value}`），否则跨参数判断失效（如 `output_mode !== 1` 读不到 output_mode）。这是既有坑，别重蹈。
- **category 决定 UI 分组**：`io`→I/O 组、`algorithm`→算法组、`tool`→滤波组。

### 5. UI 标注（按需）

在 `frontend/src/components/NodeCard.tsx`，对有特殊性的节点加提示：

- **随机性**（如 RANSAC）：`{def.type === 'filter_ransac_line' && <div className="nc-note">⚠ 结果有随机性,重算可能变化</div>}`
- **清姿态**（如 RANSAC 投影）：`{def.type === 'filter_ransac_line' && node.params.enableProjection === 1 && <div className="nc-note">⚠ 启用投影会清空姿态数据</div>}`
- 用 `def.type === '<node_type>'` 硬编码判断，**不加 NodeDef.note 字段**（YAGNI）。

### 6. 测试

- **后端 adapter 烟雾测试**：`backend/src/tests/test_filter_adapter.cpp` 加该算法的 `runSmoke` 调用——构造合规测试点（filter 用足够多的非共线点，避免 nanoflann 等异常），断言 `result.size() >= 1`。CMake 的 `test_filter_adapter` target 已存在，直接加 case。从 `backend/runtime/` 跑 exe（DLL 链在那）。
- **curl 验证**：启动 pose_backend，`POST /node/execute` 传 `{node_type, input:{points}, params}`，确认返回 `{output:{points,meta}}`。
- **回归**：确认 `pose_generate`（或其他既有 node_type）仍可用。
- **e2e**：浏览器插该节点到链中，调滑块看增量重算，选中看 NodeResult。
- **不改 nexus 库**：算法的中间产物不暴露（meta 留空）。要暴露须改生产库加只读 API——当前项目明确不做。

## 关键约束（每步核对）

- **不改 nexus 库**：算法库一行不碰。姿态清零/中间产物都在 adapter/UI 层处理。
- **行为完全一致**：adapter 直接调算法的 `apply()`/`generate()`，不重写算法逻辑。
- **node_type 前后端一致**。
- **姿态搭便车透传**：adapter `toRot()` 原样，不清零（除非算法自己清，那才加警告）。

## 详见

- [references/nexus-conventions.md](references/nexus-conventions.md)：库路径/链接库/类型契约/已知坑/filter 与 pose generator 契约。
