# PoseGenerator Backend

C++ HTTP 后端，原生链接 nexus `MultimodalWeldSystem` 库。

## 构建
需先在 `E:\workspace\nexus` 构建 `MultimodalWeldSystem`（产物在 `x64/Release/`）。

```powershell
cd backend
cmake -B build -S .
cmake --build build --config RelWithDebInfo
```
产物 `pose_backend.exe` / `test_adapter.exe` / `test_filter_adapter.exe` 输出到 `backend/runtime/`（独立目录，已 gitignore）。

## 拷贝运行时 DLL
exe 运行时依赖 nexus `x64/Release/` 下整套 DLL。构建后用一键脚本把顶层 `*.dll` 拷到 `runtime/`：

```powershell
# 首次或 nexus 重新构建后执行
pwsh backend/scripts/copy-runtime.ps1
# 覆盖已存在的同名文件
pwsh backend/scripts/copy-runtime.ps1 -Force
```

脚本只拷 `*.dll`（过滤 `.pdb/.lib/.exp`），默认跳过已存在文件，用 `-Force` 覆盖。`-NexusRoot` 可指定 nexus 路径。

## 运行
```powershell
cd backend/runtime
.\pose_backend.exe
```
监听 `http://localhost:8220`。

## 链接库清单

后端链接以下库（`pose_backend` 与 `test_adapter` 一致），均来自 `${NEXUS_ROOT}/x64/Release/` 或 `${NEXUS_ENV_ROOT}/...`：

- MultimodalWeldSystem.lib（生产算法库）
- Toolkit.lib（`sa::RobotPointEx` 实现）
- Nexus.lib（内部辅助类型）
- pos_transform.lib
- RoboLinker.lib
- opencv_world4100.lib（OpenCV 4.10，来自 NEXUS_ENV_ROOT）
- spdlog.lib（日志，来自 NEXUS_ENV_ROOT）

运行时依赖 nexus `x64/Release/` 下的整套 DLL（Qt5/OpenCV/Nexus 各 DLL 等），用 `scripts/copy-runtime.ps1` 拷到 `backend/runtime/`，exe 在该目录内直接运行。

filter 节点(filter_distance/angle/mean/gaussian/savgol/stat_outlier/ransac_line/bspline + 路径分段 filter_path_segmentor)复用同一套 `MultimodalWeldSystem.lib`,无新增链接库。`POST /node/execute` 按 `node_type` 分发到 `filter_adapter`(姿态节点走 `pose_adapter`)。

## 节点执行接口
`POST /node/execute`:统一节点执行接口,body `{node_type, input, params}` → `{output:{points, meta}}`。支持 `node_type`:

- `pose_generate` — `CorrugatedWeldPoseGenerator::generate(points, initial_pose, initial_tangent)`
- `filter_distance` / `filter_angle` / `filter_mean` / `filter_gaussian` / `filter_savgol` / `filter_stat_outlier` / `filter_ransac_line` — 同名 filter 类 `apply()`
- `filter_bspline` — `BSplineFilter` B 样条重建(uniform=均匀重采样/逐点投影)
- `filter_path_segmentor` — `PathSegmentor` 路径分段(分析器:点透传,分段表进 meta;`output_segment` ≥0 时仅输出该段)

`POST /generate` 为迁移期兼容保留。

## 烟雾测试
```powershell
cd backend/runtime
.\test_adapter.exe          # 姿态适配器
.\test_filter_adapter.exe   # 全部 filter + 路径分段
```

