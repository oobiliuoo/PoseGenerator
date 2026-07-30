# PoseGenerator Backend

C++ HTTP 后端，原生链接 nexus `MultimodalWeldSystem` 库。

## 构建
需先在 `E:\workspace\nexus` 构建 `MultimodalWeldSystem`（产物在 `x64/Release/`）。

```powershell
cd backend
cmake -B build -S .
cmake --build build --config RelWithDebInfo
```
产物 `pose_backend.exe` / `test_adapter.exe` 输出到 `backend/runtime/`（独立目录，已 gitignore）。

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

## 节点执行接口
`POST /node/execute`：统一节点执行接口，body `{node_type, input, params}` → `{output}`。第一阶段支持 `node_type=pose_generate`。`POST /generate` 为迁移期兼容保留。

