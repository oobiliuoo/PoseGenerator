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
