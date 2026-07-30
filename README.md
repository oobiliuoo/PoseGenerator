# PoseGenerator

> 焊缝姿态生成的参数调控台 —— 导入 CSV 路径 → 调节 9 项算法参数 + 初始姿态 → 就地预览 → 一键推 pathview 看 3D。
>
> 后端**原生链接** nexus 生产库 `CorrugatedWeldPoseGenerator::generate()`,与生产代码行为完全一致。

---

## 它在解决什么问题

机器人焊接时,焊枪不仅要跟随路径,还要在每个点保持合理的**欧拉姿态**(度,ZYX 内旋)。波纹板、瓦楞板、圆形闭环、一般弧形——典型焊缝形态各有姿态规律,人工逐点标注不现实。

`PoseGenerator` 让工程师把路径点丢进去,拖滑块,**实时**看到姿态分布是否符合预期,满意后推 pathview 看 3D 验证。**不**做 3D 渲染(交 pathview)、**不**改 nexus 生产库、**不**返回算法中间产物。

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
# 产物自动落到 E:\workspace\nexus\x64\Release\pose_backend.exe
cd E:\workspace\nexus\x64\Release
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

打开 http://localhost:5174 ,Header 右侧应见两个绿色脉冲点(`pose` 与 `pathview` 都在线)。把 `frontend/public/corrugated_sample.csv` 拖入,即看到路径与每点的姿态箭头;`Ctrl/Cmd + E` 推 pathview。

---

## 架构

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│ PoseGenerator 前端 (React)      │         │ PoseGenerator C++ 后端          │
│ localhost:5174                  │         │ localhost:8220                  │
│ • CSV 拖拽 / 9 参数滑块          │  JSON   │ • cpp-httplib + nlohmann/json   │
│ • XY / XZ / YZ 三平面预览        │ ──────▶ │ • 链接 MultimodalWeldSystem    │
│ • 数值表 + 路径统计 PTS/LEN/BBOX │ ◀────── │ • 调 generate(),返点+姿态      │
│ • 4 内置预设 + 用户自定义(localS)│         │   MSVC / x64 / /MD / C++17     │
│ • Ctrl/Cmd + E 导出             │         │   RelWithDebInfo                │
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
| `POST` | `/generate` | 调库 `generate()`,返回每点完整位姿 |

请求/响应 JSON 形态见 [`backend/README.md`](backend/README.md);完整字段含义见算法文档 [`docs/CorrugatedWeldPoseGenerator.md`](docs/CorrugatedWeldPoseGenerator.md)。

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
│       ├── main.cpp                           # /health + /generate
│       ├── pose_adapter.h / .cpp              # JSON ↔ C++ 类型,调库的唯一入口
│       └── tests/test_adapter.cpp             # 适配器本地单元测试
├── frontend/                                  # React 前端
│   ├── README.md                              # 脚本 / Vite proxy / 目录 / 键盘快捷键
│   ├── vite.config.ts                         # proxy: /generate→8220, /api/paths→3001
│   ├── public/                                # 示例 CSV:corrugated_sample.csv 等
│   └── src/
│       ├── App.tsx                            # 双栏布局 + 底部 sticky ActionBar
│       ├── App.css                            # Engineering Bench 暗色,Linear/Vercel 化
│       ├── api/                               # generate / pathview 调用
│       ├── components/                        # CsvImport · ParamsPanel · PresetBar
│       │                                      # Preview2D · PoseTable · BackendStatus
│       ├── hooks/useGenerate.ts               # 200ms debounce 实时重算
│       └── lib/                               # csv · euler · presets(均带 .test.ts)
├── config/                                    # 系统配置(运行时由后端服务加载)
├── data/                                      # 业务数据(相机标定 / 模板 / 焊接规则 等)
├── runtime/                                   # 运行产物(采集 / 日志 / 录像)
└── docs/
    ├── CorrugatedWeldPoseGenerator.md         # 算法技术文档(参数含义 / 公式 / 边界)
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
| generate JSON | `points` + `initial_pose` + `params` |
| 与 pathview 对接 | `points` 含 `x,y,z,rx,ry,rz`,**零转换** |
| 算法下限 | `points.size() ≥ 3`(否则库原样返回,前端会阻止并提示) |

---

## 设计取舍(Why)

- **后端极薄** —— 只做 JSON ↔ C++ 类型转换并调库,一行算法逻辑不碰。保证"调参效果 = 生产效果"。
- **3D 渲染外移** —— 不在 React 端引入 three.js,统一交 pathview 站承载;前端只做 2D 投影(XY/XZ/YZ 三平面)+ 数值表。
- **预设本地化** —— 4 套内置(默认 / 波纹板 / 圆形闭环 / 一般弧形)+ localStorage 自定义。无云同步,YAGNI。
- **主 CTA 收口** —— "在 pathview 中查看"放在底部 sticky ActionBar,常驻可见,且支持 `Ctrl/Cmd + E`。
- **可见反馈** —— 头部双服务状态脉冲点、生成中预览头部出现琥珀色脉冲、ActionBar 实时展示 `PTS / LEN / BBOX`。
- **可访问性** —— 所有交互元素带可见 focus ring,支持 `prefers-reduced-motion`,触摸目标 ≥ 44px。

完整决策记录见 [`docs/superpowers/specs/2026-07-29-pose-visualizer-design.md`](docs/superpowers/specs/2026-07-29-pose-visualizer-design.md)。

---

## 已知风险

1. **DLL 依赖链**:`MultimodalWeldSystem.dll` 递归依赖 nexus 内部 DLL(`Toolkit` / `Nexus` 等)。`pose_backend.exe` **必须**输出到 `${NEXUS_ROOT}/x64/Release/` 复用整套 DLL 链,不要单独拷到别处。
2. **ABI 一致**:后端必须 MSVC / x64 / `/MD` / C++17 / RelWithDebInfo,与 nexus 一致;否则链接失败或运行崩。
3. **`NEXUS_ENV_ROOT` 环境变量**:第三方依赖根目录(Eigen3.4 / opencv-4.10.0 / spdlog / libmodbus)。不指向会头文件找不到,默认回退到 `${NEXUS_ROOT}/../env`。
4. **行为一致性验证**:端到端需用库自带 `MWSTest` 数据集比对一次,确认与生产结果一致 —— 这是上线前的硬性闸口。

故障排查与常见错误见 [`backend/README.md`](backend/README.md) 与 [`docs/superpowers/specs/2026-07-29-pose-visualizer-design.md`](docs/superpowers/specs/2026-07-29-pose-visualizer-design.md#7-已知风险与待实现阶段核实)。

---

<sub>本仓是参数调控工具,不包含生产焊接执行逻辑。算法核心在 `E:\workspace\nexus\MultimodalWeldSystem`。</sub>