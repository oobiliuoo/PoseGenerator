# Filter 节点集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `MultimodalWeldSystem/include/filter` 下的 8 个 filter 算法集成为流水线节点（filter_distance/angle/mean/gaussian/savgol/stat_outlier/ransac_line），后端抽 `filter_adapter` 分发，前端 `nodeRegistry` 加 8 项 + `NodeChain` 添加列表按 category 分组 + RANSAC 随机性标注。

**Architecture:** 后端新增 `filter_adapter.h/.cpp`（同构 `pose_adapter`），`/node/execute` 路由扩展认 `filter_*` node_type 并调 adapter。前端 `nodeRegistry` 加 8 个 `NodeDef`（参数 schema + execute 发 `/node/execute`）；`NodeChain` 添加列表按 category 分组（I/O/算法/滤波）。filter 不碰姿态，adapter 原样透传（不清零）。不改 nexus/pathview，不新增链接库。

**Tech Stack:** C++17 / MSVC / cpp-httplib / nlohmann/json（后端）；React 19 + TS + Vite（前端）。

## Global Constraints

- **不改 nexus 库**：filter 库不碰；姿态不清零，adapter 原样返回 filter 输出（含姿态字段原值）。
- **不新增链接库**：8 个 filter 全在已链接的 MWS DLL 里（`_MWS_API`）。
- **后端端口 8220，exe 在 `backend/runtime/`**；`/node/execute` 已存在（认 `pose_generate`）。
- **filter 节点姿态搭便车透传**：平滑类会让位置/姿态脱钩，系统不警告（用户自负责）。
- **参数走 `Record<string, number>`**，按 `node_type` switch；`enableProjection` 用 select 0/1；`kernelSize` forcedOdd；RANSAC 随机性 UI 标注。
- **NodeDef.category 复用**：8 个 filter 都是 `'tool'`；`NodeChain` 添加列表按 category 分组（io/algorithm/tool→滤波）。
- **Commit 风格**：conventional commits 中文，如 `feat(filter): 新增 8 个 filter 节点`。
- **现有复用**：`/node/execute` 路由、`pose_adapter` 模式、`nodeRegistry` 的 `executeNode` 调用模式、`NodeChain` 的添加列表结构。

---

## File Structure

```
PoseGenerator/
├── backend/
│   └── src/
│       ├── filter_adapter.h          # 新：FilterRequest/Response + runFilter 声明
│       ├── filter_adapter.cpp        # 新：按 node_type 分发 8 个 filter
│       ├── main.cpp                  # 改：/node/execute 路由扩展认 filter_*
│       └── tests/
│           └── test_filter_adapter.cpp  # 新：行为一致性 + 各 filter 调用测试
└── frontend/
    └── src/
        ├── lib/
        │   └── nodeRegistry.ts       # 改：加 8 个 filter NodeDef + FILTER_PARAMS schema
        └── components/
            └── NodeChain.tsx          # 改：添加列表按 category 分组
```

**职责边界：**
- `filter_adapter.h/.cpp` — 唯一调用 filter 库的地方。按 `node_type` switch 构造 filter、设参、`apply()`。姿态透传（不清零）。
- `test_filter_adapter.cpp` — 验证 adapter 能调通各 filter（不崩、返回点数合理）。
- `nodeRegistry.ts` — 8 个 filter 的参数 schema + execute（发 `/node/execute`）。
- `NodeChain.tsx` — 添加列表按 category 分组渲染。

---

## Task 1: 后端 filter_adapter 骨架 + 距离滤波器节点

**Files:**
- Create: `E:\person\project\PoseGenerator\backend\src\filter_adapter.h`
- Create: `E:\person\project\PoseGenerator\backend\src\filter_adapter.cpp`
- Create: `E:\person\project\PoseGenerator\backend\src\tests\test_filter_adapter.cpp`

**Interfaces:**
- Consumes: `sa::PointList`/`sa::RobotPointEx`（NexusType.h）；nlohmann/json；`DistanceFilter`（`filter/MWS_DistanceFilter.h`）。
- Produces:
  - `struct FilterRequest { std::string node_type; std::vector<sa::RobotPointEx> points; std::map<std::string, double> params; };`
  - `struct FilterResponse { std::vector<sa::RobotPointEx> result; };`
  - `bool parseFilterRequest(const nlohmann::json& j, FilterRequest& out);`
  - `nlohmann::json serializeFilterResponse(const FilterResponse& resp);` — 返回 `{points:[{x,y,z,rx,ry,rz}], meta:{}}`（姿态原样透传，不清零）。
  - `FilterResponse runFilter(const FilterRequest& req);` — 按 `node_type` switch。第一阶段实现 `filter_distance`，其余在 Task 2 补全。

- [ ] **Step 1: 写 filter_adapter.h**

创建 `E:\person\project\PoseGenerator\backend\src\filter_adapter.h`：

```cpp
#pragma once
#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <map>
#include "NexusType.h"

struct FilterRequest {
    std::string node_type;
    std::vector<sa::RobotPointEx> points;
    std::map<std::string, double> params;
};

struct FilterResponse {
    std::vector<sa::RobotPointEx> result;
};

// Parse {node_type, input:{points}, params} -> FilterRequest.
// Points carry x,y,z,rx,ry,rz (pose passed through untouched by filters).
bool parseFilterRequest(const nlohmann::json& j, FilterRequest& out);

// Serialize {points:[{x,y,z,rx,ry,rz}], meta:{}}. Pose from toRot() verbatim (no zeroing).
nlohmann::json serializeFilterResponse(const FilterResponse& resp);

// Dispatch by node_type to the corresponding nexus filter. Returns result points
// (pose fields carry through from input — filters don't touch rx/ry/rz).
// Throws std::runtime_error for unknown node_type.
FilterResponse runFilter(const FilterRequest& req);
```

- [ ] **Step 2: 写 filter_adapter.cpp（先实现 filter_distance）**

创建 `E:\person\project\PoseGenerator\backend\src\filter_adapter.cpp`：

```cpp
#include "filter_adapter.h"
#include "filter/MWS_DistanceFilter.h"
#include <stdexcept>

bool parseFilterRequest(const nlohmann::json& j, FilterRequest& out) {
    try {
        out.node_type = j.value("node_type", "");
        out.points.clear();
        for (auto& pj : j.at("input").at("points")) {
            sa::RobotPointEx pt(
                static_cast<float>(pj.value("x", 0.0)),
                static_cast<float>(pj.value("y", 0.0)),
                static_cast<float>(pj.value("z", 0.0))
            );
            // 姿态字段原样读入(若存在),filter 不碰但 adapter 透传
            if (pj.contains("rx")) pt.setRot(cv::Point3f(
                static_cast<float>(pj.value("rx", 0.0)),
                static_cast<float>(pj.value("ry", 0.0)),
                static_cast<float>(pj.value("rz", 0.0))));
            out.points.push_back(pt);
        }
        out.params.clear();
        if (j.contains("params")) {
            for (auto it = j["params"].begin(); it != j["params"].end(); ++it) {
                if (it.value().is_number()) out.params[it.key()] = it.value().get<double>();
            }
        }
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

nlohmann::json serializeFilterResponse(const FilterResponse& resp) {
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& pt : resp.result) {
        cv::Point3f pos = pt.toPos();
        cv::Point3f rot = pt.toRot();
        arr.push_back({
            {"x", pos.x}, {"y", pos.y}, {"z", pos.z},
            {"rx", rot.x}, {"ry", rot.y}, {"rz", rot.z},
        });
    }
    return {{"points", arr}, {"meta", nlohmann::json::object()}};
}

FilterResponse runFilter(const FilterRequest& req) {
    FilterResponse resp;
    const auto& p = req.params;
    if (req.node_type == "filter_distance") {
        float min_th = static_cast<float>(p.count("min_th") ? p.at("min_th") : 1.0);
        float max_th = static_cast<float>(p.count("max_th") ? p.at("max_th") : 30.0);
        mws::DistanceFilter f(min_th, max_th);
        resp.result = f.apply(req.points);
        return resp;
    }
    throw std::runtime_error("unknown filter node_type: " + req.node_type);
}
```

> 注意 `setRot`：`sa::RobotPointEx` 继承 `RobotPoint`，有 `setRot(const cv::Point3f&)`（NexusType.h:141）。若 `setRot` 不可用，改用 `RobotPointEx(pos, rot)` 构造（NexusType.h:379）。先按 `setRot` 写，编译失败再改。

- [ ] **Step 3: 写 test_filter_adapter.cpp（先测 filter_distance）**

创建 `E:\person\project\PoseGenerator\backend\src\tests\test_filter_adapter.cpp`：

```cpp
#include <cassert>
#include <iostream>
#include "../filter_adapter.h"

int main() {
    // 构造 20 点直线,点距 10,设 min_th=5 max_th=15 应全部保留
    std::vector<sa::RobotPointEx> pts;
    for (int i = 0; i < 20; ++i) pts.emplace_back(i * 10.0f, 0.0f, 0.0f);

    FilterRequest req;
    req.node_type = "filter_distance";
    req.points = pts;
    req.params["min_th"] = 5.0;
    req.params["max_th"] = 15.0;
    auto resp = runFilter(req);
    assert(resp.result.size() == 20);  // 点距 10 在 [5,15] 内,全保留
    std::cout << "filter_distance: " << resp.result.size() << " pts (expect 20)\n";

    // 未知 node_type 应抛
    req.node_type = "filter_unknown";
    bool threw = false;
    try { runFilter(req); } catch (...) { threw = true; }
    assert(threw);

    // JSON round-trip
    nlohmann::json j;
    j["node_type"] = "filter_distance";
    j["input"] = {{"points", nlohmann::json::array()}};
    for (auto& pt : pts) j["input"]["points"].push_back({{"x", pt.x}, {"y", pt.y}, {"z", pt.z}});
    j["params"] = {{"min_th", 5.0}, {"max_th", 15.0}};
    FilterRequest parsed;
    assert(parseFilterRequest(j, parsed));
    assert(parsed.points.size() == 20);
    assert(parsed.params.at("min_th") == 5.0);

    std::cout << "test_filter_adapter OK\n";
    return 0;
}
```

- [ ] **Step 4: 加 test_filter_adapter 到 CMake 并构建运行**

在 `E:\person\project\PoseGenerator\backend\CMakeLists.txt` 末尾追加：

```cmake
add_executable(test_filter_adapter src/tests/test_filter_adapter.cpp src/filter_adapter.cpp)
target_include_directories(test_filter_adapter PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
    ${NEXUS_ROOT}/MultimodalWeldSystem/include
    ${NEXUS_ROOT}/Toolkit/include
    ${NEXUS_ROOT}/Nexus/include
    ${NEXUS_ROOT}/pos_transform/include
    ${NEXUS_ROOT}/RoboLinker/include
    ${NEXUS_ENV_ROOT}/Eigen3.4
    ${NEXUS_ENV_ROOT}/opencv-4.10.0/build/include
    ${NEXUS_ENV_ROOT}/spdlog/include
    ${NEXUS_ENV_ROOT}/tj_ipcsys_lib
    ${NEXUS_ENV_ROOT}/libmodbus/include
)
target_link_libraries(test_filter_adapter PRIVATE
    ${NEXUS_ROOT}/x64/Release/MultimodalWeldSystem.lib
    ${NEXUS_ROOT}/x64/Release/Toolkit.lib
    ${NEXUS_ROOT}/x64/Release/Nexus.lib
    ${NEXUS_ROOT}/x64/Release/pos_transform.lib
    ${NEXUS_ROOT}/x64/Release/RoboLinker.lib
    ${NEXUS_ENV_ROOT}/opencv-4.10.0/build/x64/vc16/lib/opencv_world4100.lib
    ${NEXUS_ENV_ROOT}/spdlog/lib/spdlog.lib
)
target_compile_definitions(test_filter_adapter PRIVATE NOMINMAX)
```
（链接库清单与 `pose_backend`/`test_adapter` 一致——已在 CMake 现有 target 里。）

构建运行：
```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target test_filter_adapter
copy /Y build\RelWithDebInfo\test_filter_adapter.exe runtime\test_filter_adapter.exe
cd runtime
.\test_filter_adapter.exe
```
Expected: `filter_distance: 20 pts (expect 20)` + `test_filter_adapter OK`。若 `setRot` 编译失败，改用 `RobotPointEx(pos, rot)` 构造并重试——记录最终用哪个。

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/src/filter_adapter.h backend/src/filter_adapter.cpp backend/src/tests/test_filter_adapter.cpp backend/CMakeLists.txt
git commit -m "feat(backend): filter_adapter 骨架与 distance 滤波节点"
```

---

## Task 2: 补全 filter_adapter 其余 7 个 filter

**Files:**
- Modify: `E:\person\project\PoseGenerator\backend\src\filter_adapter.cpp`
- Modify: `E:\person\project\PoseGenerator\backend\src\tests\test_filter_adapter.cpp`

**Interfaces:**
- Consumes: 7 个 filter 头（`MWS_AngleFilter.h` / `MWS_MeanSmoothingFilter.h` / `MWS_GaussianSmoothingFilter.h` / `MWS_SavitzkyGolayFilter.h` / `MWS_StatisticalOutlierFilter.h` / `MWS_RansacLineFilter.h`）。setXxx 签名见各头文件（构造设参或 set 方法）。
- Produces: `runFilter` 认 8 个 `filter_*` node_type。

- [ ] **Step 1: 在 filter_adapter.cpp 补全 7 个 filter 分支**

在 `filter_adapter.cpp` 顶部追加 include：

```cpp
#include "filter/MWS_AngleFilter.h"
#include "filter/MWS_MeanSmoothingFilter.h"
#include "filter/MWS_GaussianSmoothingFilter.h"
#include "filter/MWS_SavitzkyGolayFilter.h"
#include "filter/MWS_StatisticalOutlierFilter.h"
#include "filter/MWS_RansacLineFilter.h"
```

在 `runFilter` 的 `if (req.node_type == "filter_distance")` 之后、`throw` 之前追加 7 个分支：

```cpp
    if (req.node_type == "filter_angle") {
        float angleThreshold = static_cast<float>(p.count("angleThreshold") ? p.at("angleThreshold") : 30.0);
        int dirWin = static_cast<int>(p.count("directionWindowSize") ? p.at("directionWindowSize") : 5);
        mws::AngleFilter f(angleThreshold, dirWin);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_mean") {
        float radius = static_cast<float>(p.count("radius") ? p.at("radius") : 5.0);
        mws::MeanSmoothingFilter f(radius);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_gaussian") {
        double sigma = p.count("sigma") ? p.at("sigma") : 1.0;
        int kernelSize = static_cast<int>(p.count("kernelSize") ? p.at("kernelSize") : 9);
        mws::GaussianSmoothingFilter f(sigma, kernelSize);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_savgol") {
        int halfWindow = static_cast<int>(p.count("halfWindow") ? p.at("halfWindow") : 5);
        int degree = static_cast<int>(p.count("degree") ? p.at("degree") : 3);
        mws::SavitzkyGolayFilter f(halfWindow, degree);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_stat_outlier") {
        double threshold = p.count("threshold") ? p.at("threshold") : 0.5;
        int k = static_cast<int>(p.count("k") ? p.at("k") : 5);
        mws::StatisticalOutlierFilter f(threshold, k);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_ransac_line") {
        float inlierTh = static_cast<float>(p.count("inlierThreshold") ? p.at("inlierThreshold") : 1.0);
        int maxIter = static_cast<int>(p.count("maxIterations") ? p.at("maxIterations") : 100);
        float minRatio = static_cast<float>(p.count("minInlierRatio") ? p.at("minInlierRatio") : 0.7);
        bool enableProj = p.count("enableProjection") ? (p.at("enableProjection") != 0) : false;
        mws::RansacLineFilter f(inlierTh, maxIter, minRatio, enableProj);
        resp.result = f.apply(req.points);
        return resp;
    }
```

> 注意：`AngleFilter`/`SavitzkyGolayFilter` 构造函数就接受参数（无默认构造后 set），用构造方式。`RansacLineFilter` 的 `enableProjection` 是 bool，从 params 的 int（0/1）转。`GaussianSmoothingFilter` 的 `sigma` 是 double，`kernelSize` 是 int。

- [ ] **Step 2: 在 test_filter_adapter.cpp 补全 7 个 filter 的烟雾测试**

在 `main()` 末尾（`test_filter_adapter OK` 之前）追加（每个 filter 跑一次,验证不崩 + 返回点数合理）：

```cpp
    // 各 filter 烟雾测试:不崩 + 返回点数 >= 1(平滑类保留全部,过滤类可能减点)
    auto pts2 = pts;  // 复用 20 点直线
    auto runSmoke = [&](const std::string& node_type, std::map<std::string, double> params) {
        FilterRequest r; r.node_type = node_type; r.points = pts2; r.params = params;
        auto out = runFilter(r);
        assert(out.result.size() >= 1);
        std::cout << node_type << ": " << out.result.size() << " pts (in 20)\n";
    };
    runSmoke("filter_angle", {{"angleThreshold", 30.0}, {"directionWindowSize", 5}});
    runSmoke("filter_mean", {{"radius", 5.0}});
    runSmoke("filter_gaussian", {{"sigma", 1.0}, {"kernelSize", 9}});
    runSmoke("filter_savgol", {{"halfWindow", 5}, {"degree", 3}});
    runSmoke("filter_stat_outlier", {{"threshold", 0.5}, {"k", 5}});
    runSmoke("filter_ransac_line", {{"inlierThreshold", 1.0}, {"maxIterations", 100}, {"minInlierRatio", 0.7}, {"enableProjection", 0}});
```

- [ ] **Step 3: 构建运行**

```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target test_filter_adapter
copy /Y build\RelWithDebInfo\test_filter_adapter.exe runtime\test_filter_adapter.exe
cd runtime
.\test_filter_adapter.exe
```
Expected: 8 个 filter 各打印点数（in 20），最后 `test_filter_adapter OK`。若某个 filter 崩（如 `MeanSmoothingFilter` 的 nanoflann 路径），记录崩溃信息——可能需要调整测试点数据（如给非共线点）。

- [ ] **Step 4: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/src/filter_adapter.cpp backend/src/tests/test_filter_adapter.cpp
git commit -m "feat(backend): 补全 7 个 filter 节点的 adapter 分发"
```

---

## Task 3: main.cpp /node/execute 路由扩展

**Files:**
- Modify: `E:\person\project\PoseGenerator\backend\src\main.cpp`

**Interfaces:**
- Consumes: `parseFilterRequest`/`runFilter`/`serializeFilterResponse`（Task 1/2）。
- Produces: `/node/execute` 认 `filter_*` node_type，调 filter_adapter。

- [ ] **Step 1: 在 main.cpp 顶部加 include + 扩展路由**

在 `main.cpp` 顶部 `#include "pose_adapter.h"` 之后加：

```cpp
#include "filter_adapter.h"
```

在 `/node/execute` 路由里，现有 `if (node_type != "pose_generate")` 改为分流——把 `filter_` 前缀的走 filter_adapter。找到这段（现有逻辑 `if (node_type != "pose_generate") { ... unknown ... }`），改为：

```cpp
        if (node_type != "pose_generate" && node_type.rfind("filter_", 0) != 0) {
            res.status = 400;
            res.set_content("{\"error\":\"unknown node_type\"}", "application/json");
            return;
        }
        // filter_* node_type -> filter_adapter
        if (node_type.rfind("filter_", 0) == 0) {
            FilterRequest fr;
            if (!parseFilterRequest(body, fr)) {
                res.status = 400;
                res.set_content("{\"error\":\"invalid filter request shape\"}", "application/json");
                return;
            }
            try {
                FilterResponse resp = runFilter(fr);
                nlohmann::json out;
                nlohmann::json arr = nlohmann::json::array();
                for (const auto& pt : resp.result) {
                    cv::Point3f pos = pt.toPos();
                    cv::Point3f rot = pt.toRot();
                    arr.push_back({{"x",pos.x},{"y",pos.y},{"z",pos.z},
                                   {"rx",rot.x},{"ry",rot.y},{"rz",rot.z}});
                }
                out["output"] = {{"points", arr}, {"meta", nlohmann::json::object()}};
                res.set_content(out.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
            }
            return;
        }
        // 以下保留现有 pose_generate 逻辑(不变)
```

> `node_type.rfind("filter_", 0) == 0` 判断前缀。filter 分支 return 后，现有 pose_generate 逻辑（`nlohmann::json genReq; ...`）保持原样在下面。

- [ ] **Step 2: 构建并启动 curl 验证**

```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target pose_backend
cd runtime
.\pose_backend.exe
```
另开终端 curl：
```powershell
# filter_distance 通过 /node/execute
$body = '{"node_type":"filter_distance","input":{"points":[{"x":0,"y":0,"z":0},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"meta":{}},"params":{"min_th":5,"max_th":15}}'
curl -X POST http://localhost:8220/node/execute -H "Content-Type: application/json" -d $body
# expected: {"output":{"points":[...3 points...],"meta":{}}}

# pose_generate 仍可用(回归)
$body2 = '{"node_type":"pose_generate","input":{"points":[{"x":0,"y":0,"z":0},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"meta":{}},"params":{"output_mode":0,"initial_pose":{"rx":0,"ry":45,"rz":178}}}'
curl -X POST http://localhost:8220/node/execute -H "Content-Type: application/json" -d $body2
# expected: {"output":{"points":[...3 points with pose...],"meta":{}}}

# 未知 node_type
curl -X POST http://localhost:8220/node/execute -H "Content-Type: application/json" -d '{"node_type":"unknown","input":{"points":[],"meta":{}},"params":{}}'
# expected: 400 {"error":"unknown node_type"}
```
停止后端。捕获真实响应。

- [ ] **Step 3: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/src/main.cpp
git commit -m "feat(backend): /node/execute 路由分发 filter_* 节点"
```

---

## Task 4: 前端 8 个 filter 节点注册表

**Files:**
- Modify: `E:\person\project\PoseGenerator\frontend\src\lib\nodeRegistry.ts`

**Interfaces:**
- Consumes: `NodeDef`/`NodeParamSpec`/`PoseFrame`/`EMPTY_FRAME`（types）；`executeNode`（api/node.ts，签名 `(nodeType, input, params, signal?)`）。
- Produces: `NODE_REGISTRY` 新增 8 个 `filter_*` 项（type/label/category='tool'/isSource=false/isSink=false/params/execute/visualizableMeta=[]）。`RansacLineFilter` 加 `note?: string`（若 types 无此字段，Task 5 处理标注——本任务先在 NodeDef 内联注释，标注逻辑 Task 5）。

- [ ] **Step 1: 在 nodeRegistry.ts 加 8 个 filter NodeDef**

在 `nodeRegistry.ts` 的 `NODE_REGISTRY` 对象里，`pathview_export` 之后追加 8 个 filter 节点（照下表 schema）。先在文件顶部 `import` 后定义一个参数 schema 常量数组（避免对象内联过长），或直接内联——选择内联以贴合现有风格：

在 `NODE_REGISTRY` 对象的 `pathview_export: { ... },` 之后追加：

```ts
  filter_distance: {
    type: 'filter_distance',
    label: '距离滤波',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'min_th', label: 'min_th', type: 'number', min: 0, max: 50, step: 0.1, default: 1.0 },
      { key: 'max_th', label: 'max_th', type: 'number', min: 0, max: 500, step: 1, default: 30.0 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_distance', input, params);
    },
    visualizableMeta: [],
  },
  filter_angle: {
    type: 'filter_angle',
    label: '角度滤波',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'angleThreshold', label: 'angleThreshold', type: 'number', min: 0, max: 90, step: 1, default: 30.0 },
      { key: 'directionWindowSize', label: 'directionWindowSize', type: 'number', min: 2, max: 50, step: 1, default: 5 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_angle', input, params);
    },
    visualizableMeta: [],
  },
  filter_mean: {
    type: 'filter_mean',
    label: '均值平滑',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'radius', label: 'radius', type: 'number', min: 0.1, max: 100, step: 0.1, default: 5.0 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_mean', input, params);
    },
    visualizableMeta: [],
  },
  filter_gaussian: {
    type: 'filter_gaussian',
    label: '高斯平滑',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'sigma', label: 'sigma', type: 'number', min: 0.1, max: 10, step: 0.1, default: 1.0 },
      { key: 'kernelSize', label: 'kernelSize', type: 'number', min: 1, max: 51, step: 2, default: 9, forcedOdd: true },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_gaussian', input, params);
    },
    visualizableMeta: [],
  },
  filter_savgol: {
    type: 'filter_savgol',
    label: 'Savitzky-Golay 平滑',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'halfWindow', label: 'halfWindow', type: 'number', min: 1, max: 50, step: 1, default: 5 },
      { key: 'degree', label: 'degree', type: 'number', min: 1, max: 10, step: 1, default: 3 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_savgol', input, params);
    },
    visualizableMeta: [],
  },
  filter_stat_outlier: {
    type: 'filter_stat_outlier',
    label: '统计离群剔除',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'threshold', label: 'threshold', type: 'number', min: 0, max: 5, step: 0.1, default: 0.5 },
      { key: 'k', label: 'k', type: 'number', min: 1, max: 50, step: 1, default: 5 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_stat_outlier', input, params);
    },
    visualizableMeta: [],
  },
  filter_ransac_line: {
    type: 'filter_ransac_line',
    label: 'RANSAC 直线',
    category: 'tool',
    isSource: false, isSink: false,
    params: [
      { key: 'inlierThreshold', label: 'inlierThreshold', type: 'number', min: 0, max: 50, step: 0.1, default: 1.0 },
      { key: 'maxIterations', label: 'maxIterations', type: 'number', min: 1, max: 1000, step: 1, default: 100 },
      { key: 'minInlierRatio', label: 'minInlierRatio', type: 'number', min: 0, max: 1, step: 0.05, default: 0.7 },
      { key: 'enableProjection', label: 'enableProjection', type: 'select', default: 0, options: [{ value: 0, label: '关' }, { value: 1, label: '开' }] },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_ransac_line', input, params);
    },
    visualizableMeta: [],
  },
```

> `note` 字段（RANSAC 随机性标注）：现有 `NodeDef` 类型无 `note`。本任务不加类型字段，标注逻辑在 Task 5 用 `def.type === 'filter_ransac_line'` 硬编码判断（最简，避免改类型系统）。

- [ ] **Step 2: 类型检查**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend/src/lib/nodeRegistry.ts
git commit -m "feat(filter): 前端注册表新增 8 个 filter 节点"
```

---

## Task 5: NodeChain 添加列表按 category 分组 + RANSAC 标注

**Files:**
- Modify: `E:\person\project\PoseGenerator\frontend\src\components\NodeChain.tsx`
- Modify: `E:\person\project\PoseGenerator\frontend\src\App.css`（追加分组样式）

**Interfaces:**
- Consumes: `NODE_REGISTRY`（含 11 个节点，Task 4 后）。
- Produces: 添加列表按 category 分组（I/O / 算法 / 滤波）；`filter_ransac_line` 节点显示"RANSAC 结果有随机性"提示。

- [ ] **Step 1: 改 NodeChain 添加列表按 category 分组**

读 `E:\person\project\PoseGenerator\frontend\src\components\NodeChain.tsx`，找到现有 `addableTypes` 定义（`Object.values(NODE_REGISTRY).map(d => ({ type: d.type, label: d.label }))`）。改为按 category 分组：

把 `addableTypes` 的构建改为分组结构，渲染时按组分段。具体：

在 `NodeChain` 组件内，把：
```tsx
  const addableTypes = Object.values(NODE_REGISTRY).map(d => ({ type: d.type, label: d.label }));
```
改为：
```tsx
  // 按 category 分组:(io / algorithm / tool),tool 显示为"滤波"
  const addableGroups: { group: string; items: { type: string; label: string }[] }[] = [
    { group: 'I/O', items: [] },
    { group: '算法', items: [] },
    { group: '滤波', items: [] },
  ];
  for (const d of Object.values(NODE_REGISTRY)) {
    const idx = d.category === 'io' ? 0 : d.category === 'algorithm' ? 1 : 2;
    addableGroups[idx].items.push({ type: d.type, label: d.label });
  }
```

找到现有渲染添加按钮的两处（节点间的 `node-add` 和链尾 `node-add-tail`），把 `{addableTypes.map(t => ...)}` 改为按组渲染。节点间那处：
```tsx
          <div className="node-add">
            {addableGroups.map(g => (
              <span key={g.group} className="add-group">
                <span className="add-group-label">{g.group}</span>
                {g.items.map(t => (
                  <button key={t.type} onClick={() => props.onAddNode(t.type, n.id)} title={`在之后插入 ${t.label}`}>
                    + {t.label}
                  </button>
                ))}
              </span>
            ))}
          </div>
```
链尾那处同样改为 `addableGroups.map(...)`（结构相同，去掉 `n.id` 的 `afterId`）：
```tsx
      <div className="node-add node-add-tail">
        {addableGroups.map(g => (
          <span key={g.group} className="add-group">
            <span className="add-group-label">{g.group}</span>
            {g.items.map(t => (
              <button key={t.type} onClick={() => props.onAddNode(t.type)}>{t.label}</button>
            ))}
          </span>
        ))}
      </div>
```

- [ ] **Step 2: RANSAC 节点标注**

RANSAC 随机性标注在 `NodeCard.tsx`（不是 NodeChain）。读 `E:\person\project\PoseGenerator\frontend\src\components\NodeCard.tsx`，在节点卡片头部（`nc-head`）下方或 body 顶部，对 `def.type === 'filter_ransac_line'` 显示提示。在 `nc-body` 开头（`{expanded && (` 块内顶部）加：

```tsx
          {def.type === 'filter_ransac_line' && (
            <div className="nc-note">⚠ RANSAC 结果有随机性,重算可能变化</div>
          )}
```

- [ ] **Step 3: 追加 App.css 分组 + 标注样式**

在 `E:\person\project\PoseGenerator\frontend\src\App.css` 末尾追加：

```css
/* --- 节点添加分组 --- */
.add-group { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; }
.add-group-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin-right: 4px; }
.nc-note { font-family: var(--mono); font-size: 10px; color: var(--arc); padding: 4px 6px; background: rgba(255, 182, 39, 0.08); border-left: 2px solid var(--arc); border-radius: 2px; }
```

- [ ] **Step 4: 类型检查 + 构建**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsc --noEmit
npm run build
```
Expected: tsc 干净；build 成功。

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend/src/components/NodeChain.tsx frontend/src/components/NodeCard.tsx frontend/src/App.css
git commit -m "feat(filter): 添加列表按 category 分组,RANSAC 节点标注随机性"
```

---

## Task 6: 端到端验证 + 文档

**Files:**
- Modify: `E:\person\project\PoseGenerator\backend\README.md`（链接库清单补 filter）

**目的**：确认 filter 节点端到端可用，文档补齐。

- [ ] **Step 1: 跑全部前端单测 + test_filter_adapter**

```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsx src/lib/euler.test.ts
npx tsx src/lib/csv.test.ts
npx tsx src/api/node.test.ts
npx tsx src/lib/pipeline.test.ts
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target test_filter_adapter
copy /Y build\RelWithDebInfo\test_filter_adapter.exe runtime\test_filter_adapter.exe
.\runtime\test_filter_adapter.exe
```
Expected: 4 前端测试 OK + `test_filter_adapter OK`（8 filter 烟雾测试通过）。

- [ ] **Step 2: 端到端浏览器验证**

启动 pose_backend（`backend\runtime\pose_backend.exe`）、pathview（3001/5173 已在跑）、前端（`npm run dev` 5174）。浏览器 5174：
1. 默认流水线载入。
2. 在 csv_input 节点选一个 CSV（`frontend/public/corrugated_sample.csv`）。
3. 在 csv_input 与 pose_generate 之间插入一个 `filter_distance` 节点（点"滤波"组的"+ 距离滤波"）。
4. 选中 filter_distance → 右侧 NodeResult 显示过滤后的点（点数可能减少）。
5. 调 filter_distance 的 min_th 滑块 → 增量重算,结果刷新。
6. 选中 pose_generate → 显示用过滤后点算的姿态。
7. 插入 `filter_ransac_line` → 卡片显示"RANSAC 结果有随机性"标注。
8. 点 pathview_export 的推送按钮 → pathview 收到。

Expected: 全流程通过。

- [ ] **Step 3: 更新 backend/README 链接库清单**

`E:\person\project\PoseGenerator\backend\README.md` 的"链接库清单"节末尾追加一行说明 filter 复用同库：

```markdown

filter 节点（filter_distance/angle/mean/gaussian/savgol/stat_outlier/ransac_line）复用同一套 `MultimodalWeldSystem.lib`，无新增链接库。`POST /node/execute` 按 `node_type` 分发到 `filter_adapter`。
```

- [ ] **Step 4: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/README.md
git commit -m "docs(backend): 链接库清单补注 filter 复用说明"
```

---

## Self-Review

**1. Spec coverage:**
- §1.2 8 个 filter 节点 → Task 2（后端 adapter 8 分支）+ Task 4（前端 8 NodeDef）。
- §1.3 不改 nexus / 姿态透传 → Task 1（adapter 原样 toRot() 不清零）+ Task 4（execute 直接 ctx.executeNode）。
- §1.4 姿态脱钩代价 → 不干预（spec 接受，无代码）。
- §2 参数表 → Task 2（后端取参默认值）+ Task 4（前端 schema 范围/step/forcedOdd/select）。
- §2 kernelSize forcedOdd → Task 4 filter_gaussian schema。
- §2 enableProjection select 0/1 → Task 4 filter_ransac_line + Task 2 bool 转换。
- §2 RANSAC 随机性 UI 标注 → Task 5 NodeCard 标注。
- §3.2 filter_adapter → Task 1/2。
- §3.3 /node/execute 路由扩展 → Task 3。
- §3.4 前端 8 NodeDef → Task 4。
- §3.5 NodeChain 分组 → Task 5。
- §4 关键事实（不新增链接库等）→ Task 1 CMake 复用 + Task 6 README。
- 排除 CascadeRbtPathFilter → 计划未涉及，符合。

**2. Placeholder scan:** 无 TBD/TODO。setRot 编译失败的处理是明确指引（改用 RobotPointEx(pos,rot) 构造），非占位。MeanSmoothingFilter 崩溃处理是明确指引（调整测试点数据），非占位。

**3. Type consistency:**
- `FilterRequest`/`FilterResponse`（Task 1）→ Task 2/3 引用一致。
- `parseFilterRequest`/`serializeFilterResponse`/`runFilter`（Task 1）→ Task 2/3 调用一致。
- `node_type` 字符串：`filter_distance`/`filter_angle`/`filter_mean`/`filter_gaussian`/`filter_savgol`/`filter_stat_outlier`/`filter_ransac_line` → 后端（Task 2）与前端（Task 4）完全一致。
- 前端 `ctx.executeNode(nodeType, input, params)` 签名（现有 api/node.ts）→ Task 4 调用一致。
- `NodeDef.category: 'io'|'algorithm'|'tool'` → Task 5 分组用此字段。

无类型/签名不一致。

**4. Scope check:** 单一子系统（filter 节点 adapter + 前端注册 + UI 分组），无需拆分。
