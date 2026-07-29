# 姿态生成可视化工具（PoseGenerator）设计文档

> 输入与参数调控前端 + C++ 后端原生调用 `CorrugatedWeldPoseGenerator::generate()`，输出展示交由已有 pathview 站。

- 文档日期：2026-07-29
- 算法源：`E:\workspace\nexus\MultimodalWeldSystem`（`CorrugatedWeldPoseGenerator`，生产 C++ 库）
- 展示端：`E:\person\project\pathview`（React + Express + SQLite，`http://localhost:5173`）

---

## 1. 项目定位

`PoseGenerator` 是一个**焊缝姿态生成的参数调控工具**：

- 用户在这里**导入路径点（CSV）+ 调节算法参数 + 初始姿态**。
- C++ 后端**原生调用** nexus 生产库的 `generate()`，确保与生产代码行为**完全一致**。
- 前端**就地预览**生成结果（数值表 + 2D 投影），实时反馈调参效果。
- 用户满意后，把生成结果推送到 pathview，**跳转 pathview** 做 3D 展示。

**不做的事**：不做 3D 渲染（交 pathview）；不改 nexus 生产库；不返回算法中间产物。

---

## 2. 架构总览

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  PoseGenerator 前端 (React)  │         │  PoseGenerator C++ 后端       │
│  localhost:5174              │         │  localhost:8220              │
│  - CSV 导入与解析             │  JSON   │  - cpp-httplib + nlohmann/json│
│  - 参数滑块/数值框            │ ──────▶ │  - 链接 MultimodalWeldSystem  │
│  - 就地 2D 预览 + 数值表      │ ◀────── │  - 调 generate()，返点+姿态   │
│  - 跳转 pathview 触发器       │         │    (MSVC / x64 / /MD / C++17) │
└──────────────┬───────────────┘         └──────────────────────────────┘
               │ POST /api/paths (零转换, x,y,z,rx,ry,rz)
               │ + window.open('http://localhost:5173')
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  pathview (已有，不改)                                                    │
│  前端 localhost:5173  /  后端 API localhost:3001                          │
│  SQLite 存储，列表页按 created_at DESC，新路径排顶部，用户点开看 3D       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 端口与跨域

| 服务 | 端口 | 说明 |
|---|---|---|
| PoseGenerator 前端 | 5174 | Vite dev server |
| PoseGenerator C++ 后端 | 8220 | cpp-httplib |
| pathview 前端 | 5173 | 已有，不改 |
| pathview 后端 API | 3001 | 已有，不改 |

前端所有请求同源打 5174，由 Vite proxy 转发，**浏览器侧无跨域**：

- `/generate` → `http://localhost:8220`
- `/api/paths` → `http://localhost:3001`

---

## 3. 后端设计（C++）

### 3.1 构建与依赖（路径 2：独立项目 + 链接产物 DLL）

- 独立 CMake 项目，位于 `E:\person\project\PoseGenerator\backend`。
- 用 CMake 变量 `NEXUS_ROOT` 指向 `E:\workspace\nexus`（默认值即此路径）。
- include 路径（基于 `NEXUS_ROOT`）：
  - `MultimodalWeldSystem/include`
  - `Toolkit/include`（`NexusType.h` 等）
  - `Nexus/include`
  - 第三方：`${NEXUS_ENV_ROOT}/Eigen3.4`、`${NEXUS_ENV_ROOT}/opencv-4.10.0/build/include` 等
  - `NEXUS_ENV_ROOT` 默认 `$ENV{NEXUS_ENV_ROOT}`，回退 `${NEXUS_ROOT}/../env`
- 链接库：`x64/Release/MultimodalWeldSystem.lib` + 递归需要的 nexus 内部 lib（`Toolkit`/`Nexus` 等依赖 DLL 的导入库，实现阶段核对补全）。
- **运行时 exe 输出到 `${NEXUS_ROOT}/x64/Release/`**，复用该目录已有的整套运行时 DLL 链（Qt5、OpenCV、Nexus 各 DLL、`tj_ipcsys`、libmodbus、OCCT 等），无需逐个拷贝。
- **ABI 照搬 nexus**：MSVC、`CMAKE_CXX_STANDARD 17`、`CMAKE_MSVC_RUNTIME_LIBRARY MultiThreadedDLL`（`/MD`）、x64、`RelWithDebInfo`。

### 3.2 依赖

- **cpp-httplib**（单头文件 `httplib.h`，MIT）—— HTTP server。
- **nlohmann/json**（单头文件 `json.hpp`）—— JSON 序列化。
- 两文件放 `backend/third_party/`，无其他外部依赖。

### 3.3 HTTP 接口

#### `POST /generate`

请求体：

```json
{
  "points": [
    {"x": 0.0, "y": 0.0, "z": 0.0},
    {"x": 100.0, "y": 0.0, "z": 0.0}
  ],
  "initial_pose": {"rx": 0.0, "ry": 45.0, "rz": 178.0},
  "params": {
    "curvature_threshold": 0.07,
    "smooth_half_width": 2,
    "tangent_smooth_window": 5,
    "min_corner_region_length": 2,
    "output_mode": 0,
    "max_pose_change_angle": 45.0,
    "all_curve_threshold": 0.8,
    "keypoint_pose_angle_threshold": 5.0
  }
}
```

> `output_mode` 为**整数**：`0=FULL`、`1=KEYPOINTS`（库 `Params::toJson/fromJson` 用 `static_cast<int>`）。前端 UI 上是单选/下拉，但发给后端的 JSON 里转成整数。

响应体：

```json
{
  "result": [
    {"x": 0.0, "y": 0.0, "z": 0.0, "rx": 0.0, "ry": 45.0, "rz": 178.0},
    {"x": 100.0, "y": 0.0, "z": 0.0, "rx": 1.2, "ry": 44.8, "rz": 178.3}
  ],
  "point_count": 2
}
```

处理流程：
1. 解析 JSON → 构造 `std::vector<sa::RobotPointEx>`（仅位置 x,y,z）与 `cv::Point3f initial_pose`。
2. 用 `Params::fromJson()` 构造参数（库自带，缺失字段用默认值），`setParams`。
3. 调 `generate(points, initial_pose)`。
4. 遍历结果，取 `toPos()` + `toRot()`，序列化为响应 JSON。
5. **`points.size() < 3`**：库直接返回原序列，后端照常包装返回（前端会阻止此情况，后端做防御性处理）。

#### 健康检查

`GET /health` → `{"status":"ok"}`，供前端确认后端在线。

### 3.4 后端职责边界

后端**极薄**：仅做 JSON↔C++ 类型转换 + 调库。算法逻辑一行不碰，全部交给库，以保证"行为完全一致"。不做 CSV 解析、不做中间产物暴露、不做缓存。

---

## 4. 前端设计（React + Vite）

### 4.1 技术栈

- React 19 + TypeScript + Vite（与 pathview 同栈）。
- CSV 解析：`papaparse`（或手写按行 split，CSV 格式简单）。
- 2D 预览：原生 SVG 手绘，无图表库依赖。
- 不引入 3D 库（three.js 等都不需要，3D 交 pathview）。

### 4.2 界面布局

```
┌────────────────────────────────────────────────────────────────────┐
│  PoseGenerator                                  [后端状态指示器]     │
├──────────────────────────┬─────────────────────────────────────────┤
│  左：输入与参数面板       │  右：就地预览                              │
│                          │                                          │
│  [导入CSV] 文件名/N点     │  ┌──────────────────────────────────┐    │
│                          │  │  2D 预览 (SVG, XY 俯视)          │    │
│  初始姿态                 │  │   折线 + 每点姿态箭头            │    │
│   rx [框][滑块] -180~180 │  └──────────────────────────────────┘    │
│   ry [框][滑块]          │  ┌──────────────────────────────────┐    │
│   rz [框][滑块] 默认0/45/178│ │  数值表 (x,y,z,rx,ry,rz 每点一行) │    │
│                          │  └──────────────────────────────────┘    │
│  算法参数 (8项)           │                                          │
│   每项: [滑块][数值框]    │                                          │
│   tangent_smooth_window  │                                          │
│     强制奇数              │                                          │
│   keypoint_pose_angle_th │                                          │
│     (非全曲线+KP 灰掉)    │                                          │
│                          │                                          │
│  预设: [波纹板][圆形][弧 │                                          │
│   形][默认] [保存预设▼]  │                                          │
│                          │                                          │
│  [在 pathview 中查看 →]  │                                          │
└──────────────────────────┴─────────────────────────────────────────┘
```

### 4.3 参数 UI 规格

初始姿态（数值框 + 滑块组合，双向同步；度，Euler ZYX）：

| 字段 | 默认 | 范围 | 步长 |
|---|---|---|---|
| rx | 0 | -180~180 | 0.5 |
| ry | 45 | -180~180 | 0.5 |
| rz | 178 | -180~180 | 0.5 |

算法 8 参数（数值框 + 滑块组合，除非另注）：

| # | 参数 | 类型 | 默认 | 范围 | 步长 | 特殊 |
|---|---|---|---|---|---|---|
| 1 | curvature_threshold | double(rad) | 0.07 | 0~0.5 | 0.001 | |
| 2 | smooth_half_width | int | 2 | 0~50 | 1 | |
| 3 | tangent_smooth_window | int(奇数) | 5 | 1~51 | 1 | 拖到偶数自动 +1 |
| 4 | min_corner_region_length | int | 2 | 1~50 | 1 | |
| 5 | output_mode | enum→int | 0(FULL) | 0=FULL / 1=KEYPOINTS | — | 单选/下拉（UI），JSON 传整数 |
| 6 | max_pose_change_angle | double(°) | 45.0 | 0~180 | 0.5 | |
| 7 | all_curve_threshold | double | 0.8 | 0~1 | 0.01 | |
| 8 | keypoint_pose_angle_threshold | double(°) | 5.0 | 0~90 | 0.5 | 非"全曲线+KEYPOINTS"模式灰掉并提示 |

### 4.4 参数预设（localStorage 自定义 + 内置）

- 内置四套（常量表）：
  - **默认**：全参数默认值。
  - **波纹板**：`curvature_threshold=0.07, smooth_half_width=2, tangent_smooth_window=5, min_corner_region_length=1`。
  - **圆形闭环**：`curvature_threshold=0.001, all_curve_threshold=0.6, smooth_half_width=0, tangent_smooth_window=5`。
  - **一般弧形**：`output_mode=KEYPOINTS, max_pose_change_angle=30.0, keypoint_pose_angle_threshold=3.0`。
  - 未指定的字段取默认值。
- 用户自定义：把当前 8 参数 + 初始姿态存成命名预设，localStorage 持久化；支持选择/覆盖/重命名/删除。
- 一键应用预设 → 滑块/数值框批量更新 → 触发重算。

### 4.5 CSV 导入

- 前端解析 CSV，期望 `x,y,z` 三列（带或不带标题行，papaparse `header:true` 自动判定；列名大小写不敏感匹配 x/y/z）。
- 解析后显示文件名 + 点数 N。
- N < 3：禁用"生成/查看"，提示"至少需要 3 个点"（算法前置条件）。
- 非数值行/空行：跳过并计数，提示忽略行数。

### 4.6 实时重算与就地预览

- 任何参数 / 初始姿态 / CSV 变更 → debounce 200ms → `POST /generate` → 更新预览。
- **2D 预览（SVG）**：
  - 路径点投影到 XY 平面，`<polyline>` 连成折线，按点范围自动缩放居中。
  - 每点画一个短箭头表示姿态朝向：欧拉角 ZYX → 旋转矩阵 → 取某固定轴（如工具 Z 轴 `(0,0,1)`）经旋转后的方向向量 → 投影到 XY 取 (dx,dy) 作箭头方向。
  - 拖滑块时箭头随之转向，"动态调节效果"立即可见。
- **数值表**：每点一行 `x,y,z,rx,ry,rz`，实时刷新。
- 预览失败（后端不可达）：预览区显示错误提示，不阻塞参数调整。

### 4.7 跳转 pathview

- 用户点"在 pathview 中查看 →"。
- 用**当前持有的最新一次 generate 结果**（实时重算保证其为最新参数对应）。
- `POST /api/paths`（经 Vite proxy → pathview `3001`）：
  ```json
  {
    "name": "<csv文件名> <HH:MM:SS>",
    "source_file": "<csv文件名>",
    "points": [{"x":..,"y":..,"z":..,"rx":..,"ry":..,"rz":..}, ...]
  }
  ```
  字段 `x,y,z,rx,ry,rz` 与 pathview `PathPoint` 完全一致，**零转换**（两边均为 Euler ZYX 度制）。
- 拿到 `{id}` 后 `window.open('http://localhost:5173')` 跳转 pathview 列表页。
- pathview 列表按 `created_at DESC`，新路径在顶部，用户自行点开查看 3D（**零改 pathview**）。

---

## 5. 数据约定

| 项 | 约定 |
|---|---|
| 输入点字段 | `x, y, z`（float） |
| 输出姿态字段 | `rx, ry, rz`（float，度） |
| 欧拉角顺序 | ZYX 内旋（与库、与 pathview 一致） |
| CSV 输入 | `x,y,z` 三列 |
| generate JSON | `points` + `initial_pose` + `params` |
| pathview 对接 | `points` 含 `x,y,z,rx,ry,rz`，零转换 |

---

## 6. 目录结构（建议）

```
PoseGenerator/
├── docs/
│   ├── CorrugatedWeldPoseGenerator.md      # 算法技术文档（已存在）
│   └── superpowers/specs/
│       └── 2026-07-29-pose-visualizer-design.md  # 本文档
├── backend/                                # C++ 后端
│   ├── CMakeLists.txt
│   ├── third_party/
│   │   ├── httplib.h                       # cpp-httplib
│   │   └── json.hpp                        # nlohmann/json
│   └── src/
│       └── main.cpp                        # HTTP server + 调库
└── frontend/                               # React 前端
    ├── package.json
    ├── vite.config.ts                      # proxy: /generate→8220, /api/paths→3001
    └── src/
        ├── App.tsx
        ├── api/                             # generate / createPath 调用
        ├── components/
        │   ├── CsvImport.tsx
        │   ├── ParamsPanel.tsx              # 8 参数 + 初始姿态
        │   ├── PresetBar.tsx                # 内置 + 自定义预设
        │   ├── Preview2D.tsx                # SVG 折线 + 箭头
        │   └── PoseTable.tsx               # 数值表
        ├── hooks/
        │   └── useGenerate.ts              # debounce 实时重算
        └── types/
            └── index.ts                     # Point / Params 类型
```

---

## 7. 已知风险与待实现阶段核实

1. **DLL 依赖链**：`MultimodalWeldSystem.dll` 递归依赖 nexus 内部 DLL（`Toolkit`/`Nexus` 等，`RobotPointEx` 实现在 `Toolkit`，带 `DLL_EXPORT`）。链接时需补全对应 `.lib`，运行时 exe 输出到 `x64/Release/` 复用 DLL 链。实现阶段逐个核对 CMake `target_link_libraries`。
2. **`MWS_Define.h` 的 `MWS_path.ini`**：定义了 `./config`、`./runtime`、`./data` 等路径宏，供 MWS DLL 其他模块使用；`generate()` 调用链为纯内存计算，不触碰这些路径（已由 `MWSTest` 测试佐证）。后端只需保证工作目录存在（或忽略，运行时不依赖）。
3. **`NEXUS_ENV_ROOT`**：第三方依赖根目录，需指向 nexus 约定的 env 路径，否则 Eigen/OpenCV 头文件找不到。
4. **行为一致性验证**：实现完成后，用 `MWSTest` 的 CSV 数据跑后端 `/generate`，与库直接结果比对，确认端到端一致。

---

## 8. 不做（YAGNI）

- 不做 3D 渲染（交 pathview）。
- 不改 nexus 生产库（不加 `analyze()` 等公开接口）。
- 不返回算法中间产物（闭合判定/模式/分段/过渡区/曲率/角点）。
- 不做 WebSocket / 二进制协议。
- 不做手动点表编辑、内置预设路径（只 CSV 导入）。
- 不做参数云端同步/多用户（localStorage 即可）。
