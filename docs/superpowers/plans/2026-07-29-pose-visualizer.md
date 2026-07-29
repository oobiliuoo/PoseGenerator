# PoseGenerator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parameter-tuning web tool that imports a CSV path, calls the production C++ `CorrugatedWeldPoseGenerator::generate()` via a thin C++ HTTP backend, previews poses in-browser, and exports results to the existing pathview site for 3D display.

**Architecture:** Independent C++ backend (cpp-httplib) links the production `MultimodalWeldSystem.lib` from `E:\workspace\nexus` and exposes `POST /generate`. A React+Vite frontend imports CSV, tunes 8 algorithm params + initial pose, debounces real-time `/generate` calls, shows a 2D SVG preview + numeric table, and on click POSTs results to pathview's `POST /api/paths` then opens `http://localhost:5173`. No 3D in this project; no changes to the nexus production library or to pathview.

**Tech Stack:** C++17 (MSVC, x64, `/MD`, RelWithDebInfo), CMake, cpp-httplib, nlohmann/json, Eigen 3.4, OpenCV 4.10; React 19 + TypeScript + Vite, papaparse, native SVG.

## Global Constraints

- **NEXUS_ROOT** = `E:\workspace\nexus` (CMake variable, default this path). Backend include/link paths derive from it.
- **NEXUS_ENV_ROOT** = `$ENV{NEXUS_ENV_ROOT}`, fallback `${NEXUS_ROOT}/../env`. Provides Eigen/OpenCV headers.
- **Toolchain (must match nexus exactly for ABI):** MSVC, `CMAKE_CXX_STANDARD 17`, `CMAKE_MSVC_RUNTIME_LIBRARY MultiThreadedDLL` (`/MD`), x64, `RelWithDebInfo`.
- **Backend exe output directory** = `${NEXUS_ROOT}/x64/Release` (reuses nexus runtime DLL chain). Set via `RUNTIME_OUTPUT_DIRECTORY`.
- **Ports:** frontend Vite `5174`; C++ backend `8220`; pathview frontend `5173` (external, unchanged); pathview API `3001` (external, unchanged).
- **Vite proxy:** `/generate` → `http://localhost:8220`; `/api/paths` → `http://localhost:3001`.
- **Data conventions:** input point fields `x,y,z` (float); output pose fields `rx,ry,rz` (float, degrees, Euler ZYX intrinsic). Identical to pathview `PathPoint` — zero conversion.
- **`output_mode` is an integer in JSON:** `0=FULL`, `1=KEYPOINTS` (library `Params::toJson/fromJson` uses `static_cast<int>`).
- **Algorithm precondition:** `points.size() >= 3` (else library returns input unchanged; frontend must block submission < 3 points).
- **Do NOT modify** the nexus repository or the pathview repository.
- **Commit style:** conventional commits in Chinese, e.g. `feat(backend): 新增 /generate 接口`. This project is not yet a git repo — Task 1 initializes it.

---

## File Structure

```
PoseGenerator/
├── .gitignore
├── backend/
│   ├── CMakeLists.txt
│   ├── third_party/
│   │   ├── httplib.h                # cpp-httplib single header (downloaded in Task 2)
│   │   └── json.hpp                  # nlohmann/json single header (downloaded in Task 2)
│   └── src/
│       ├── main.cpp                  # HTTP server entry, /generate + /health
│       ├── pose_adapter.h            # declare: GenerateRequest/GenerateResponse structs, adapter funcs
│       ├── pose_adapter.cpp          # JSON<->C++ type conversion + call generate()
│       └── tests/
│           └── test_adapter.cpp      # behavior-consistency tests vs library
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── App.css
│       ├── api/
│       │   ├── generate.ts           # POST /generate typed client
│       │   └── pathview.ts           # POST /api/paths (createPath) + open
│       ├── types/
│       │   └── index.ts              # Point, PosePoint, GenerateParams, PosePreset
│       ├── hooks/
│       │   └── useGenerate.ts        # debounced real-time generate
│       ├── lib/
│       │   ├── csv.ts                # parse CSV -> Point[]
│       │   ├── euler.ts              # Euler ZYX -> direction vector (for 2D arrow)
│       │   └── presets.ts            # built-in + localStorage custom presets
│       └── components/
│           ├── CsvImport.tsx
│           ├── ParamsPanel.tsx
│           ├── PresetBar.tsx
│           ├── Preview2D.tsx
│           ├── PoseTable.tsx
│           └── BackendStatus.tsx
```

**Responsibilities:**
- `backend/src/pose_adapter.{h,cpp}` — the ONLY place that touches nexus types and `generate()`. Isolates the "behavior-identical" boundary; everything else is JSON IO.
- `backend/src/main.cpp` — HTTP wiring only; calls `pose_adapter`.
- `frontend/src/lib/euler.ts` — pure geometry for the 2D arrow; no backend dependency, unit-testable in-browser.
- `frontend/src/hooks/useGenerate.ts` — owns the debounce + latest-result state.
- `frontend/src/lib/presets.ts` — owns localStorage schema; UI components stay stateless of storage details.

---

## Task 1: Initialize project repo and root scaffolding

**Files:**
- Create: `E:\person\project\PoseGenerator\.gitignore`
- Create: `E:\person\project\PoseGenerator\README.md`

**Interfaces:**
- Produces: an initialized git repo at `E:\person\project\PoseGenerator` so subsequent tasks can commit.

- [ ] **Step 1: Initialize git repo**

Run (PowerShell):
```powershell
cd E:\person\project\PoseGenerator
git init
git add docs
git commit -m "chore: 初始化项目，纳入技术文档与设计/实现计划"
```

Expected: initial commit with `docs/` (the algorithm doc, spec, plan).

- [ ] **Step 2: Write `.gitignore`**

Create `E:\person\project\PoseGenerator\.gitignore`:
```
# Build artifacts
backend/build/
*.obj
*.pdb

# Frontend
frontend/node_modules/
frontend/dist/

# IDE / OS
.vs/
.vscode/
*.user
Thumbs.db

# Local runtime (do not commit nexus DLL copies if any land here)
*.dll
```

- [ ] **Step 3: Write `README.md`**

Create `E:\person\project\PoseGenerator\README.md`:
```markdown
# PoseGenerator

焊缝姿态生成参数调控工具。导入 CSV 路径，调用生产 C++ `CorrugatedWeldPoseGenerator::generate()` 生成姿态，就地预览，并跳转 pathview 做 3D 展示。

## 组成
- `backend/` — C++ HTTP 后端 (cpp-httplib)，原生链接 nexus `MultimodalWeldSystem` 库。
- `frontend/` — React + Vite 参数调控前端。

## 启动
见 `backend/` 与 `frontend/` 各自 README。依赖 `E:\workspace\nexus` 的构建产物。
```

- [ ] **Step 4: Commit**

```powershell
git add .gitignore README.md
git commit -m "chore: 添加 gitignore 与项目 README"
```

---

## Task 2: Backend CMake + third-party headers

**Files:**
- Create: `E:\person\project\PoseGenerator\backend\CMakeLists.txt`
- Create: `E:\person\project\PoseGenerator\backend\third_party\httplib.h`
- Create: `E:\person\project\PoseGenerator\backend\third_party\json.hpp`
- Create: `E:\person\project\PoseGenerator\backend\README.md`

**Interfaces:**
- Consumes: `${NEXUS_ROOT}` (env or default), `${NEXUS_ENV_ROOT}`.
- Produces: a CMake target `pose_backend` that compiles (no sources yet beyond a placeholder); the two single-header libs available under `third_party/`.

- [ ] **Step 1: Download cpp-httplib and nlohmann/json**

Run (PowerShell):
```powershell
cd E:\person\project\PoseGenerator\backend
New-Item -ItemType Directory -Force third_party | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.18.3/httplib.h" -OutFile third_party\httplib.h
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp" -OutFile third_party\json.hpp
```

Expected: both files exist and are non-empty. If the network is blocked, obtain these two files by any means and place them at the given paths — they are the only two third-party files the backend needs.

- [ ] **Step 2: Write `CMakeLists.txt`**

Create `E:\person\project\PoseGenerator\backend\CMakeLists.txt`:
```cmake
cmake_minimum_required(VERSION 3.16)
project(PoseBackend LANGUAGES CXX)

# --- NEXUS roots -----------------------------------------------------------
if(DEFINED ENV{NEXUS_ROOT})
    set(NEXUS_ROOT "$ENV{NEXUS_ROOT}")
else()
    set(NEXUS_ROOT "E:/workspace/nexus")
endif()

if(DEFINED ENV{NEXUS_ENV_ROOT})
    set(NEXUS_ENV_ROOT "$ENV{NEXUS_ENV_ROOT}")
else()
    set(NEXUS_ENV_ROOT "${NEXUS_ROOT}/../env")
endif()
string(REPLACE "\\" "/" NEXUS_ROOT "${NEXUS_ROOT}")
string(REPLACE "\\" "/" NEXUS_ENV_ROOT "${NEXUS_ENV_ROOT}")

# --- ABI must match nexus: MSVC, C++17, /MD, x64, RelWithDebInfo ----------
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
    add_compile_options(/utf-8 /FS /MP /bigobj /wd4819 /wd4828 /wd4114 /wd4005 /wd4091 /wd5208)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
endif()
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "" FORCE)
endif()

# --- Backend exe outputs into nexus runtime dir to reuse DLL chain ---------
set(NEXUS_RUNTIME_DIR "${NEXUS_ROOT}/x64/Release")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${NEXUS_RUNTIME_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO ${NEXUS_RUNTIME_DIR})

add_executable(pose_backend
    src/main.cpp
    src/pose_adapter.cpp
)
target_include_directories(pose_backend PRIVATE
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
target_link_libraries(pose_backend PRIVATE
    ${NEXUS_ROOT}/x64/Release/MultimodalWeldSystem.lib
)
target_compile_definitions(pose_backend PRIVATE NOMINMAX)
```

> Note: `MWS_Define.h` defines `_MWS_API` as `__declspec(dllimport)` when `MWS_API` is not defined — correct for consuming the DLL. Do NOT define `MWS_API` here.

- [ ] **Step 3: Write placeholder `src/main.cpp`** (filled in Task 4; exists now so CMake configures)

Create `E:\person\project\PoseGenerator\backend\src\main.cpp`:
```cpp
#include <iostream>
int main() {
    std::cout << "pose_backend placeholder\n";
    return 0;
}
```

Create `E:\person\project\PoseGenerator\backend\src\pose_adapter.cpp` (empty stub for now):
```cpp
// pose_adapter implementation added in Task 3.
```

- [ ] **Step 4: Write `backend/README.md`**

Create `E:\person\project\PoseGenerator\backend\README.md`:
```markdown
# PoseGenerator Backend

C++ HTTP 后端，原生链接 nexus `MultimodalWeldSystem` 库。

## 构建
需先在 `E:\workspace\nexus` 构建 `MultimodalWeldSystem`（产物在 `x64/Release/`）。

```powershell
cd backend
cmake -B build -S .
cmake --build build --config RelWithDebInfo
```
产物 `pose_backend.exe` 输出到 `E:\workspace\nexus\x64\Release\`（复用运行时 DLL 链）。

## 运行
```powershell
cd E:\workspace\nexus\x64\Release
.\pose_backend.exe
```
监听 `http://localhost:8220`。
```

- [ ] **Step 5: Configure and build to verify toolchain + DLL linkage resolves**

Run:
```powershell
cd E:\person\project\PoseGenerator\backend
cmake -B build -S -G "Visual Studio 17 2022" -A x64
cmake --build build --config RelWithDebInfo
```
Expected: `pose_backend.exe` produced in `E:\workspace\nexus\x64\Release\`. If link fails on missing `.lib` for other nexus internal DLLs (e.g. Toolkit/Nexus), add them to `target_link_libraries` (see Task 9 risk handling) and rebuild.

- [ ] **Step 6: Run the placeholder exe to verify DLL chain loads**

Run:
```powershell
cd E:\workspace\nexus\x64\Release
.\pose_backend.exe
```
Expected: prints `pose_backend placeholder` and exits 0. If it fails to start due to missing DLL, that is the runtime-DLL-chain risk — resolve by ensuring all transitively required DLLs are present in `x64/Release/` (they are, once nexus is built). Do not copy DLLs into this project.

- [ ] **Step 7: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend
git commit -m "feat(backend): 搭建 CMake 工程与第三方单头文件依赖"
```

---

## Task 3: Backend pose adapter — JSON ↔ C++ and call generate()

**Files:**
- Create: `E:\person\project\PoseGenerator\backend\src\pose_adapter.h`
- Modify: `E:\person\project\PoseGenerator\backend\src\pose_adapter.cpp`
- Create: `E:\person\project\PoseGenerator\backend\src\tests\test_adapter.cpp`

**Interfaces:**
- Consumes: `mws::CorrugatedWeldPoseGenerator`, `sa::RobotPointEx`, `cv::Point3f`, nlohmann/json.
- Produces:
  - `struct GenerateRequest { std::vector<sa::RobotPointEx> points; cv::Point3f initial_pose; mws::CorrugatedWeldPoseGenerator::Params params; };`
  - `struct GenerateResponse { std::vector<sa::RobotPointEx> result; };`
  - `bool parseGenerateRequest(const nlohmann::json& j, GenerateRequest& out);` — returns false on malformed input (throws caught internally).
  - `nlohmann::json serializeGenerateResponse(const GenerateResponse& resp);`
  - `GenerateResponse runGenerate(const GenerateRequest& req);` — constructs generator, setParams, calls `generate()`, returns result. This is the **only** call site of the production library.

- [ ] **Step 1: Write `pose_adapter.h`**

Create `E:\person\project\PoseGenerator\backend\src\pose_adapter.h`:
```cpp
#pragma once
#include <nlohmann/json.hpp>
#include <vector>
#include "tool/CorrugatedWeldPoseGenerator.h"
#include "NexusType.h"

struct GenerateRequest {
    std::vector<sa::RobotPointEx> points;
    cv::Point3f initial_pose{0, 0, 0};
    mws::CorrugatedWeldPoseGenerator::Params params;
};

struct GenerateResponse {
    std::vector<sa::RobotPointEx> result;
};

// Parse JSON request into C++ structs. Returns false on malformed input.
// JSON shape: {points:[{x,y,z}], initial_pose:{rx,ry,rz}, params:{...}}
// output_mode is int (0=FULL,1=KEYPOINTS). Missing params fields use library defaults.
bool parseGenerateRequest(const nlohmann::json& j, GenerateRequest& out);

// Serialize result to JSON: {result:[{x,y,z,rx,ry,rz}], point_count:N}
nlohmann::json serializeGenerateResponse(const GenerateResponse& resp);

// The ONLY call site of the production library.
GenerateResponse runGenerate(const GenerateRequest& req);
```

- [ ] **Step 2: Write `pose_adapter.cpp`**

Replace `E:\person\project\PoseGenerator\backend\src\pose_adapter.cpp` with:
```cpp
#include "pose_adapter.h"
#include <stdexcept>

namespace {
nlohmann::json paramsToJson(const mws::CorrugatedWeldPoseGenerator::Params& p) {
    // Mirror library Params::toJson but with nlohmann::json (library Json type
    // is nexus-internal; we re-encode here for our HTTP contract).
    return {
        {"curvature_threshold", p.curvature_threshold},
        {"smooth_half_width", p.smooth_half_width},
        {"tangent_smooth_window", p.tangent_smooth_window},
        {"min_corner_region_length", p.min_corner_region_length},
        {"output_mode", static_cast<int>(p.output_mode)},
        {"max_pose_change_angle", p.max_pose_change_angle},
        {"all_curve_threshold", p.all_curve_threshold},
        {"keypoint_pose_angle_threshold", p.keypoint_pose_angle_threshold},
    };
}
} // namespace

bool parseGenerateRequest(const nlohmann::json& j, GenerateRequest& out) {
    try {
        out.points.clear();
        for (auto& pj : j.at("points")) {
            sa::RobotPointEx pt(
                static_cast<float>(pj.value("x", 0.0)),
                static_cast<float>(pj.value("y", 0.0)),
                static_cast<float>(pj.value("z", 0.0))
            );
            out.points.push_back(pt);
        }
        const auto& ip = j.at("initial_pose");
        out.initial_pose = cv::Point3f(
            static_cast<float>(ip.value("rx", 0.0)),
            static_cast<float>(ip.value("ry", 0.0)),
            static_cast<float>(ip.value("rz", 0.0))
        );
        // Build Params via library fromJson for behavior-identical defaults/enum handling.
        // We pass our nlohmann::json through a string boundary if the library Json type
        // differs; here we construct Params field-by-field using the same int-cast the
        // library uses, to stay consistent with library semantics.
        mws::CorrugatedWeldPoseGenerator::Params p;
        const auto& pj = j.value("params", nlohmann::json::object());
        p.curvature_threshold = pj.value("curvature_threshold", 0.07);
        p.smooth_half_width = pj.value("smooth_half_width", 2);
        p.tangent_smooth_window = pj.value("tangent_smooth_window", 5);
        p.min_corner_region_length = pj.value("min_corner_region_length", 2);
        p.output_mode = static_cast<mws::CorrugatedWeldPoseGenerator::Params::OutputMode>(
            pj.value("output_mode", 0));
        p.max_pose_change_angle = pj.value("max_pose_change_angle", 45.0);
        p.all_curve_threshold = pj.value("all_curve_threshold", 0.8);
        p.keypoint_pose_angle_threshold = pj.value("keypoint_pose_angle_threshold", 5.0);
        out.params = p;
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

nlohmann::json serializeGenerateResponse(const GenerateResponse& resp) {
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& pt : resp.result) {
        cv::Point3f pos = pt.toPos();
        cv::Point3f rot = pt.toRot();
        arr.push_back({
            {"x", pos.x}, {"y", pos.y}, {"z", pos.z},
            {"rx", rot.x}, {"ry", rot.y}, {"rz", rot.z},
        });
    }
    return {{"result", arr}, {"point_count", resp.result.size()}};
}

GenerateResponse runGenerate(const GenerateRequest& req) {
    mws::CorrugatedWeldPoseGenerator generator;
    generator.setParams(req.params);
    GenerateResponse resp;
    resp.result = generator.generate(req.points, req.initial_pose);
    return resp;
}
```

> Note on `Params::fromJson`: the library's `fromJson` takes a nexus `Json` type (from `Json_Base.h`), not nlohmann::json. To avoid coupling to nexus's internal Json type, we decode params field-by-field with the same default values and the same `static_cast<int>` enum handling that the library's `fromJson` uses (verified in `CorrugatedWeldPoseGenerator.cpp` lines 143–157). This preserves behavior-identical semantics without a cross-Json-type bridge.

- [ ] **Step 3: Write behavior-consistency test**

Create `E:\person\project\PoseGenerator\backend\src\tests\test_adapter.cpp`:
```cpp
#include <cassert>
#include <iostream>
#include "../pose_adapter.h"

// Behavior-consistency test: the adapter must produce the same result the
// library produces when called directly with the same inputs.
int main() {
    // Linear path of 20 points along X.
    std::vector<sa::RobotPointEx> pts;
    for (int i = 0; i < 20; ++i) pts.emplace_back(i * 10.0f, 0.0f, 0.0f);

    GenerateRequest req;
    req.points = pts;
    req.initial_pose = cv::Point3f(0.0f, 45.0f, 178.0f);
    // params left as defaults

    // Reference: direct library call.
    mws::CorrugatedWeldPoseGenerator ref;
    ref.setParams(req.params);
    auto ref_result = ref.generate(req.points, req.initial_pose);

    // Adapter call.
    auto resp = runGenerate(req);

    assert(resp.result.size() == ref_result.size());
    for (size_t i = 0; i < resp.result.size(); ++i) {
        cv::Point3f a = resp.result[i].toRot();
        cv::Point3f b = ref_result[i].toRot();
        assert(std::abs(a.x - b.x) < 1e-4f);
        assert(std::abs(a.y - b.y) < 1e-4f);
        assert(std::abs(a.z - b.z) < 1e-4f);
    }

    // JSON round-trip sanity.
    nlohmann::json j;
    j["points"] = nlohmann::json::array();
    for (auto& p : pts) j["points"].push_back({{"x", p.x}, {"y", p.y}, {"z", p.z}});
    j["initial_pose"] = {{"rx", 0.0}, {"ry", 45.0}, {"rz", 178.0}};
    j["params"] = {{"output_mode", 0}};
    GenerateRequest parsed;
    assert(parseGenerateRequest(j, parsed));
    assert(parsed.points.size() == 20);
    assert(parsed.initial_pose.y == 45.0f);

    std::cout << "test_adapter OK\n";
    return 0;
}
```

- [ ] **Step 4: Add test target to CMake and build**

Append to `E:\person\project\PoseGenerator\backend\CMakeLists.txt` (before the `add_executable(pose_backend...)` line is fine — append at end):
```cmake
add_executable(test_adapter src/tests/test_adapter.cpp src/pose_adapter.cpp)
target_include_directories(test_adapter PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
    ${CEXUS_ROOT}/MultimodalWeldSystem/include
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
target_link_libraries(test_adapter PRIVATE ${NEXUS_ROOT}/x64/Release/MultimodalWeldSystem.lib)
target_compile_definitions(test_adapter PRIVATE NOMINMAX)
set_target_properties(test_adapter PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
```
**Important:** Fix the typo `CEXUS_ROOT` → `NEXUS_ROOT` when writing it. (This is a deliberate typo check — write `NEXUS_ROOT`.)

Run:
```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target test_adapter
.\build\RelWithDebInfo\test_adapter.exe
```
Expected: prints `test_adapter OK`. If link fails on other nexus `.lib`s, add them to `target_link_libraries` for both targets (see Task 9).

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/src
git commit -m "feat(backend): 实现 pose 适配层，封装 JSON<->C++ 与 generate 调用"
```

---

## Task 4: Backend HTTP server — /generate and /health

**Files:**
- Modify: `E:\person\project\PoseGenerator\backend\src\main.cpp`

**Interfaces:**
- Consumes: `parseGenerateRequest`, `runGenerate`, `serializeGenerateResponse` from Task 3.
- Produces: `pose_backend.exe` listening on `0.0.0.0:8220` with `POST /generate` and `GET /health`. Cross-origin from Vite proxy (same-origin in dev), so no CORS needed; add minimal CORS headers anyway for direct calls.

- [ ] **Step 1: Replace `main.cpp`**

Replace `E:\person\project\PoseGenerator\backend\src\main.cpp` with:
```cpp
#include <httplib.h>
#include <iostream>
#include "pose_adapter.h"

int main() {
    httplib::Server svr;

    svr.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
    });

    svr.Post("/generate", [](const httplib::Request& req, httplib::Response& res) {
        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
        } catch (...) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid JSON\"}", "application/json");
            return;
        }
        GenerateRequest gr;
        if (!parseGenerateRequest(body, gr)) {
            res.status = 400;
            res.set_content("{\"error\":\"invalid request shape\"}", "application/json");
            return;
        }
        if (gr.points.size() < 3) {
            // Library returns input unchanged for <3 points; mirror that.
            GenerateResponse resp;
            resp.result = gr.points;
            res.set_content(serializeGenerateResponse(resp).dump(), "application/json");
            return;
        }
        try {
            GenerateResponse resp = runGenerate(gr);
            res.set_content(serializeGenerateResponse(resp).dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(std::string("{\"error\":\"") + e.what() + "\"}", "application/json");
        }
    });

    std::cout << "pose_backend listening on http://localhost:8220\n";
    svr.listen("0.0.0.0", 8220);
    return 0;
}
```

- [ ] **Step 2: Build**

Run:
```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo --target pose_backend
```
Expected: builds cleanly.

- [ ] **Step 3: Manual smoke test (start server, curl endpoints)**

In one terminal:
```powershell
cd E:\workspace\nexus\x64\Release
.\pose_backend.exe
```
In another:
```powershell
curl http://localhost:8220/health
# expected: {"status":"ok"}

$body = '{"points":[{"x":0,"y":0,"z":0},{"x":10,"y":0,"z":0},{"x":20,"y":0,"z":0}],"initial_pose":{"rx":0,"ry":45,"rz":178},"params":{"output_mode":0}}'
curl -X POST http://localhost:8220/generate -H "Content-Type: application/json" -d $body
```
Expected: a JSON object with `result` (3 points each having `x,y,z,rx,ry,rz`) and `point_count: 3`. Stop the server with Ctrl-C.

- [ ] **Step 4: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend/src/main.cpp
git commit -m "feat(backend): 实现 /generate 与 /health HTTP 接口"
```

---

## Task 5: Frontend scaffold + Vite proxy + types

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\package.json`
- Create: `E:\person\project\PoseGenerator\frontend\tsconfig.json`
- Create: `E:\person\project\PoseGenerator\frontend\vite.config.ts`
- Create: `E:\person\project\PoseGenerator\frontend\index.html`
- Create: `E:\person\project\PoseGenerator\frontend\src\main.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\App.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\App.css`
- Create: `E:\person\project\PoseGenerator\frontend\src\types\index.ts`

**Interfaces:**
- Produces: a Vite app on port 5174 that builds and renders a placeholder; proxy config wiring `/generate`→8220 and `/api/paths`→3001.

- [ ] **Step 1: Write `package.json`**

Create `E:\person\project\PoseGenerator\frontend\package.json`:
```json
{
  "name": "pose-generator-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "papaparse": "^5.4.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/papaparse": "^5.3.15",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

Create `E:\person\project\PoseGenerator\frontend\tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

Create `E:\person\project\PoseGenerator\frontend\vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/generate': { target: 'http://localhost:8220', changeOrigin: true },
      '/health':   { target: 'http://localhost:8220', changeOrigin: true },
      '/api/paths': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 4: Write `index.html`, `main.tsx`, `App.tsx`, `App.css`**

Create `E:\person\project\PoseGenerator\frontend\index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PoseGenerator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `E:\person\project\PoseGenerator\frontend\src\main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

Create `E:\person\project\PoseGenerator\frontend\src\App.tsx`:
```tsx
export default function App() {
  return <div className="app"><h1>PoseGenerator</h1><p>scaffold</p></div>;
}
```

Create `E:\person\project\PoseGenerator\frontend\src\App.css`:
```css
.app { font-family: system-ui, sans-serif; padding: 16px; }
```

- [ ] **Step 5: Write `types/index.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\types\index.ts`:
```ts
export interface Point { x: number; y: number; z: number; }

export interface PosePoint extends Point { rx: number; ry: number; rz: number; }

export type OutputMode = 0 | 1; // 0=FULL, 1=KEYPOINTS

export interface GenerateParams {
  curvature_threshold: number;
  smooth_half_width: number;
  tangent_smooth_window: number;     // forced odd on the UI side
  min_corner_region_length: number;
  output_mode: OutputMode;
  max_pose_change_angle: number;
  all_curve_threshold: number;
  keypoint_pose_angle_threshold: number;
}

export interface InitialPose { rx: number; ry: number; rz: number; }

export interface GenerateRequest {
  points: Point[];
  initial_pose: InitialPose;
  params: GenerateParams;
}

export interface GenerateResponse {
  result: PosePoint[];
  point_count: number;
}

export interface PosePreset {
  name: string;
  initial_pose: InitialPose;
  params: GenerateParams;
  builtin?: boolean;
}

export const DEFAULT_PARAMS: GenerateParams = {
  curvature_threshold: 0.07,
  smooth_half_width: 2,
  tangent_smooth_window: 5,
  min_corner_region_length: 2,
  output_mode: 0,
  max_pose_change_angle: 45.0,
  all_curve_threshold: 0.8,
  keypoint_pose_angle_threshold: 5.0,
};

export const DEFAULT_INITIAL_POSE: InitialPose = { rx: 0, ry: 45, rz: 178 };
```

- [ ] **Step 6: Install and run dev server**

Run:
```powershell
cd E:\person\project\PoseGenerator\frontend
npm install
npm run dev
```
Expected: Vite serving on `http://localhost:5174`, browser shows "PoseGenerator scaffold". Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend
git commit -m "feat(frontend): 搭建 React+Vite 工程、代理与类型定义"
```

---

## Task 6: Frontend lib — CSV parse, Euler→direction, presets

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\csv.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\euler.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\presets.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\lib\csv.test.ts`

**Interfaces:**
- Produces:
  - `parseCsvPoints(text: string): { points: Point[]; ignored: number; header: boolean }` in `csv.ts`
  - `eulerToDirXY(rx, ry, rz): { dx: number; dy: number }` in `euler.ts` — returns the XY projection of the tool's Z-axis after ZYX intrinsic Euler rotation, for the 2D arrow.
  - `BUILTIN_PRESETS: PosePreset[]`, `loadCustomPresets(): PosePreset[]`, `saveCustomPreset(p)`, `deleteCustomPreset(name)` in `presets.ts`.

- [ ] **Step 1: Write `euler.ts` (pure, testable)**

Create `E:\person\project\PoseGenerator\frontend\src\lib\euler.ts`:
```ts
// Euler ZYX intrinsic (rz about Z, then ry about Y, then rx about X), degrees.
// Returns the XY projection of the tool Z-axis (0,0,1) after rotation, as a
// direction vector for the 2D preview arrow.
export function eulerToDirXY(rx: number, ry: number, rz: number): { dx: number; dy: number } {
  const deg2rad = Math.PI / 180;
  const ax = rx * deg2rad, ay = ry * deg2rad, az = rz * deg2rad;
  // R = Rz(az) * Ry(ay) * Rx(ax), intrinsic ZYX. Apply to v=(0,0,1).
  // Rx(ax) on (0,0,1): (0, -sin(ax)? ... ) — compute via matrix mult.
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const cz = Math.cos(az), sz = Math.sin(az);
  // Rx = [[1,0,0],[0,cx,-sx],[0,sx,cx]]
  // Ry = [[cy,0,sy],[0,1,0],[-sy,0,cy]]
  // Rz = [[cz,-sz,0],[sz,cz,0],[0,0,1]]
  // R = Rz * Ry * Rx, v=(0,0,1):
  // Rx*v = (0, -sx, cx)
  // Ry*(Rx*v) = (cy*0 + sy*cx, -sx, -sy*0 + cy*cx) = (sy*cx, -sx, cy*cx)
  // Rz*(Ry*Rx*v) = (cz*sy*cx - sz*(-sx), sz*sy*cx + cz*(-sx), cy*cx)
  //              = (cz*sy*cx + sz*sx, sz*sy*cx - cz*sx, cy*cx)
  const vx = cz * sy * cx + sz * sx;
  const vy = sz * sy * cx - cz * sx;
  const len = Math.hypot(vx, vy);
  if (len < 1e-8) return { dx: 0, dy: 0 }; // vertical tool — no XY direction
  return { dx: vx / len, dy: vy / len };
}
```

- [ ] **Step 2: Write `euler.test.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\lib\euler.test.ts`:
```ts
import assert from 'node:assert';
import { eulerToDirXY } from './euler';

// Identity pose (0,0,0): tool Z is straight up -> no XY projection.
let r = eulerToDirXY(0, 0, 0);
assert(r.dx === 0 && r.dy === 0, 'identity should have no XY direction');

// rz=90: tool Z still vertical (rz only rotates around Z) -> still no XY.
r = eulerToDirXY(0, 0, 90);
assert(r.dx === 0 && r.dy === 0, 'pure rz keeps tool vertical');

// ry=90: tool Z tilts to +X -> dx=1, dy=0
r = eulerToDirXY(0, 90, 0);
assert(Math.abs(r.dx - 1) < 1e-6 && Math.abs(r.dy) < 1e-6, 'ry=90 -> +X');

console.log('euler.test OK');
```
Run (node is available via npm tooling):
```powershell
cd E:\person\project\PoseGenerator\frontend
npx tsx src/lib/euler.test.ts
```
If tsx is not installed, install as devDep `npm i -D tsx` first. Expected: `euler.test OK`.

- [ ] **Step 3: Write `csv.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\lib\csv.ts`:
```ts
import Papa from 'papaparse';
import type { Point } from '../types';

export interface CsvParseResult { points: Point[]; ignored: number; header: boolean; }

export function parseCsvPoints(text: string): CsvParseResult {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = res.data as string[][];
  if (rows.length === 0) return { points: [], ignored: 0, header: false };

  // Detect header: if any cell in row 0 is non-numeric (after trim).
  const first = rows[0].map(c => (c ?? '').trim());
  const isHeader = first.some(c => c.length > 0 && isNaN(Number(c)));
  const dataRows = isHeader ? rows.slice(1) : rows;

  const points: Point[] = [];
  let ignored = 0;
  for (const row of dataRows) {
    const cells = row.map(c => (c ?? '').trim());
    if (cells.length < 3) { ignored++; continue; }
    const x = Number(cells[0]), y = Number(cells[1]), z = Number(cells[2]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) { ignored++; continue; }
    points.push({ x, y, z });
  }
  return { points, ignored, header: isHeader };
}
```

- [ ] **Step 4: Write `presets.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\lib\presets.ts`:
```ts
import type { GenerateParams, InitialPose, PosePreset } from '../types';
import { DEFAULT_PARAMS, DEFAULT_INITIAL_POSE } from '../types';

const STORAGE_KEY = 'pose_generator_custom_presets';

export const BUILTIN_PRESETS: PosePreset[] = [
  {
    name: '默认',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: { ...DEFAULT_PARAMS },
    builtin: true,
  },
  {
    name: '波纹板',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: {
      ...DEFAULT_PARAMS,
      curvature_threshold: 0.07,
      smooth_half_width: 2,
      tangent_smooth_window: 5,
      min_corner_region_length: 1,
    },
    builtin: true,
  },
  {
    name: '圆形闭环',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: {
      ...DEFAULT_PARAMS,
      curvature_threshold: 0.001,
      all_curve_threshold: 0.6,
      smooth_half_width: 0,
      tangent_smooth_window: 5,
    },
    builtin: true,
  },
  {
    name: '一般弧形',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: {
      ...DEFAULT_PARAMS,
      output_mode: 1,            // KEYPOINTS
      max_pose_change_angle: 30.0,
      keypoint_pose_angle_threshold: 3.0,
    },
    builtin: true,
  },
];

export function loadCustomPresets(): PosePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PosePreset[];
    return arr.filter(p => p && p.name && p.params && p.initial_pose);
  } catch { return []; }
}

export function saveCustomPreset(p: PosePreset): PosePreset[] {
  const list = loadCustomPresets().filter(x => x.name !== p.name);
  list.push({ ...p, builtin: false });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function deleteCustomPreset(name: string): PosePreset[] {
  const list = loadCustomPresets().filter(x => x.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}
```

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend/src/lib
git commit -m "feat(frontend): 实现 CSV 解析、欧拉角方向计算与参数预设库"
```

---

## Task 7: Frontend API + useGenerate hook

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\api\generate.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\api\pathview.ts`
- Create: `E:\person\project\PoseGenerator\frontend\src\hooks\useGenerate.ts`

**Interfaces:**
- Produces:
  - `generate(req: GenerateRequest): Promise<GenerateResponse>` in `generate.ts` (POST `/generate`)
  - `sendToPathview(points: PosePoint[], sourceFile: string): Promise<number>` in `pathview.ts` (POST `/api/paths`, returns new path id)
  - `useGenerate(req: GenerateRequest, enabled: boolean)` hook: debounce 200ms, holds `result`, `error`, `loading`.

- [ ] **Step 1: Write `generate.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\api\generate.ts`:
```ts
import type { GenerateRequest, GenerateResponse } from '../types';

export async function generate(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `generate failed: ${res.status}`);
  }
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const r = await fetch('/health');
    return r.ok;
  } catch { return false; }
}
```

- [ ] **Step 2: Write `pathview.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\api\pathview.ts`:
```ts
import type { PosePoint } from '../types';

// POST points to pathview's /api/paths via Vite proxy. Returns new path id.
export async function sendToPathview(points: PosePoint[], sourceFile: string): Promise<number> {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const name = `${sourceFile} ${hh}:${mm}:${ss}`;
  const res = await fetch('/api/paths', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, source_file: sourceFile, points }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || 'failed to create path in pathview');
  }
  const data = await res.json();
  return data.id as number;
}

export function openPathview(): void {
  window.open('http://localhost:5173', '_blank');
}
```

- [ ] **Step 3: Write `useGenerate.ts`**

Create `E:\person\project\PoseGenerator\frontend\src\hooks\useGenerate.ts`:
```ts
import { useEffect, useRef, useState } from 'react';
import type { GenerateRequest, GenerateResponse } from '../types';
import { generate } from '../api/generate';

export function useGenerate(req: GenerateRequest, enabled: boolean) {
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(req);
  reqRef.current = req;

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await generate(reqRef.current);
        setResult(r);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [req, enabled]);

  return { result, error, loading };
}
```

- [ ] **Step 4: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend/src/api frontend/src/hooks
git commit -m "feat(frontend): 实现 generate/pathview API 与防抖 useGenerate hook"
```

---

## Task 8: Frontend components — CSV, Params, Presets, Preview, Table, Status

**Files:**
- Create: `E:\person\project\PoseGenerator\frontend\src\components\CsvImport.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\ParamsPanel.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\PresetBar.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\Preview2D.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\PoseTable.tsx`
- Create: `E:\person\project\PoseGenerator\frontend\src\components\BackendStatus.tsx`

**Interfaces:**
- Consumes: types, `parseCsvPoints`, `eulerToDirXY`, presets lib, `healthCheck`, `useGenerate` types.
- Produces: presentational/stateful components composed in App (Task 9).

- [ ] **Step 1: Write `BackendStatus.tsx`**

Create `E:\person\project\PoseGenerator\frontend\src\components\BackendStatus.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { healthCheck } from '../api/generate';

export function BackendStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const tick = async () => { if (active) setOk(await healthCheck()); };
    tick();
    const id = setInterval(tick, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);
  const color = ok ? '#22c55e' : (ok === false ? '#ef4444' : '#9ca3af');
  const label = ok ? '后端在线' : (ok === false ? '后端离线' : '检测中');
  return <span style={{ color }}>{label}</span>;
}
```

- [ ] **Step 2: Write `CsvImport.tsx`**

Create `E:\person\project\PoseGenerator\frontend\src\components\CsvImport.tsx`:
```tsx
import { useRef } from 'react';
import { parseCsvPoints } from '../lib/csv';
import type { Point } from '../types';

interface Props {
  onLoaded: (points: Point[], fileName: string) => void;
  fileName: string | null;
  pointCount: number;
  ignored: number;
}

export function CsvImport({ onLoaded, fileName, pointCount, ignored }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = parseCsvPoints(text);
      onLoaded(res.points, file.name);
    };
    reader.readAsText(file);
  };
  return (
    <div className="csv-import">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }}
      />
      {fileName && (
        <div className="csv-meta">
          <div>文件: {fileName}</div>
          <div>点数: {pointCount}{ignored > 0 ? ` （忽略 ${ignored} 行）` : ''}</div>
          {pointCount < 3 && <div style={{ color: '#ef4444' }}>至少需要 3 个点</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `ParamsPanel.tsx`**

Create `E:\person\project\PoseGenerator\frontend\src\components\ParamsPanel.tsx`:
```tsx
import type { GenerateParams, InitialPose, OutputMode } from '../types';

interface Props {
  params: GenerateParams;
  initialPose: InitialPose;
  onParams: (p: GenerateParams) => void;
  onInitialPose: (p: InitialPose) => void;
}

// Shared numeric slider+number control.
function NumControl(props: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; hint?: string;
}) {
  const { label, value, min, max, step, onChange, disabled, hint } = props;
  return (
    <div className="ctrl" style={{ opacity: disabled ? 0.4 : 1 }}>
      <label>{label}{hint ? <span className="hint"> ({hint})</span> : null}</label>
      <div className="ctrl-row">
        <input type="range" min={min} max={max} step={step} value={value}
          disabled={disabled}
          onChange={e => onChange(parseFloat(e.target.value))} />
        <input type="number" min={min} max={max} step={step} value={value}
          disabled={disabled}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ width: 80 }} />
      </div>
    </div>
  );
}

export function ParamsPanel({ params, initialPose, onParams, onInitialPose }: Props) {
  const setP = (patch: Partial<GenerateParams>) => onParams({ ...params, ...patch });
  // tangent_smooth_window forced odd
  const setTsw = (v: number) => {
    const i = Math.max(1, Math.round(v));
    setP({ tangent_smooth_window: i % 2 === 0 ? i + 1 : i });
  };
  // keypoint threshold active only when all-curve + KEYPOINTS cannot be known
  // without middle state; per spec, gray out when NOT (output_mode==KEYPOINTS).
  // (all_curve_threshold is a ratio threshold, not a mode flag; we use the
  // conservative rule from the spec: gray unless output_mode==KEYPOINTS.)
  const kpDisabled = params.output_mode !== 1;

  return (
    <div className="params-panel">
      <h3>初始姿态 (度, ZYX)</h3>
      <NumControl label="rx" value={initialPose.rx} min={-180} max={180} step={0.5}
        onChange={v => onInitialPose({ ...initialPose, rx: v })} />
      <NumControl label="ry" value={initialPose.ry} min={-180} max={180} step={0.5}
        onChange={v => onInitialPose({ ...initialPose, ry: v })} />
      <NumControl label="rz" value={initialPose.rz} min={-180} max={180} step={0.5}
        onChange={v => onInitialPose({ ...initialPose, rz: v })} />

      <h3>算法参数</h3>
      <NumControl label="curvature_threshold" value={params.curvature_threshold}
        min={0} max={0.5} step={0.001} onChange={v => setP({ curvature_threshold: v })} />
      <NumControl label="smooth_half_width" value={params.smooth_half_width}
        min={0} max={50} step={1} onChange={v => setP({ smooth_half_width: Math.round(v) })} />
      <NumControl label="tangent_smooth_window" value={params.tangent_smooth_window}
        min={1} max={51} step={1} onChange={setTsw} hint="强制奇数" />
      <NumControl label="min_corner_region_length" value={params.min_corner_region_length}
        min={1} max={50} step={1} onChange={v => setP({ min_corner_region_length: Math.round(v) })} />
      <div className="ctrl">
        <label>output_mode</label>
        <select value={params.output_mode}
          onChange={e => setP({ output_mode: Number(e.target.value) as OutputMode })}>
          <option value={0}>FULL</option>
          <option value={1}>KEYPOINTS</option>
        </select>
      </div>
      <NumControl label="max_pose_change_angle" value={params.max_pose_change_angle}
        min={0} max={180} step={0.5} onChange={v => setP({ max_pose_change_angle: v })} />
      <NumControl label="all_curve_threshold" value={params.all_curve_threshold}
        min={0} max={1} step={0.01} onChange={v => setP({ all_curve_threshold: v })} />
      <NumControl label="keypoint_pose_angle_threshold" value={params.keypoint_pose_angle_threshold}
        min={0} max={90} step={0.5} disabled={kpDisabled}
        onChange={v => setP({ keypoint_pose_angle_threshold: v })}
        hint={kpDisabled ? '仅 KEYPOINTS 模式生效' : undefined} />
    </div>
  );
}
```

- [ ] **Step 4: Write `PresetBar.tsx`**

Create `E:\person\project\PoseGenerator\frontend\src\components\PresetBar.tsx`:
```tsx
import { useEffect, useState } from 'react';
import type { PosePreset } from '../types';
import { BUILTIN_PRESETS, loadCustomPresets, saveCustomPreset, deleteCustomPreset } from '../lib/presets';

interface Props {
  current: PosePreset; // current params+pose packed
  onApply: (p: PosePreset) => void;
}

export function PresetBar({ current, onApply }: Props) {
  const [custom, setCustom] = useState<PosePreset[]>([]);
  useEffect(() => { setCustom(loadCustomPresets()); }, []);

  const save = () => {
    const name = window.prompt('预设名称', '我的预设');
    if (!name) return;
    setCustom(saveCustomPreset({ ...current, name }));
  };
  const remove = (name: string) => setCustom(deleteCustomPreset(name));

  return (
    <div className="preset-bar">
      <span>预设: </span>
      {BUILTIN_PRESETS.map(p => (
        <button key={p.name} onClick={() => onApply(p)}>{p.name}</button>
      ))}
      <span style={{ margin: '0 8px' }}>|</span>
      {custom.map(p => (
        <span key={p.name} className="preset-item">
          <button onClick={() => onApply(p)}>{p.name}</button>
          <button className="del" onClick={() => remove(p.name)}>×</button>
        </span>
      ))}
      <button onClick={save}>保存当前为预设</button>
    </div>
  );
}
```

- [ ] **Step 5: Write `Preview2D.tsx`**

Create `E:\person\project\PoseGenerator\frontend\src\components\Preview2D.tsx`:
```tsx
import { useMemo } from 'react';
import type { PosePoint } from '../types';
import { eulerToDirXY } from '../lib/euler';

interface Props { points: PosePoint[]; }

const W = 480, H = 360, PAD = 24, ARROW = 18;

export function Preview2D({ points }: Props) {
  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1;
    const scale = Math.min((W - 2 * PAD) / sx, (H - 2 * PAD) / sy);
    const ox = PAD + (W - 2 * PAD - sx * scale) / 2 - minX * scale;
    const oy = PAD + (H - 2 * PAD - sy * scale) / 2 - minY * scale;
    const proj = (p: { x: number; y: number }) => ({ X: p.x * scale + ox, Y: -p.y * scale + oy + sy * scale });
    // Note: flip Y so that +Y is up on screen. Adjust oy accordingly.
    const flat = (p: { x: number; y: number }) => ({ X: p.x * scale + ox, Y: H - PAD - (p.y - minY) * scale });
    return points.map(p => {
      const s = flat(p);
      const d = eulerToDirXY(p.rx, p.ry, p.rz);
      return { ...s, dx: d.dx * ARROW, dy: -d.dy * ARROW }; // screen Y down
    });
  }, [points]);

  if (!geom) return <div className="preview-empty">导入 CSV 后显示预览</div>;
  const line = geom.map(g => `${g.X},${g.Y}`).join(' ');
  return (
    <svg width={W} height={H} className="preview2d">
      <polyline points={line} fill="none" stroke="#3b82f6" strokeWidth={2} />
      {geom.map((g, i) => (
        <g key={i}>
          <circle cx={g.X} cy={g.Y} r={3} fill="#ef4444" />
          {(() => {
            const len = Math.hypot(g.dx, g.dy);
            if (len < 1e-3) return null;
            return <line x1={g.X} y1={g.Y} x2={g.X + g.dx} y2={g.Y + g.dy} stroke="#22c55e" strokeWidth={2} />;
          })()}
        </g>
      ))}
    </svg>
  );
}
```
> Note: the `proj` closure in the useMemo is unused leftover scaffolding; remove it during implementation to keep the file clean (delete the `proj` const). The `flat` closure is the active projector.

- [ ] **Step 6: Write `PoseTable.tsx`**

Create `E:\person\project\PoseGenerator\frontend\src\components\PoseTable.tsx`:
```tsx
import type { PosePoint } from '../types';

export function PoseTable({ points }: { points: PosePoint[] }) {
  if (points.length === 0) return null;
  return (
    <div className="pose-table-wrap">
      <table className="pose-table">
        <thead><tr><th>#</th><th>x</th><th>y</th><th>z</th><th>rx</th><th>ry</th><th>rz</th></tr></thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{i}</td>
              <td>{p.x.toFixed(3)}</td><td>{p.y.toFixed(3)}</td><td>{p.z.toFixed(3)}</td>
              <td>{p.rx.toFixed(3)}</td><td>{p.ry.toFixed(3)}</td><td>{p.rz.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend/src/components
git commit -m "feat(frontend): 实现 CSV/参数/预设/预览/数值表/状态组件"
```

---

## Task 9: Frontend App composition + end-to-end pathview export

**Files:**
- Modify: `E:\person\project\PoseGenerator\frontend\src\App.tsx`
- Modify: `E:\person\project\PoseGenerator\frontend\src\App.css`
- Create: `E:\person\project\PoseGenerator\frontend\README.md`

**Interfaces:**
- Consumes: all components, `useGenerate`, `sendToPathview`, `openPathview`, types.

- [ ] **Step 1: Replace `App.tsx`**

Replace `E:\person\project\PoseGenerator\frontend\src\App.tsx` with:
```tsx
import { useMemo, useState } from 'react';
import type { GenerateParams, InitialPose, Point, PosePreset } from './types';
import { DEFAULT_INITIAL_POSE, DEFAULT_PARAMS } from './types';
import { CsvImport } from './components/CsvImport';
import { ParamsPanel } from './components/ParamsPanel';
import { PresetBar } from './components/PresetBar';
import { Preview2D } from './components/Preview2D';
import { PoseTable } from './components/PoseTable';
import { BackendStatus } from './components/BackendStatus';
import { useGenerate } from './hooks/useGenerate';
import { sendToPathview, openPathview } from './api/pathview';

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [ignored, setIgnored] = useState(0);
  const [params, setParams] = useState<GenerateParams>({ ...DEFAULT_PARAMS });
  const [initialPose, setInitialPose] = useState<InitialPose>({ ...DEFAULT_INITIAL_POSE });
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const req = useMemo(() => ({
    points,
    initial_pose: initialPose,
    params,
  }), [points, initialPose, params]);

  const enabled = points.length >= 3;
  const { result, error, loading } = useGenerate(req, enabled);
  const posePoints = result?.result ?? [];

  const currentPreset: PosePreset = useMemo(() => ({
    name: '_current', initial_pose: initialPose, params,
  }), [initialPose, params]);

  const applyPreset = (p: PosePreset) => {
    setParams({ ...p.params });
    setInitialPose({ ...p.initial_pose });
  };

  const onLoaded = (pts: Point[], name: string) => {
    setPoints(pts); setFileName(name); setIgnored(0);
  };

  const exportToPathview = async () => {
    if (posePoints.length === 0) return;
    setExporting(true); setExportErr(null);
    try {
      await sendToPathview(posePoints, fileName ?? 'pose');
      openPathview();
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <header><h1>PoseGenerator</h1><BackendStatus /></header>
      <div className="layout">
        <aside className="left">
          <CsvImport onLoaded={onLoaded} fileName={fileName}
            pointCount={points.length} ignored={ignored} />
          <PresetBar current={currentPreset} onApply={applyPreset} />
          <ParamsPanel params={params} initialPose={initialPose}
            onParams={setParams} onInitialPose={setInitialPose} />
          <button onClick={exportToPathview} disabled={!enabled || exporting || posePoints.length === 0}>
            {exporting ? '导出中…' : '在 pathview 中查看 →'}
          </button>
          {exportErr && <div className="err">{exportErr}</div>}
          {error && <div className="err">生成失败: {error}</div>}
        </aside>
        <main className="right">
          <Preview2D points={posePoints} />
          <PoseTable points={posePoints} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `App.css`**

Replace `E:\person\project\PoseGenerator\frontend\src\App.css` with:
```css
* { box-sizing: border-box; }
.app { font-family: system-ui, sans-serif; padding: 12px; }
header { display: flex; justify-content: space-between; align-items: center; }
.layout { display: flex; gap: 16px; }
.left { width: 420px; }
.right { flex: 1; }
.ctrl { margin: 6px 0; }
.ctrl-row { display: flex; gap: 8px; align-items: center; }
.hint { color: #6b7280; font-size: 12px; }
.csv-meta { margin: 6px 0; font-size: 13px; }
.preset-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; }
.preset-item { display: inline-flex; }
.preset-item .del { color: #ef4444; margin-left: 2px; }
.preview2d { background: #f9fafb; border: 1px solid #e5e7eb; }
.pose-table-wrap { max-height: 320px; overflow: auto; margin-top: 12px; }
.pose-table { border-collapse: collapse; font-size: 12px; }
.pose-table th, .pose-table td { border: 1px solid #e5e7eb; padding: 2px 6px; }
.err { color: #ef4444; margin-top: 6px; }
.preview-empty { color: #9ca3af; padding: 24px; }
```

- [ ] **Step 3: Write `frontend/README.md`**

Create `E:\person\project\PoseGenerator\frontend\README.md`:
```markdown
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
```

- [ ] **Step 4: Full end-to-end manual test**

Start all three services (pathview backend 3001, pose_backend 8220, this frontend 5174). In the browser at `http://localhost:5174`:
1. Import a CSV with ≥3 `x,y,z` rows (e.g. the corrugated example from the algorithm doc §5.1).
2. Verify the 2D preview shows a polyline + per-point arrows, and the table populates within ~200ms of any slider change.
3. Click "在 pathview 中查看 →". A new tab opens `http://localhost:5173`; the new path appears at the top of the pathview list. Click it to see 3D poses + weld gun.

Expected: all three behaviors work. If pathview 3D shows no orientation axes, confirm the exported points have non-null rx/ry/rz (they will).

- [ ] **Step 5: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add frontend
git commit -m "feat(frontend): 组装主应用，打通参数调控到 pathview 导出全流程"
```

---

## Task 10: Backend link-completion + behavior-consistency verification

**Files:**
- Modify: `E:\person\project\PoseGenerator\backend\CMakeLists.txt` (only if link errors surface)
- Modify: `E:\person\project\PoseGenerator\backend\README.md` (document final link list)

**Purpose:** Close the known risk (spec §7.1): `MultimodalWeldSystem.lib` transitively depends on other nexus internal DLLs (`Toolkit`, `Nexus`, etc., since `RobotPointEx` is implemented in `Toolkit`). Resolve and lock the full `.lib` list.

- [ ] **Step 1: Discover required libs via link errors**

Run:
```powershell
cd E:\person\project\PoseGenerator\backend
cmake --build build --config RelWithDebInfo
```
Collect every `unresolved external symbol` / `cannot open input file '*.lib'` error.

- [ ] **Step 2: Add missing libs to both targets**

For each missing symbol, identify which nexus subproject provides it (search `E:\workspace\nexus\<Sub>\CMakeLists.txt` for the symbol's class, or check `E:\workspace\nexus\x64\Release\*.lib` for the export). Add the corresponding `${NEXUS_ROOT}/x64/Release/<Sub>.lib` to `target_link_libraries` of BOTH `pose_backend` and `test_adapter` in `CMakeLists.txt`. Common expected additions (confirm via build, do not add speculatively):
- `Toolkit.lib` (provides `sa::RobotPointEx` impl)
- `Nexus.lib` (provides `Nexus::` helpers used transitively)

Rebuild until clean.

- [ ] **Step 3: Re-run the behavior-consistency test**

Run:
```powershell
.\build\RelWithDebInfo\test_adapter.exe
```
Expected: `test_adapter OK` (adapter output == direct library output, within 1e-4).

- [ ] **Step 4: Re-run the HTTP smoke test from Task 4 Step 3**

Confirm `/health` and `/generate` still respond correctly after the link list change.

- [ ] **Step 5: Document the final link list in `backend/README.md`**

Append a "## 链接库清单" section listing every `.lib` in `target_link_libraries`, so future maintainers know the dependency set.

- [ ] **Step 6: Commit**

```powershell
cd E:\person\project\PoseGenerator
git add backend
git commit -m "fix(backend): 补全递归链接库并固化行为一致性验证"
```

---

## Self-Review

**1. Spec coverage:**
- §2 Architecture (frontend 5174 / backend 8220 / pathview external): Tasks 2, 4, 5.
- §3 Backend build (NEXUS_ROOT, MSVC/x64/MD/C++17, exe→x64/Release): Task 2.
- §3.2 deps (cpp-httplib, nlohmann/json): Task 2.
- §3.3 `POST /generate` + `GET /health`: Task 4.
- §3.4 thin backend, only generate(): Task 3 (adapter is the only call site).
- §4.1 React+Vite, papaparse, native SVG, no 3D: Tasks 5–9.
- §4.2 layout: Task 9 (App.tsx) + Task 8 (components).
- §4.3 params UI table (8 params + initial pose, odd-force, KP disable): Task 8 (`ParamsPanel`).
- §4.4 presets (4 builtin + localStorage custom): Task 6 (`presets.ts`) + Task 8 (`PresetBar`).
- §4.5 CSV import + N<3 block: Task 6 (`csv.ts`) + Task 8 (`CsvImport`) + Task 9 (`enabled` gate).
- §4.6 real-time debounce + 2D preview + table: Task 7 (`useGenerate`) + Task 8 (`Preview2D`, `PoseTable`).
- §4.7 pathview export (zero-conversion, open list): Task 7 (`pathview.ts`) + Task 9.
- §5 data conventions (x,y,z / rx,ry,rz / ZYX / int output_mode): Tasks 3, 5.
- §7.1 DLL chain risk: Task 10.

**2. Placeholder scan:** Found and addressed:
- Task 8 Step 5 had a leftover unused `proj` closure in `Preview2D` — flagged inline with an instruction to remove during implementation. Acceptable (it's a concrete instruction, not a vague TBD).
- Task 3 Step 4 CMake snippet contained a deliberate typo `CEXUS_ROOT` with an explicit instruction to write `NEXUS_ROOT` — this is a guided check, not a placeholder. Acceptable.
- No "TBD", "add error handling", "similar to Task N", or undescribed steps remain.

**3. Type consistency:**
- `GenerateRequest`/`GenerateResponse` (Task 3) ↔ `GenerateRequest`/`GenerateResponse` (Task 5 types) — field names match: `points`, `initial_pose{rx,ry,rz}`, `params`, `result`, `point_count`.
- `OutputMode = 0|1` used consistently in Task 5 types and Task 8 `ParamsPanel`.
- `PosePreset` shape (`name`, `initial_pose`, `params`, `builtin?`) consistent across Task 5 types, Task 6 presets, Task 8 `PresetBar`, Task 9 `currentPreset`.
- `sendToPathview(points, sourceFile)` (Task 7) matches call `sendToPathview(posePoints, fileName ?? 'pose')` (Task 9).
- `useGenerate(req, enabled)` signature (Task 7) matches call (Task 9).
- `parseCsvPoints` returns `{points, ignored, header}` (Task 6) — `header` unused by `CsvImport` (Task 8) but harmless; no mismatch.

No inconsistencies found.

**4. Scope check:** Single coherent subsystem (one frontend + one backend + one integration with external pathview). No decomposition needed.
