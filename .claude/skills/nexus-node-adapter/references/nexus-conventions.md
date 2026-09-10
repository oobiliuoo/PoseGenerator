# nexus / MultimodalWeldSystem 库约定

> 适配节点时引用本文件：库路径、链接库、类型契约、已知坑。

## 路径与构建

- **NEXUS_ROOT** = `E:\workspace\nexus`（生产 C++ 算法库源码）。
- **算法头文件**：`${NEXUS_ROOT}/MultimodalWeldSystem/include/`（如 `filter/MWS_DistanceFilter.h`、`tool/CorrugatedWeldPoseGenerator.h`）。
- **NEXUS_ENV_ROOT** = `$ENV{NEXUS_ENV_ROOT}`，回退 `${NEXUS_ROOT}/../env`（第三方：Eigen 3.4 / OpenCV 4.10 / spdlog）。
- **工具链（必须匹配 nexus ABI）**：MSVC / x64 / `/MD`（MultiThreadedDLL）/ C++17 / `RelWithDebInfo`。
- **后端 exe 输出**：`backend/runtime/`，用 `backend/scripts/copy-runtime.ps1` 从 nexus `x64/Release/` 拷顶层 `*.dll` 到该目录。

## 链接库（7 个，CMake `target_link_libraries`）

均来自 `${NEXUS_ROOT}/x64/Release/` 或 `${NEXUS_ENV_ROOT}/...`：

| 库 | 来源 | 用途 |
|---|---|---|
| MultimodalWeldSystem.lib | NEXUS_ROOT/x64/Release | 算法 DLL（filter / pose generator 都在这） |
| Toolkit.lib | 同上 | `sa::RobotPointEx` 实现 |
| Nexus.lib | 同上 | 内部辅助类型 |
| pos_transform.lib | 同上 | |
| RoboLinker.lib | 同上 | |
| opencv_world4100.lib | NEXUS_ENV_ROOT/opencv-4.10.0/build/x64/vc16/lib | OpenCV 4.10 |
| spdlog.lib | NEXUS_ENV_ROOT/spdlog/lib | 日志 |

**不新增链接库**：新算法若在 MWS DLL 里（头文件带 `_MWS_API`），复用上述 7 个即可。

## 关键类型（NexusType.h）

- `sa::RobotPointEx`：路径点。位置 `x,y,z`（float）+ 姿态 `rx,ry,rz`（float，度，ZYX 内旋）+ 外部轴 `j7,j8,j9`。
  - 构造：`RobotPointEx(float x, float y, float z, float rx=0, float ry=0, float rz=0, ...)`（NexusType.h ~line 377）。
  - `RobotPointEx(const cv::Point3f& pos, const cv::Point3f& rot = {0,0,0}, ...)`（~line 379）——同时设位置+姿态。
  - `setRot(const cv::Point3f&)`（继承自 RobotPoint，~line 141）——单独设姿态。
  - `toPos()` → `cv::Point3f`（位置）；`toRot()` → `cv::Point3f`（姿态）。
- `sa::PointList = std::vector<RobotPointEx>`。
- `_MWS_API` = `__declspec(dllexport/dllimport)`（消费 DLL 时不定义 `MWS_API`，`_MWS_API` 自动是 dllimport）。
- **库 `Json` 类型（`Toolkit/include/Json_Base.h`）= `using Json = nlohmann::json;`——与后端 nlohmann 直接互喂**，库对象的 `toJson()/analysisJson()` 产物可直接当 nlohmann 用。注意 `analysisJson(Json&)` 收**非 const 左值引用**，const 入参要先拷一份。
- **嵌套结构成员函数可能未被 lib 导出**：`CorrugatedWeldPoseGenerator::Params::toJson/fromJson` 在 lib 中无符号（LNK2019），尽管级联链 `CascadeRbtPathFilter::toJson/analysisJson` 与各 filter 的都正常导出。遇到就照库 cpp 逐字段手动对齐（全 number 字段无类型风险）。

## 已知坑（适配时逐一核对）

1. **`MWS_AngleFilter.h` 用裸 `max()`**——filter_adapter.cpp 要 `#include <algorithm>` + `using std::max;` 才编译。其他 nexus 头若用裸 `std` 函数同理。
2. **姿态搭便车**：filter 都不碰 `rx/ry/rz`（grep 确认）。adapter 用 `toRot()` 原样序列化，**不清零**。后果：平滑类（Mean/Gaussian/SavitzkyGolay）改位置不改姿态 → 位置/姿态脱钩（用户自负责，系统不警告）。
3. **`RansacLineFilter` 构造函数 `std::srand(time)`**——非确定性，拖滑块重算结果可能变。UI 标注"结果有随机性"。
4. **`RansacLineFilter` `enableProjection=true` 时调 `setRobotPoint(proj)`**——`proj` 是仅位置的 `RobotPoint`，会**清零姿态**。UI 标注"启用投影会清空姿态数据"。
5. **`DistanceFilter` 默认 `max_th=30.0`**——对宽间距路径（如 100mm 点距）会把点全过滤掉。默认值照搬库构造，但 UI 提示或建议用户调大。
6. **`MeanSmoothingFilter` 依赖 `nanoflann.hpp`**（`include/tool/`，已在 include 路径）。共线点数据可能触发异常，测试用非共线点。
7. **filter 的 `toJson/analysisJson` 有严格类型**：nlohmann `get<bool>()` 对 number 抛 `type_error.302`（BSpline `uniform`、Ransac `enableProjection` 均为 bool）。**节点链导出/导入走后端 `/pipeline/serialize|deserialize` 直调库 toJson/analysisJson**（见 filter_adapter.cpp `runPipelineSerialize/Deserialize`），前端只做 key/bool 映射——不要在 JS 手搓格式。
8. **`generate()` 类算法只收位置**：`CorrugatedWeldPoseGenerator::generate(points, initial_pose)` 的 `points` 仅用位置，姿态被忽略。pose_generate 节点的 initial_pose 从 `params` 取，不从 input frame 取（input 姿态字段忽略）。

## filter 契约（基类 NexusFilterInterface<T>）

```cpp
template <typename T> class NexusFilterInterface {
    virtual T apply(const T& input) = 0;  // 纯函数式,输入 PointList 输出 PointList
    virtual std::string getName() const = 0;
};
```

8 个 filter（`include/filter/`）：DistanceFilter / AngleFilter / MeanSmoothingFilter / GaussianSmoothingFilter / SavitzkyGolayFilter / StatisticalOutlierFilter / RansacLineFilter / CascadeRbtPathFilter（容器型，**排除**——与流水线节点链语义重复）。

## 非 filter 自由函数（core/MWS_Function.h）

`mws::` 命名空间下的自由函数，**不继承 `NexusFilterInterface`**，但语义是"路径处理工具"（点序列进、点序列出）。例：`fitBsPLineAndRebuildPathUniform`、`alignSegment_TrimmedICP_*` 等。

- **可塞 filter_adapter**：`filter_adapter.cpp` 的 `runFilter` switch 加分支**直接调自由函数**（不构造 filter 对象、不调 `apply`）。与 filter 子类分支结构略不同——
  ```cpp
  if (req.node_type == "filter_xxx") {
      sa::PointList out;
      int rc = mws::xxxFunc(req.points, out, /*params*/);   // 自由函数,出参引用
      if (rc != 0) throw std::runtime_error("xxx failed, code=" + std::to_string(rc));
      resp.result = out;
      return resp;
  }
  ```
- **node_type 蹭 `filter_` 前缀**：这样走 main.cpp 的 `filter_*` 分发，不用改 main.cpp 加新前缀。节点名语义上仍是"滤波/路径处理工具"，归类 `category: 'tool'`。
- **返回码当错误处理**：自由函数常返回 `int`（0=成功，非 0=错误码如 -1/-2）。adapter 要检查 `rc != 0` 并 throw（让 `/node/execute` 返回 500 + error）。filter 子类的 `apply` 不返回码、靠异常/空输出——自由函数不同，别漏掉返回码检查。
- **出参引用**：自由函数常用 `sa::PointList& _out` 出参（非返回值）。adapter 声明局部 `out`、传引用、再赋给 `resp.result`。
- **OCCT 依赖**：`MWS_Function.h` 里的函数常用 OCCT（`gp_Pnt`/`GeomAPI_*`）。OCCT 在 MWS DLL 内（MWS CMakeLists 链 OCCT.lib），filter_adapter 调 DLL 导出符号，**不新增链接库**。
- **姿态处理**：自由函数若也只 `setPos` 改位置（如 `fitBsPLineAndRebuildPathUniform`），姿态搭便车透传同 filter；若函数清零姿态（`setRobotPoint(仅位置对象)`），UI 加警告。

## pose generator 契约

`mws::CorrugatedWeldPoseGenerator`（`tool/CorrugatedWeldPoseGenerator.h`）：
- `generate(const std::vector<sa::RobotPointEx>& points, const cv::Point3f& initial_pose) -> std::vector<sa::RobotPointEx>`
- `setParams(const Params&)` / `getParams()`。
- `Params` 有 `toJson()/fromJson(Json)`——但 adapter 用 nlohmann::json 手动按字段解码（output_mode 是 int 0/1，库用 `static_cast<int>`）。
- **不改 nexus 库**：`generate()` 的中间产物（is_closed/segments/is_transition/curvatures）是私有局部变量，无公开 API。要拿到必须加只读 `analyze()`——当前项目明确**不改生产库**，pose_generate 节点 meta 为空。
