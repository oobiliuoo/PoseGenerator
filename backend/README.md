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
## 链接库清单

后端链接以下库（`pose_backend` 与 `test_adapter` 一致），均来自 `${NEXUS_ROOT}/x64/Release/` 或 `${NEXUS_ENV_ROOT}/...`：

- MultimodalWeldSystem.lib（生产算法库）
- Toolkit.lib（`sa::RobotPointEx` 实现）
- Nexus.lib（内部辅助类型）
- pos_transform.lib
- RoboLinker.lib
- opencv_world4100.lib（OpenCV 4.10，来自 NEXUS_ENV_ROOT）
- spdlog.lib（日志，来自 NEXUS_ENV_ROOT）

运行时依赖 `${NEXUS_ROOT}/x64/Release/` 目录下的整套 DLL（Qt5/OpenCV/Nexus 各 DLL 等），`pose_backend.exe` 输出到该目录以复用 DLL 链。
