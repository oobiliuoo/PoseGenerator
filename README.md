# PoseGenerator

焊缝姿态生成参数调控工具。导入 CSV 路径，调用生产 C++ `CorrugatedWeldPoseGenerator::generate()` 生成姿态，就地预览，并跳转 pathview 做 3D 展示。

## 组成
- `backend/` — C++ HTTP 后端 (cpp-httplib)，原生链接 nexus `MultimodalWeldSystem` 库。
- `frontend/` — React + Vite 参数调控前端。

## 启动
见 `backend/` 与 `frontend/` 各自 README。依赖 `E:\workspace\nexus` 的构建产物。
