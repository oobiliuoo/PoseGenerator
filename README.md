# PoseGenerator

> 焊缝姿态生成的参数调控台 —— CSV 路径导入 → 节点链组装(滤波/截取/分段/姿态生成) → 实时增量重算 → 单节点或全部节点预览 → 一键推 pathview 看 3D。
>
> 后端**原生链接** nexus 生产库 `MultimodalWeldSystem`,与生产代码行为完全一致;算法库更新时仅拷贝 DLL,不重编算法。

---

## 它在解决什么问题

机器人焊接时,焊枪不仅要跟随路径,还要在每个点保持合理的**欧拉姿态**(度,ZYX 内旋)。波纹板、瓦楞板、圆形闭环、一般弧形——典型焊缝形态各有姿态规律,人工逐点标注不现实。

`PoseGenerator` 以**节点链**组织处理流程:CSV 输入 → 任意组合的滤波工具(距离/角度/均值/高斯/Savitzky-Golay/统计离群/RANSAC 直线/B 样条)与数据截取、路径分段 → 姿态生成 → pathview 导出。拖滑块实时看到参数变化对下游的影响,满意后推 pathview 看 3D 验证。**不**做 3D 渲染(交 pathview)、**不**改 nexus 生产库。

---

## 5 分钟上手

> 前置:本机已构建 nexus `MultimodalWeldSystem`(产物在 `E:\workspace\nexus\x64\Release\`);Node 18+ / npm 9+;MSVC + CMake 3.16+。

整个工具依赖**两个上游服务**必须先起来:

| 服务 | 端口 | 说明 |
|---|---|---|
| `pose_backend`(本仓 `backend/`) | 8220 | 算法,本仓的 C++ HTTP 后端 |
| `pathview`(外仓) | 3001 / 5173 | 3D 展示与存储,已有,不修改 |

### ① 启动后端

```powershell
cd backend
cmake -B build -S .
cmake --build build --config RelWithDebInfo
# 产物落到 backend/runtime/(与 nexus DLL 链同目录)
.\scripts\copy-runtime.ps1 -Force   # 首次或 nexus 重新构建后,同步 DLL
cd runtime
.\pose_backend.exe
```

健康检查:`curl http://localhost:8220/health` 应回 `{"status":"ok"}`。详见 [`backend/README.md`](backend/README.md)。

### ② 启动前端

```powershell
cd frontend
npm install
npm run dev
# → http://localhost:5174
```

Vite proxy 把 `/generate`、`/health` 转发到 8220,`/api/paths` 转发到 3001,**浏览器侧零跨域**。详见 [`frontend/README.md`](frontend/README.md)。

### ③ 验证

打开 http://localhost:5174 ,Header 右侧应见两个绿色脉冲点(`pose` 与 `pathview` 都在线)。把 `frontend/public/corrugated_sample.csv` 拖入左侧 CSV 输入节点(或点节点卡选文件),节点链自动重算,右侧即见路径与姿态;选中 pathview 导出节点点「推送到 pathview」看 3D。

---

## 架构

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│ PoseGenerator 前端 (React)      │         │ PoseGenerator C++ 后端          │
│ localhost:5174                  │         │ localhost:8220                  │
│ • 节点链面板(12 种节点,增删/    │  JSON   │ • cpp-httplib + nlohmann/json   │
│   排序/屏蔽/折叠)               │ ──────▶ │ • /node/execute 按 node_type    │
│ • 单节点 / 全部节点视图,         │         │   分发 pose_adapter /           │
│   XY/XZ/YZ 投影 + 姿态显示       │ ◀────── │   filter_adapter(链 nexus 库)  │
│ • 流水线预设保存/导出/导入       │         │   MSVC / x64 / /MD / C++17     │
│   (localStorage + IndexedDB)    │         │   RelWithDebInfo                │
└──────────────┬─────────────────┘         └────────────────────────────────┘
               │ POST /api/paths  (零转换,x,y,z,rx,ry,rz)
               │ + window.open('http://localhost:5173')
               ▼
┌────────────────────────────────────────────────────────────┐
│ pathview(已有,不修改)                                       │
│ 前端 localhost:5173 / 后端 API localhost:3001              │
│ SQLite 存储,列表按 created_at DESC,新路径排顶部             │
└────────────────────────────────────────────────────────────┘
```

详细数据流、端口与代理规则、请求/响应示例见 [`docs/superpowers/specs/2026-07-29-pose-visualizer-design.md`](docs/superpowers/specs/2026-07-29-pose-visualizer-design.md)。

---

## HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health` | 健康检查;前端 5s 心跳,Header 状态点 |
| `POST` | `/generate` | 调库 `generate()`,返回每点完整位姿(迁移期兼容保留) |
| `POST` | `/node/execute` | 统一节点执行:`{node_type, input, params}` → `{output:{points, meta}}`,按 `node_type` 分发 |

`node_type` 一览:`pose_generate` + `filter_distance / filter_angle / filter_mean / filter_gaussian / filter_savgol / filter_stat_outlier / filter_ransac_line / filter_bspline / filter_path_segmentor`。csv_input、slice、pathview_export 为纯前端节点,不发请求。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript 5 · Vite 6 · papaparse · 原生 SVG 2D 预览 |
| 后端 | C++17 · cpp-httplib · nlohmann/json · MSVC · x64 · `/MD` · RelWithDebInfo |
| 依赖 | nexus 生产库 `MultimodalWeldSystem`(`E:\workspace\nexus`);下游 pathview 服务 |
| 字体 | Archivo(显示)· IBM Plex Sans(界面)· JetBrains Mono(数据/遥测) |

---

## 目录结构

```
PoseGenerator/
├── README.md                                  # 本文件 —— 5 秒看懂 + 5 分钟跑起来
├── backend/                                   # C++ HTTP 后端
│   ├── CMakeLists.txt                         # MSVC / x64 / /MD / 与 nexus 同 ABI
│   ├── README.md                              # 构建 / 运行 / 链接库清单 / 故障排查
│   ├── third_party/                           # cpp-httplib · nlohmann/json(单头文件)
│   └── src/
│       ├── main.cpp                           # /health + /generate + /node/execute 分发
│       ├── pose_adapter.h / .cpp              # pose_generate 节点:调 CorrugatedWeldPoseGenerator
│       ├── filter_adapter.h / .cpp            # filter_* 节点:8 滤波 + 路径分段
│       └── tests/                             # test_adapter(姿态) / test_filter_adapter(滤波)
├── frontend/                                  # React 前端
│   ├── README.md                              # 脚本 / Vite proxy / 目录 / 键盘快捷键
│   ├── vite.config.ts                         # proxy: /generate /node/execute→8220, /api/paths→3001
│   ├── public/                                # 示例 CSV:corrugated_sample.csv 等
│   └── src/
│       ├── App.tsx                            # 节点链 + 结果双栏,底部操作栏
│       ├── App.css                            # Engineering Bench 暗色,Linear/Vercel 化
│       ├── api/                               # node/execute · pathview 调用
│       ├── components/                        # NodeChain · NodeCard · NodeResult · AllNodesView
│       │                                      # Preview2D · PipelineBar · AddNodeMenu 等
│       ├── hooks/usePipeline.ts               # 300ms debounce 增量重算(仅脏节点及下游)
│       └── lib/                               # nodeRegistry(节点定义) · pipeline(链执行)
│       │                                      # pipelineCodec(MWS 序列化互导) · csv · csvStore
├── config/                                    # 系统配置(运行时由后端服务加载)
├── data/                                      # 业务数据(相机标定 / 模板 / 焊接规则 等)
├── runtime/                                   # 运行产物(采集 / 日志 / 录像)
└── docs/
    ├── CorrugatedWeldPoseGenerator.md         # 姿态生成算法技术文档(参数含义 / 公式 / 边界)
    └── superpowers/specs/...design.md         # 整体设计决策与权衡
```

---

## 关键约定

| 项 | 约定 |
|---|---|
| 输入点字段 | `x, y, z`(float) |
| 输出姿态字段 | `rx, ry, rz`(float,度) |
| 欧拉角顺序 | ZYX 内旋(与库、与 pathview 一致) |
| CSV 列名 | `x / y / z` 大小写不敏感,`pos_x` / `px` / `position_x` 等别名均接受 |
| 可选姿态列 | `rx / ry / rz`(roll / pitch / yaw / rot_x 等别名),有则进入 CSV 原始视图 |
| node/execute JSON | `{node_type, input:{points}, params}` → `{output:{points, meta}}` |
| 姿态透传 | filter 类节点不碰 `rx/ry/rz`,原样搭便车(RANSAC 投影除外,UI 有警告) |
| 流水线持久化 | 结构进 localStorage,CSV 文本进 IndexedDB(key=流水线名) |
| 节点链 ↔ MWS 互导 | 后端 `/pipeline/serialize|deserialize` 直接调库 `toJson`/`analysisJson`,格式与生产一致;屏蔽节点不导出,csv/pathview 节点导出时自动补齐 |
| 算法下限 | `points.size() ≥ 3`(否则库原样返回,前端会阻止并提示) |

---

## 设计取舍(Why)

- **后端极薄** —— 只做 JSON ↔ C++ 类型转换并调库,一行算法逻辑不碰。保证"调参效果 = 生产效果"。
- **DLL-only 同步** —— 算法库更新时只跑 `copy-runtime.ps1 -Force` 拷 DLL(先杀 8220 进程),不重编 nexus。
- **分析器透传模式** —— `filter_path_segmentor` 这类分析节点不改点序列,结果进 `meta` 供 UI 展示与段选输出。
- **3D 渲染外移** —— 不在 React 端引入 three.js,统一交 pathview 站承载;前端只做 2D 投影(XY/XZ/YZ 三平面)+ 数值表。
- **增量重算** —— 参数变化只重算该节点及其下游(debounce 300ms + AbortController),上游缓存不重跑。
- **持久化分层** —— 流水线结构(localStorage)与 CSV 文本(IndexedDB)分离,防大文件溢出配额。
- **可见反馈** —— 头部双服务状态脉冲点、节点卡状态行(点数/错误/屏蔽)、运行按钮运行中红色呼吸。
- **可访问性** —— 所有交互元素带可见 focus ring,支持 `prefers-reduced-motion`。

完整决策记录见 [`docs/superpowers/specs/2026-07-29-pose-visualizer-design.md`](docs/superpowers/specs/2026-07-29-pose-visualizer-design.md)。

---

## 已知风险

1. **DLL 依赖链**:`pose_backend.exe` 依赖 nexus 整套 DLL 链(`MultimodalWeldSystem` / `Toolkit` / `Nexus` 等 338 个)。必须与 DLL 同目录运行(`backend/runtime/`,用 `scripts/copy-runtime.ps1` 拷入),不要单独拷 exe 到别处。算法库更新后重新跑拷贝脚本即可(先杀 8220 进程)。
2. **ABI 一致**:后端必须 MSVC / x64 / `/MD` / C++17 / RelWithDebInfo,与 nexus 一致;否则链接失败或运行崩。
3. **`NEXUS_ENV_ROOT` 环境变量**:第三方依赖根目录(Eigen3.4 / opencv-4.10.0 / spdlog / libmodbus)。不指向会头文件找不到,默认回退到 `${NEXUS_ROOT}/../env`。
4. **行为一致性验证**:端到端需用库自带 `MWSTest` 数据集比对一次,确认与生产结果一致 —— 这是上线前的硬性闸口。

故障排查与常见错误见 [`backend/README.md`](backend/README.md) 与 [`docs/superpowers/specs/2026-07-29-pose-visualizer-design.md`](docs/superpowers/specs/2026-07-29-pose-visualizer-design.md#7-已知风险与待实现阶段核实)。

---

<sub>本仓是参数调控工具,不包含生产焊接执行逻辑。算法核心在 `E:\workspace\nexus\MultimodalWeldSystem`。</sub>