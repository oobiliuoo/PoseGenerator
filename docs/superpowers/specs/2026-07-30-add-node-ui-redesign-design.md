# 重建「添加节点」UI — 设计文档

日期: 2026-07-30
范围: `frontend/src/components/NodeChain.tsx`、`NodeCard.tsx`、`lib/nodeRegistry.ts`、`App.css`

## 背景与问题

PoseGenerator 是一个深色「工程台」主题的位姿处理流水线编辑器(React 19 + Vite,自定义 CSS,无 UI 库)。用户通过「添加节点」UI 向流水线插入节点。

当前「添加节点」UI 存在三个问题(用户确认的核心痛点):

1. **信息密度低 / 难扫读** — 每个节点项只有「类别小标签 + 名字 + + 短称」三栏,无图标、无描述、无角色区分,不熟悉的用户不知道每个节点干什么。
2. **分组布局混乱** — `.add-group` 用 `inline-flex + margin-right` 横向排列,分组标签与节点项混在一起,组与组无分隔,视觉上像一坨。
3. **视觉平庸 / 不够有设计感** — 设计太普通,没体现 PoseGenerator「工程台 / 焊弧」气质。

(用户未将「两个入口重复」列为痛点,故保留链尾 `+` 与节点头 `+` 两个入口——它们服务不同意图:空状态/追加 vs 中间插入。)

## 目标

在保持 popover 交互形态的前提下,重建「添加节点」UI:
- 清晰的四段分组(纵向 section)
- 每项 = 几何图标 + 名字 + 描述 + 角色色点
- 统一的 `AddNodeMenu` 组件,简化定位逻辑
- 零依赖(内联 SVG 图标),锚定到现有工程台美学

非目标(YAGNI):
- 搜索/过滤(当前 10 节点收益有限,留作未来扩展)
- 命令面板 / 侧滑面板 / 模态对话框形态

## 设计

### 1. 图标体系与节点角色

每个节点类型配一个手绘**内联 SVG 几何图标**(24×24,`stroke="currentColor"`,1.5px 描边,无填充),零依赖。图标语义与节点功能对应:

| 节点 | 图标语义 | 角色(role) | 角色色 |
|---|---|---|---|
| csv_input | 点阵网格(3×3 圆点) | source | `--data`(#22d3ee) |
| pose_generate | 三轴坐标架(rx/ry/rz 箭头) | algorithm | `--arc`(#ffb627) |
| pathview_export | 方框 + 向右箭头出框 | sink | `--arc`(#ffb627) |
| filter_distance | 波形被斜线裁切 | tool | `--ink-dim` |
| filter_angle | 波形被斜线裁切 | tool | `--ink-dim` |
| filter_stat_outlier | 波形被斜线裁切 | tool | `--ink-dim` |
| filter_mean | 平滑正弦波 | tool | `--ink-dim` |
| filter_gaussian | 平滑正弦波 | tool | `--ink-dim` |
| filter_savgol | 平滑正弦波 | tool | `--ink-dim` |
| filter_ransac_line | 散点 + 一条拟合直线 | tool | `--ink-dim` |

> 同语义图标可在多个滤波节点间复用(波形/正弦波);不必为 10 个节点画 10 个不同图标——按视觉可区分性分组即可。

**角色色点**:每项右侧一个 6px 圆点,颜色 = 角色色。让用户一眼区分数据源 / 算法 / 工具 / 输出。

**分组重构**:从当前 `I/O / 算法 / 滤波` 三组,改为贴合数据流方向的四段:
`输入源 → 算法 → 滤波工具 → 输出`

每个 section 一个 mono 大写小标题(如 `FILTER · 滤波工具`)+ 下方一条 `--line-soft` hairline 分隔。section 之间**纵向堆叠**,不再 inline 混排。

### 2. 单项卡片布局与 hover 动效

popover 宽 ~340px,每项高 ~44px,结构:

```
┌─────────────────────────────────────────────┐
│ [icon]  距离滤波                    ●  tool │
│ 24px    按点间距剔除离群点         6px 角色色 │
└─────────────────────────────────────────────┘
 ↑左侧 2px 指示条(hover 时滑入)
```

- **左 2px 指示条**:默认透明,hover 时 `--arc` 从顶向下 120ms 滑入。用伪元素 `::before` + `transform: scaleY(0→1)`,`transform-origin: top`。
- **图标**:24px,`color: var(--ink-dim)`,hover 时变 `--arc`。
- **名字**:IBM Plex Sans 13px,`--ink`,font-weight 500。
- **描述**:JetBrains Mono 10px,`--ink-faint`,单行截断(`text-overflow: ellipsis`)。描述文案写在 `nodeRegistry.ts` 的 `NodeDef` 新增可选 `desc` 字段——单一数据源,不散落在组件里。
- **角色色点**:6px 圆,绝对定位右上。

**hover 整行**:`background: var(--bg-inset)` + `border-color: var(--line)`,与现有 `.nc-add-item:hover` 一致。

**键盘**:`focus-visible` 用 `--arc` 2px outline(inset -1px),支持 ↑/↓ 键在当前 section 内移动焦点。轻量,不引入复杂键盘模型。

**进入动效**:保留 `nc-add-menu-in`(80ms translateY);section 与项用 `animation-delay` 错峰(staggered)——section 标题先出,项按 30ms 间隔依次淡入。一次性、克制。`prefers-reduced-motion` 下禁用(沿用现有全局规则)。

### 3. 两个入口的统一与定位逻辑简化

**保留两个入口,统一组件**:
- 链尾 `+ 添加节点`(空状态 / 追加到末尾)
- 节点头部的 `+`(在该节点之后插入)

两者复用新抽取的 `AddNodeMenu` 组件,只是触发位置与回调不同(`onAddNode(type)` vs `onAddAfter(type, afterId)`)。当前 `NodeChain` 与 `NodeCard` 各自维护一套几乎相同的 portal 定位 + outside-click + Escape 逻辑——抽到一个组件后只写一次。

**定位策略简化**:
当前逻辑把菜单 pin 到「panel 顶部第一个 card head 之上」(`headTop - 4` + `translateY(-100%)`),菜单总向上展开、与触发按钮视觉脱节。

改为**锚定到触发按钮本身**:
- 链尾 `+`:菜单从按钮下沿向下展开(`top = btn.bottom + 6`,左对齐按钮,宽度 = max(按钮宽, 340px))。
- 节点头 `+`:菜单从按钮下沿向下展开,右对齐按钮(避免溢出右边界)。
- 边界检测:若向下展开会超出视口下沿,自动翻转为向上展开。

一处 `useLayoutEffect` 算位置,替代当前两处重复的 `useEffect + scroll/resize` 监听。

**触发按钮视觉**(不变):
- 链尾 `+`:保留虚线框 dashed 风格(占位/空语义),hover 琥珀实线。
- 节点头 `+`:保留 20px mono `+` 小按钮,`is-open` 时琥珀填充。

### 4. 数据流

`AddableGroup` / `AddableType` 类型扩展:

```ts
type NodeRole = 'source' | 'algorithm' | 'tool' | 'sink';

interface AddableType {
  type: string;
  label: string;
  short: string;
  category: string;     // 保留
  desc: string;         // 新增:一行描述
  role: NodeRole;       // 新增:角色
  icon: string;         // 新增:图标 key,组件内映射到 SVG
}
```

`NodeDef`(nodeRegistry.ts)新增可选 `desc?: string` 与 `role?: NodeRole`(`role` 也可由 `category` + `isSource`/`isSink` 派生,但显式声明更清晰)。`buildAddableGroups` 一次性构建四段分组,组件只负责渲染。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `frontend/src/lib/nodeRegistry.ts` | `NodeDef` 加 `desc` / `role`;为 10 节点填描述与角色;`buildAddableGroups` 改四段分组(该函数现位于 `NodeChain.tsx`,迁移到此或保留——见实现计划) |
| `frontend/src/types/index.ts` | 加 `NodeRole` 类型;扩展 `AddableType`/`AddableGroup`(若类型定义在此) |
| `frontend/src/components/AddNodeMenu.tsx` | **新建**:统一 popover 组件(图标映射 + 分组渲染 + 定位 + outside-click/Escape + 键盘) |
| `frontend/src/components/NodeChain.tsx` | 链尾入口改用 `AddNodeMenu`;移除自有定位逻辑 |
| `frontend/src/components/NodeCard.tsx` | 节点头 `+` 入口改用 `AddNodeMenu`;移除自有定位逻辑;`AddableType`/`AddableGroup` 类型若在此定义则迁移 |
| `frontend/src/App.css` | 重写 `.nc-add-*` / `.add-group*` 样式;新增图标、角色色点、指示条、stagger 动效;保留可复用的 token |

## 验证标准

1. 链尾 `+` 与节点头 `+` 都能打开重建后的 popover,四段分组清晰纵向堆叠。
2. 每项显示图标 + 名字 + 描述 + 角色色点;hover 出现琥珀指示条与高亮。
3. 菜单锚定到触发按钮下沿;接近视口下沿时自动向上翻转,不溢出。
4. outside-click / Escape 关闭;↑/↓ 键在 section 内移动焦点。
5. `prefers-reduced-motion` 下无 stagger 动效。
6. `npm run build` 通过(tsc -b + vite build,无类型错误)。
7. 现有节点添加功能不回归(添加后出现在正确位置,参数为默认值)。
