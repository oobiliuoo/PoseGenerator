# CorrugatedWeldPoseGenerator 技术方案文档

> 基于路径几何特征的自适应焊缝姿态生成器，支持折线、曲线、闭合路径三种模式自动切换。

---

## 1. 概述

### 1.1 要解决的问题

在机器人焊接场景中，焊缝路径通常是三维空间中的一系列离散点，仅包含位置信息。机器人执行焊接时，焊枪不仅需要跟随路径移动，还需要在每个位置上保持合理的**姿态**（欧拉角），以保证焊接质量和工艺要求。

对于以下两类典型焊缝形态，人工指定每个点的姿态不现实：

- **波纹板 / 瓦楞板**：具有周期性弯折特征，弯折处需要姿态平滑过渡，平直段应保持姿态稳定。
- **圆形 / 弧形焊缝**：闭合曲线路径，姿态应沿切线方向连续变化，且首尾需对齐。

`CorrugatedWeldPoseGenerator` 提供了一套自动化方案：**输入路径点的位置序列 + 一个初始姿态，输出每个点对应的完整位姿（位置 + 姿态）**。

### 1.2 算法特点

| 特性 | 说明 |
|------|------|
| **路径拓扑感知** | 自动检测路径是否闭合（弦长/路径长 < 5%） |
| **双模式 (Dual-Mode)** | 分段模式 vs 全曲线模式，根据弯曲占比自动切换 |
| **角点自检测** | 基于切向量曲率阈值自动识别路径拐点 |
| **平滑过渡** | 角点过渡区使用 smoothstep + slerp 插值 |
| **欧拉角解缠绕** | 消除万向节死锁导致的 ±180° 跳变 |
| **稀疏输出** | KEYPOINTS 模式支持仅输出关键点，减少冗余数据 |

---

## 2. 算法原理

### 2.1 整体流程

```
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 │ 输入点序列│───▶│ 闭合检测  │───▶│ 切向量计算│───▶│ 曲率计算  │───▶│ 路径分段  │
 └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                       │
                                                              ┌────────┴────────┐
                                                              ▼                  ▼
                                                     ┌──────────────┐   ┌──────────────┐
                                                     │  分段模式     │   │ 全曲线模式    │
                                                     │(过渡占比≤80%)│   │(过渡占比>80%) │
                                                     └──────┬───────┘   └──────┬───────┘
                                                            │                   │
                                                     ┌──────┴───────┐   ┌──────┴───────┐
                                                     │段统一姿态    │   │逐点累积旋转  │
                                                     │过渡区slerp   │   │首尾对齐(闭合)│
                                                     └──────┬───────┘   └──────┬───────┘
                                                            │                   │
                                                            └─────────┬─────────┘
                                                                      ▼
                                                            ┌────────────────┐
                                                            │ 欧拉角解缠绕 + │
                                                            │ 输出模式选择   │
                                                            └────────────────┘
```

### 2.2 步骤详解

#### Step 1 — 闭合检测 (`isPathClosed`)

判断路径是否闭合。计算逻辑：

```
闭合判定条件: 弦长 / 路径总长 < 0.05
```

- **弦长**：首尾点之间的直线距离 `||P_N-1 - P_0||`
- **路径总长**：相邻点间欧氏距离之和

对闭合路径，后续所有涉及索引边界操作的步骤（切向量计算、平滑窗口、曲率计算）都需要做环形处理。

#### Step 2 — 原始切向量计算 (`computeRawTangents`)

对每个点 `i`，使用中心差分计算切向量：

```
对于开放路径:   T_raw[i] = normalize(P_{i+1} - P_{i-1})     [中间点]
                T_raw[0] = normalize(P_1 - P_0)              [首点: 前向差分]
                T_raw[N-1] = normalize(P_{N-1} - P_{N-2})    [末点: 后向差分]

对于闭合路径:   T_raw[i] = normalize(P_{(i+1)mod N} - P_{(i-1+N)mod N})
```

> **设计意图**：原始切向量保留路径方向变化的原始信号，用于后续的曲率计算和角点检测。平滑操作在下一步独立进行。

#### Step 3 — 切向量平滑 (`computeTangents`)

对原始切向量应用滑动窗口平均：

```
T_smooth[i] = normalize( (1/W) * Σ_{j=-w/2}^{w/2} T_raw[idx(i+j)] )
```

- 窗口大小 `W` = `tangent_smooth_window`
- 闭合路径窗口跨越边界，开放路径窗口在边界处截断
- 平滑后再次归一化，防止平均后向量退化

#### Step 4 — 曲率计算 (`computeCurvatures`)

曲率定义为**相邻原始切向量之间的夹角**：

```
κ[i] = arccos( clamp( T_raw[i] · T_raw[i-1], -1, 1 ) )
```

- `κ[i] = 0` 表示方向未改变（直线段）
- `κ[i]` 越大表示该处弯曲越剧烈

> **注意**：曲率基于原始切向量计算（非平滑后），这样角点检测更敏感，不会被平滑操作"抹平"真实的拐点。

#### Step 5 — 角点检测与路径分段 (`segmentPath`)

这是算法的核心，分为三个子步骤：

**5a. 识别角点区域**

扫描曲率序列，将 `κ[i] > curvature_threshold` 的点标记为候选角点。连续的候选角点合并为一个角点区域 `[start, end]`。

**5b. 过滤噪声角点**

长度 `< min_corner_region_length` 的角点区域视为噪声，直接丢弃。合法角点区域取其中心索引标记为真正的角点 `is_corner[center] = true`。

**5c. 膨胀过渡区 + 生成直线段**

以角点区域边界为中心，向外各扩展 `smooth_half_width` 个点，形成过渡区 `is_transition[i] = true`。不在任何过渡区内的连续区间形成一个 **Segment**（直线段）。

```
图示（● 过渡区点，○ 直线段点）：

段A         过渡区        段B         过渡区        段C
○○○○  ●●●●●●●●●●●●  ○○○○○○○○  ●●●●●●●●●●●●  ○○○○
────────    ────    ────────    ────    ────
 seg[0]     gap      seg[1]     gap     seg[2]
```

**5d. 全曲线判定**

当过渡区点数占总点数的比例 `> all_curve_threshold`（默认 80%）时，路径上几乎全是弯曲区域，此时触发**全曲线模式**。

#### Step 6a — 分段模式姿态生成

**段姿态计算** (`computeSegmentPoses`)：

对于每个 Segment，计算段内平滑切向量的均值方向，作为该段的主方向。从初始姿态 `R_init` 出发，依次累积每段的旋转：

```
seg_q[k] = ΔR_{k-1→k} · seg_q[k-1]
```

其中 `ΔR = rotationBetweenVectors(t_prev, t_curr)` 计算从上一段主方向旋转到当前段主方向的最短旋转四元数。

**姿态变化限制**：如果相邻段的姿态变化角度超过 `max_pose_change_angle`，则限制为最大允许角度（简单截断，不补偿）。

**姿态组装** (`assembleRotations`)：

- **直线段内**：所有点采用该段的统一姿态 `seg_q[k]`
- **过渡区（gap）内**：使用 smoothstep 加权的 slerp 插值：
  ```
  R[i] = slerp(R_before, R_after, smoothstep(t))
  
  smoothstep(t) = 3t² - 2t³
  ```
  在 gap 的入口和出口处导数 = 0，保证姿态变化率连续。

**符号一致性处理**：slerp 前确保 `R_before · R_after ≥ 0`（通过翻转四元数符号），避免 slerp 走"远路"。

#### Step 6b — 全曲线模式姿态生成 (`computeLocalRotations`)

当过渡区占比 > 80% 时，分段模式不再适用（几乎没有直线段）。改用逐点累积旋转：

```
R[0] = R_init
for i = 1..N-1:
    ΔR = rotationBetweenVectors(T_smooth[i-1], T_smooth[i])
    R[i] = ΔR · R[i-1]
```

**姿态限制**：对每个点的姿态变化进行限制，超过 `max_pose_change_angle` 时使用 slerp 截断。

**闭合路径首尾对齐**：对于闭合路径，首尾姿态应一致。算法在前 `blend_count` 个点执行首尾混合：
```
R[i] = slerp(R[N-1], R[i], smoothstep((i+1)/(blend_count+1)))
for i = 0..blend_count-1
```

#### Step 7 — 欧拉角解缠绕 (`unwrapEuler`)

Eigen 的 `eulerAngles()` 对于同一个旋转可能输出两种等价欧拉角表示（万向节死锁导致）：

```
表示A: (rz,     ry,      rx)
表示B: (rz+180°, 180°-ry, rx+180°)
```

解缠绕算法：计算当前角在两种表示下分别与前一帧的差异，选择差异更小的表示，使得欧拉角序列在时间上连续。

```
dist_orig = Σ |normalize(θ_i - θ_prev)|
dist_alt  = Σ |normalize(θ_i' - θ_prev)|
choose argmin(dist_orig, dist_alt)
```

最后将各轴角度归一化到 `(-180°, 180°]` 范围。

#### Step 8 — 输出模式

| 模式 | 行为 |
|------|------|
| `FULL` | 输出全部 `N` 个点，每个点包含解缠绕后的欧拉角 |
| `KEYPOINTS` | 稀疏输出：分段模式下输出 segment 端点 + 过渡区全部点；全曲线模式下基于 `keypoint_pose_angle_threshold` 做姿态增量筛选 |

---

## 3. 数据流

```
                     ┌──────────────────────┐
                     │   generate()          │
                     │                       │
  points(N) ───────▶ │  positions[N]         │
  initial_pose ────▶ │  ┌───────────────────┐│
                     │  │ isPathClosed()    │──── is_closed
                     │  └───────────────────┘│
                     │  ┌───────────────────┐│
                     │  │ computeRawTangents│──── raw_tangents[N]
                     │  └───────────────────┘│
                     │          │            │
                     │     ┌────┴───────┐    │
                     │     ▼            ▼    │
                     │  curvatures[N]  tangents[N]  ← computeTangents()
                     │     │                 │
                     │     ▼                 │
                     │  segmentPath()        │
                     │     │                 │
                     │     ├── is_corner[N]  │
                     │     ├── is_trans[N]   │
                     │     └── segments[M]   │
                     │          │            │
                     │   transition_ratio >  │
                     │   all_curve_threshold?│
                     │     │            │    │
                     │    YES           NO   │
                     │     │            │    │
                     │     ▼            ▼    │
                     │  computeLocal   computeSegmentPoses
                     │  Rotations()    assembleRotations
                     │     │            │    │
                     │     └─────┬──────┘    │
                     │           ▼           │
                     │     rotations[N]      │
                     │           │           │
                     │     output_mode?      │
                     │     │            │    │
                     │    FULL      KEYPOINTS│
                     │     │            │    │
                     │     ▼            ▼    │
                     │  unwrapEuler  稀疏筛选 │
                     │  + 全量输出   + 输出  │
                     └──────────────────────┘
                              │
                              ▼
                     result (RobotPointEx[])
```

### 关键数据依赖关系

| 数据 | 来源 | 消费者 | 说明 |
|------|------|--------|------|
| `is_closed` | `isPathClosed()` | `computeRawTangents`, `computeTangents`, `computeLocalRotations` | 控制所有环形边界行为 |
| `raw_tangents` | `computeRawTangents()` | `computeCurvatures`, `computeTangents` | 未平滑的切向量 |
| `tangents` | `computeTangents()` | `computeSegmentPoses`, `computeLocalRotations`, `meanTangent` | 平滑后的切向量 |
| `curvatures` | `computeCurvatures()` | `segmentPath` | **由 raw_tangents 计算** |
| `segments` | `segmentPath()` | `computeSegmentPoses`, `assembleRotations` | 分段模式使用 |
| `is_transition` | `segmentPath()` | `generate`（全曲线判定 + KEYPOINTS筛选） | 过渡区标记 |
| `transition_ratio` | `generate` 内部计算 | 模式选择 | 决定走分段还是全曲线 |

---

## 4. API 参考

### 4.1 主接口

```cpp
std::vector<sa::RobotPointEx> generate(
    const std::vector<sa::RobotPointEx>& points,
    const cv::Point3f& initial_pose,
    const cv::Point3f& initial_tangent = {0, 0, 0});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `points` | `vector<RobotPointEx>` | 输入路径点序列，仅使用位置信息（x, y, z），姿态信息被忽略。至少需要 3 个点。 |
| `initial_pose` | `cv::Point3f` | 初始姿态，欧拉角（度），ZYX 旋转顺序。作为第一个点的参考姿态。 |
| `initial_tangent` | `cv::Point3f` | 可选(默认 `{0,0,0}`)。初始姿态对应的切线方向(焊枪前进方向)。非零时,旋转初始姿态对齐路径实际起始切线方向,用于起点姿态与进给方向一致的场景。 |

| 返回值 | 说明 |
|--------|------|
| `vector<RobotPointEx>` | 与输入等长的点序列（FULL 模式）或稀疏序列（KEYPOINTS 模式），每个点包含原始位置 + 生成的姿态欧拉角。 |

**前置条件**：`points.size() >= 3`。少于 3 个点直接返回原序列，不做任何姿态计算。

### 4.2 参数配置

```cpp
void setParams(const Params& p);
const Params& getParams() const;
```

### 4.3 参数一览

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `curvature_threshold` | `double` | `0.07` | 曲率阈值（弧度），≈ 4.0°。超过此值的相邻切向量夹角判定为角点。 |
| `smooth_half_width` | `int` | `2` | 角点区域向外膨胀的半宽（点数）。 |
| `tangent_smooth_window` | `int` | `5` | 切向量滑动平均窗口大小。必须为奇数（取 `w/2` 向下取整作为半宽）。 |
| `min_corner_region_length` | `int` | `2` | 角点区域最小长度。短于此值的角点区域视为噪声丢弃。 |
| `output_mode` | `OutputMode` | `FULL` | 输出模式：`FULL`（全量）或 `KEYPOINTS`（关键点）。 |
| `max_pose_change_angle` | `double` | `45.0` | 最大姿态变化角度（度）。相邻段/相邻点姿态变化超过此值将被限制。 |
| `all_curve_threshold` | `double` | `0.8` | 全曲线判定阈值。过渡区点数占比超过此值触发全曲线模式。 |
| `keypoint_pose_angle_threshold` | `double` | `5.0` | 仅全曲线 + KEYPOINTS 模式下生效。相邻输出点姿态角变化超过此值才保留该点。 |

### 4.4 常用参数组合

**波纹板 / 瓦楞板（典型折线焊缝）**：
```cpp
Params params;
params.curvature_threshold = 0.07;     // ≈4°, 检测较明显的拐角
params.smooth_half_width = 2;
params.tangent_smooth_window = 5;
params.min_corner_region_length = 1;   // 允许单点角点
```

**圆形闭环焊缝**：
```cpp
Params params;
params.curvature_threshold = 0.001;    // ≈0.06°, 极低阈值 → 几乎所有点都是"角点"
params.all_curve_threshold = 0.6;      // 降低全曲线触发门槛
params.smooth_half_width = 0;          // 无需过渡区膨胀
params.tangent_smooth_window = 5;
```

**一般弧形焊缝（适度平滑）**：
```cpp
Params params;
params.output_mode = Params::KEYPOINTS;
params.max_pose_change_angle = 30.0;   // 限制姿态变化幅度
params.keypoint_pose_angle_threshold = 3.0; // 较细粒度的关键点采样
```

---

## 5. 使用示例

### 5.1 基本用法

```cpp
#include "tool/CorrugatedWeldPoseGenerator.h"

// 1. 准备路径点（仅位置）
std::vector<sa::RobotPointEx> path_points;
path_points.push_back(sa::RobotPointEx(0.0f, 0.0f, 0.0f));
path_points.push_back(sa::RobotPointEx(100.0f, 0.0f, 0.0f));
path_points.push_back(sa::RobotPointEx(200.0f, 50.0f, 0.0f));  // 拐角
path_points.push_back(sa::RobotPointEx(300.0f, 50.0f, 0.0f));
path_points.push_back(sa::RobotPointEx(400.0f, 0.0f, 0.0f));   // 拐角
path_points.push_back(sa::RobotPointEx(500.0f, 0.0f, 0.0f));

// 2. 配置参数
mws::CorrugatedWeldPoseGenerator generator;
mws::CorrugatedWeldPoseGenerator::Params params;
params.curvature_threshold = 0.07;
params.smooth_half_width = 2;
generator.setParams(params);

// 3. 设定初始姿态并生成
cv::Point3f initial_pose(0.0f, 45.0f, 178.0f);  // RX, RY, RZ (度)
auto result = generator.generate(path_points, initial_pose);

// 4. 使用结果
for (const auto& pt : result) {
    auto pos = pt.toPos();  // 位置 (x, y, z)
    auto rot = pt.toRot();  // 姿态 (rx, ry, rz)，已解缠绕
    // 发送到机器人控制器...
}
```

### 5.2 全曲线模式（圆形焊缝）

```cpp
// 生成 360 个点的圆
std::vector<sa::RobotPointEx> circle;
for (int i = 0; i < 360; ++i) {
    double angle = i * 2.0 * M_PI / 360.0;
    circle.push_back(sa::RobotPointEx(
        100.0f * cos(angle), 100.0f * sin(angle), 0.0f));
}

mws::CorrugatedWeldPoseGenerator generator;
mws::CorrugatedWeldPoseGenerator::Params params;
params.curvature_threshold = 0.001;  // 极低阈值触发全曲线模式
params.all_curve_threshold = 0.6;
params.smooth_half_width = 0;

generator.setParams(params);
auto result = generator.generate(circle, cv::Point3f(0, 45, 90));

// 圆形焊缝姿态会沿切线方向连续旋转
// 首尾姿态对齐，避免接缝处跳变
```

### 5.3 KEYPOINTS 稀疏输出

```cpp
Params params;
params.output_mode = Params::KEYPOINTS;
params.curvature_threshold = 0.07;

generator.setParams(params);
auto result = generator.generate(path_points, initial_pose);

// result.size() < path_points.size()
// 平直段只保留首尾端点，拐角过渡区保留全部点
// 注意：KEYPOINTS 模式下输出未解缠绕的欧拉角，下游需自行处理
```

---

## 6. 适用场景与限制

### 6.1 适用场景

| 场景 | 推荐模式 | 典型参数 |
|------|----------|----------|
| 瓦楞板/波纹板焊缝 | 分段模式 | `curvature_threshold=0.07` |
| 圆形封闭焊缝 | 全曲线模式（自动） | `curvature_threshold=0.001` |
| 任意弧线焊缝 | 自动切换 | 默认参数 |
| 直线焊缝 | 分段模式（全程单段） | 任意参数 |
| 数据精简传输 | KEYPOINTS | `output_mode=KEYPOINTS` |

### 6.2 已知限制

1. **仅考虑位置几何**：姿态仅由路径切向量方向决定，不考虑焊接工艺约束（如焊枪倾角、前进角等工艺参数）。工艺姿态需要在输出基础上叠加。

2. **绕切向量轴的旋转自由度**：`rotationBetweenVectors` 只确定"将初始姿态的某轴对齐到切向量"的旋转，绕切向量轴的自由度由初始姿态决定，算法不会主动优化。

3. **闭合路径首尾对齐仅修正前段**：当前实现只在路径开头 `blend_count` 个点进行混合，尾部未做对称修正。对于首尾姿态差异大的闭合路径，开头几个点的姿态可能被"拉偏"。

4. **浮点精度**：内部使用 `double`（Eigen::Quaterniond），输出时转为 `float`（cv::Point3f）。往返转换会产生累积误差。

5. **路径点数下限**：至少需要 3 个点。2 个点以下直接返回原序列。

---

## 7. 内部实现要点

### 7.1 依赖

| 库 | 用途 |
|----|------|
| Eigen 3.x | 矩阵/向量/四元数运算，slerp 插值 |
| OpenCV | `cv::Point3f` 坐标类型 |
| NexusType | `sa::RobotPointEx` 点类型 |
| NexusLogger | 调试日志（`LOG_D`, `LOG_I`, `LOG_E` 宏） |

### 7.2 关键常量

```cpp
// 闭合判定：弦长/路径长 < 0.05
constexpr double kPathClosureRatioThreshold = 0.05;

// rotationBetweenVectors 中判定平行/反平行的阈值
constexpr double kParallelThreshold = 0.999999;  // cos(0.08°)
```

### 7.3 数值稳定性措施

- 所有 `acos` 前先 clamp 到 `[-1, 1]`
- `slerp` 前检查四元数符号一致性（`dot < 0` 则翻转）
- 零向量检查（`norm > 1e-8`）防止除零
- smoothstep 输入 clamp 到 `[0, 1]`

### 7.4 旋转顺序

欧拉角与四元数互转统一采用 **ZYX 内旋顺序**（即先绕 Z 轴，再绕 Y 轴，最后绕 X 轴）。这对应 Eigen 的 `Eigen::AngleAxisd(rz, Z) * Eigen::AngleAxisd(ry, Y) * Eigen::AngleAxisd(rx, X)`。

---

## 8. 测试覆盖

| 测试用例 | 文件 | 说明 |
|----------|------|------|
| `GenerateFromCSV` | `Test_CorrugatedWeldPoseGenerator.hpp` | 从 CSV 文件读入真实波纹板数据，生成姿态并输出 |
| `EmptyInput` | 同上 | 空输入返回空结果 |
| `SinglePoint` | 同上 | 单点输入返回单点 |
| `ParamsSetting` | 同上 | 参数读写正确性 |
| `LinearPath` | 同上 | 直线路径姿态一致性 |
| `CurvedPath` | 同上 | 曲线路径姿态变化 |
| `KeypointOutputMode` | 同上 | KEYPOINTS 模式输出数量小于输入 |
| `FullCirclePath` | 同上 | 闭合圆形姿态连续性和首尾对齐 |

---

## 9. PathSegmentor 路径分段器

姿态生成内部的分段链路(闭合检测/切向量/曲率/角点/分段)已提取为独立的 `mws::PathSegmentor`(`tool/PathSegmentor.h`),可单独使用:

```cpp
mws::PathSegmentor seg;
seg.setParams(sp);                                  // 参数与姿态生成的分段参数同源
auto r = seg.segment(positions);                    // 输入 vector<cv::Point3f>(仅位置)
// r.segments    — 全覆盖分段列表 {start, end, type}
// r.is_corner / r.is_transition / r.tangents
// r.is_closed / r.transition_ratio
```

- **分段语义(当前版本)**:`segments` 为**全覆盖**——非过渡区段按弯曲点占比分类 LINE/CURVE,过渡区连续区间作为 CURVE 段插入,各段首尾连续拼接覆盖 `[0, N-1]`,点数之和等于输入总点数。
- 老版本过渡区不生成段(分段间留空洞);本工具的段选输出(`filter_path_segmentor` 节点)按闭区间 `[start, end]` 切片,两种语义均兼容。

---

## 10. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.2 | 2026-09-07 | 分段链路提取为独立 `PathSegmentor` 类;分段改全覆盖语义(过渡区成 CURVE 段) |
| 1.1 | 2026-09-04 | `generate()` 新增第三参数 `initial_tangent`(初始切线方向对齐);RMF 姿态重写 |
| 1.0 | — | 初始版本,支持分段模式和全曲线模式 |

---

*文档生成日期：2026-07-29*
