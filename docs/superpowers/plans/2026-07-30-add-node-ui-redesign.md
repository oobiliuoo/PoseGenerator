# 重建「添加节点」UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重建 PoseGenerator 前端「添加节点」popover,改为四段分组 + 图标/描述/角色色点的卡片列表,统一两个入口的组件与定位逻辑。

**Architecture:** 新建 `AddNodeMenu` 组件统一渲染 popover 并处理定位/关闭/键盘;`NodeDef` 扩展 `desc`/`role` 字段作为单一数据源;`NodeChain`(链尾)与 `NodeCard`(节点头)两个入口都调用 `AddNodeMenu`,删除各自重复的 portal 定位逻辑;CSS 重写 `.nc-add-*` 与 `.add-group*`。

**Tech Stack:** React 19 + TypeScript + Vite,自定义 CSS(无 UI 库),内联 SVG 图标(零依赖),测试用 `npx tsx` 跑 Node `assert` 脚本。

## Global Constraints

- 无新增 npm 依赖(图标用内联 SVG,`stroke="currentColor"`,1.5px 描边,24×24)。
- 复用现有 CSS token:`--arc`(#ffb627)、`--data`(#22d3ee)、`--ink-dim`、`--ink-faint`、`--line`、`--line-soft`、`--bg-inset`、`--bg-panel`、`--mono`、`--sans`、`--radius`。
- 字体:描述用 `--mono` 10px,名字用 `--sans` 13px,section 标题用 `--mono` 大写。
- `prefers-reduced-motion` 下禁用 stagger 动效(沿用 `App.css` 顶部全局规则)。
- 中文文案;提交信息中文,前缀 `feat/fix/docs`。
- 现有节点添加功能不回归:`makeNode(type)` 仍生成默认参数的节点实例,插入位置语义不变(链尾=追加末尾,节点头 `+`=在该节点之后)。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `frontend/src/types/index.ts` | 加 `NodeRole` 类型;`NodeDef` 加 `desc?`/`role?` 字段 |
| `frontend/src/lib/nodeRegistry.ts` | 为 10 节点填 `desc`/`role`;导出 `buildAddableGroups()`(从 `NodeChain.tsx` 迁入并改四段分组) |
| `frontend/src/components/AddNodeMenu.tsx` | **新建**:统一 popover 组件(图标映射 + 分组渲染 + 锚定定位 + outside-click/Escape + ↑/↓ 键盘) |
| `frontend/src/components/NodeChain.tsx` | 链尾入口改用 `AddNodeMenu`;删除自有定位/outside-click 逻辑 |
| `frontend/src/components/NodeCard.tsx` | 节点头 `+` 入口改用 `AddNodeMenu`;删除自有定位/outside-click 逻辑;`AddableType`/`AddableGroup` 类型定义迁移到 `nodeRegistry.ts` |
| `frontend/src/App.css` | 重写 `.nc-add-*`/`.add-group*`;新增图标/角色色点/指示条/stagger 动效 |
| `frontend/src/lib/nodeRegistry.test.ts` | **新建**:`buildAddableGroups` 四段分组与字段测试 |

---

### Task 1: 扩展类型与注册表数据

**Files:**
- Modify: `frontend/src/types/index.ts:92-104`(`NodeDef`)
- Modify: `frontend/src/lib/nodeRegistry.ts:27-190`(`NODE_REGISTRY` 各节点)
- Test: `frontend/src/lib/nodeRegistry.test.ts`(新建)

**Interfaces:**
- Produces: `NodeRole` 类型(`'source'|'algorithm'|'tool'|'sink'`);`NodeDef` 新增可选 `desc?: string`、`role?: NodeRole`;10 个节点都带 `desc` 与 `role`。

- [ ] **Step 1: 在 `types/index.ts` 加 `NodeRole` 并扩展 `NodeDef`**

在 `frontend/src/types/index.ts` 的 `NodeDef` 接口上方加:

```ts
/** 节点在数据流中的角色(用于添加菜单的角色色点)。 */
export type NodeRole = 'source' | 'algorithm' | 'tool' | 'sink';
```

在 `NodeDef` 接口内(`visualizableMeta?: string[];` 之后)加两个字段:

```ts
  /** 一行描述(添加菜单展示)。 */
  desc?: string;
  /** 数据流角色(添加菜单角色色点)。 */
  role?: NodeRole;
```

- [ ] **Step 2: 在 `nodeRegistry.ts` 为 10 节点填 `desc` 与 `role`**

按下列表给每个节点对象加 `desc` 与 `role` 字段(放在 `category` 之后):

| type | role | desc |
|---|---|---|
| csv_input | source | 从 CSV 文件读入轨迹点 |
| pose_generate | algorithm | 由曲率生成焊枪姿态 |
| pathview_export | sink | 推送结果到 pathview |
| filter_distance | tool | 按点间距剔除离群点 |
| filter_angle | tool | 按方向角变化剔除抖动 |
| filter_mean | tool | 邻域均值平滑轨迹 |
| filter_gaussian | tool | 高斯核平滑轨迹 |
| filter_savgol | tool | Savitzky-Golay 多项式平滑 |
| filter_stat_outlier | tool | 统计离群点剔除 |
| filter_ransac_line | tool | RANSAC 直线拟合(结果有随机性) |

例如 `csv_input` 改为:

```ts
  csv_input: {
    type: 'csv_input',
    label: 'CSV 输入',
    category: 'io',
    role: 'source',
    desc: '从 CSV 文件读入轨迹点',
    isSource: true,
    isSink: false,
    params: [],
    async execute(_input, _params, ctx) { /* ... 原样不动 ... */ },
  },
```

其余 9 个节点同理加 `role` 与 `desc`,**不改 `execute`/`params`/其他字段**。

- [ ] **Step 3: 写失败测试 `nodeRegistry.test.ts`**

新建 `frontend/src/lib/nodeRegistry.test.ts`:

```ts
import assert from 'node:assert';

async function run() {
  const { NODE_REGISTRY } = await import('./nodeRegistry');

  // 每个节点都有 desc 与 role
  for (const def of Object.values(NODE_REGISTRY)) {
    assert(def.desc && def.desc.length > 0, `${def.type} 缺 desc`);
    assert(['source', 'algorithm', 'tool', 'sink'].includes(def.role!), `${def.type} role 非法`);
  }

  // 角色与 isSource/isSink 一致性
  assert(NODE_REGISTRY['csv_input'].role === 'source', 'csv_input 应为 source');
  assert(NODE_REGISTRY['pathview_export'].role === 'sink', 'pathview_export 应为 sink');
  assert(NODE_REGISTRY['pose_generate'].role === 'algorithm', 'pose_generate 应为 algorithm');
  for (const t of ['filter_distance', 'filter_mean', 'filter_ransac_line']) {
    assert(NODE_REGISTRY[t].role === 'tool', `${t} 应为 tool`);
  }

  console.log('nodeRegistry.test OK');
}
run();
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx tsx src/lib/nodeRegistry.test.ts`(在 `frontend/` 下)
Expected: 输出 `nodeRegistry.test OK`

- [ ] **Step 5: 类型检查**

Run: `npx tsc -b`
Expected: 无错误退出。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/types/index.ts frontend/src/lib/nodeRegistry.ts frontend/src/lib/nodeRegistry.test.ts
git commit -m "feat(node): NodeDef 扩展 desc/role 字段并填充 10 节点"
```

---

### Task 2: 迁移并重写 `buildAddableGroups` 为四段分组

**Files:**
- Modify: `frontend/src/lib/nodeRegistry.ts`(末尾加 `buildAddableGroups` + `AddableType`/`AddableGroup` 类型)
- Modify: `frontend/src/components/NodeCard.tsx:7-17`(删除 `AddableType`/`AddableGroup` 本地定义,改从 `nodeRegistry` import)
- Modify: `frontend/src/components/NodeChain.tsx:5,21-41`(删除本地 `buildAddableGroups`,改 import)
- Test: `frontend/src/lib/nodeRegistry.test.ts`(追加分组测试)

**Interfaces:**
- Produces: `AddableType { type; label; short; category; desc; role; icon }`、`AddableGroup { group; items }`、`buildAddableGroups(): AddableGroup[]`(四段:`输入源`/`算法`/`滤波工具`/`输出`)。
- `icon` 是 string key,组件内映射到 SVG(Task 3)。

- [ ] **Step 1: 在 `nodeRegistry.ts` 加类型与 `buildAddableGroups`**

在 `frontend/src/lib/nodeRegistry.ts` 末尾(`makeNode` 之后)加:

```ts
// ---- 添加菜单数据模型 ----

export type NodeRole = import('../types').NodeRole;

export interface AddableType {
  type: string;
  label: string;
  short: string;
  category: string;
  desc: string;
  role: NodeRole;
  icon: string;   // 组件内映射到内联 SVG
}

export interface AddableGroup {
  group: string;
  items: AddableType[];
}

/** 图标 key 映射:节点 type -> 图标语义 key(AddNodeMenu 内据此渲染 SVG)。 */
const ICON_KEY: Record<string, string> = {
  csv_input: 'grid',
  pose_generate: 'axes',
  pathview_export: 'export',
  filter_distance: 'wave-cut',
  filter_angle: 'wave-cut',
  filter_stat_outlier: 'wave-cut',
  filter_mean: 'wave',
  filter_gaussian: 'wave',
  filter_savgol: 'wave',
  filter_ransac_line: 'ransac',
};

/** 短称(沿用旧逻辑)。 */
function shortOf(type: string, label: string): string {
  if (type === 'csv_input') return 'CSV';
  if (type === 'pose_generate') return '姿态';
  if (type === 'pathview_export') return '导出';
  return label;
}

/** 构建添加菜单的四段分组(输入源 / 算法 / 滤波工具 / 输出)。 */
export function buildAddableGroups(): AddableGroup[] {
  const groups: AddableGroup[] = [
    { group: '输入源', items: [] },
    { group: '算法', items: [] },
    { group: '滤波工具', items: [] },
    { group: '输出', items: [] },
  ];
  const idx = (role: NodeRole) =>
    role === 'source' ? 0 : role === 'algorithm' ? 1 : role === 'tool' ? 2 : 3;
  for (const d of Object.values(NODE_REGISTRY)) {
    const role = d.role ?? 'tool';
    groups[idx(role)].items.push({
      type: d.type,
      label: d.label,
      short: shortOf(d.type, d.label),
      category: d.category,
      desc: d.desc ?? '',
      role,
      icon: ICON_KEY[d.type] ?? 'wave',
    });
  }
  return groups;
}
```

- [ ] **Step 2: 删除 `NodeCard.tsx` 的本地类型定义**

在 `frontend/src/components/NodeCard.tsx` 删除第 7-17 行的 `AddableType`/`AddableGroup` 接口,并把第 5 行 import 改为:

```ts
import { NODE_REGISTRY, type AddableType, type AddableGroup } from '../lib/nodeRegistry';
```

(`AddableType`/`AddableGroup` 现从 `nodeRegistry` 来。`NodeCard` 的 Props 仍引用这两个类型,无需改 Props 签名。)

- [ ] **Step 3: `NodeChain.tsx` 改用 import 的 `buildAddableGroups`**

在 `frontend/src/components/NodeChain.tsx`:
- 第 5 行 import 改为:`import { NODE_REGISTRY, buildAddableGroups } from '../lib/nodeRegistry';`
- 删除第 21-41 行的本地 `buildAddableGroups` 函数。
- 第 45 行 `const addableGroups = useRef(buildAddableGroups()).current;` 不变(现在调用的是 import 来的版本)。
- 删除第 6 行 `import { NodeCard, type AddableType, type AddableGroup } from './NodeCard';` 中的类型 import(若 `NodeChain` 不再直接用这两个类型),保留 `import { NodeCard } from './NodeCard';`。

> 注:`NodeChain` 内若仅 `useRef(buildAddableGroups())` 用到分组,不再需要 `AddableGroup` 类型名,可安全删除类型 import。若 tsc 报错则保留。

- [ ] **Step 4: 追加分组测试**

在 `frontend/src/lib/nodeRegistry.test.ts` 的 `console.log` 之前追加:

```ts
  // buildAddableGroups 四段分组
  const { buildAddableGroups } = await import('./nodeRegistry');
  const groups = buildAddableGroups();
  assert(groups.length === 4, '应有 4 段分组');
  assert(groups[0].group === '输入源' && groups[0].items.length === 1, '输入源段');
  assert(groups[1].group === '算法' && groups[1].items.length === 1, '算法段');
  assert(groups[2].group === '滤波工具' && groups[2].items.length === 7, '滤波工具段应有 7 个');
  assert(groups[3].group === '输出' && groups[3].items.length === 1, '输出段');

  // 每项都有 icon/desc/role
  for (const g of groups) {
    for (const it of g.items) {
      assert(it.icon && it.desc && it.role, `${it.type} 缺字段`);
    }
  }
```

- [ ] **Step 5: 跑测试**

Run: `npx tsx src/lib/nodeRegistry.test.ts`
Expected: `nodeRegistry.test OK`

- [ ] **Step 6: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/nodeRegistry.ts frontend/src/components/NodeCard.tsx frontend/src/components/NodeChain.tsx frontend/src/lib/nodeRegistry.test.ts
git commit -m "feat(node): buildAddableGroups 迁入注册表并改四段分组"
```

---

### Task 3: 新建 `AddNodeMenu` 统一组件

**Files:**
- Create: `frontend/src/components/AddNodeMenu.tsx`
- Modify: `frontend/src/App.css`(新增 `.anm-*` 样式块,放在旧 `.nc-add-menu` 样式块附近)

**Interfaces:**
- Consumes: `buildAddableGroups()`、`AddableType`、`AddableGroup`(Task 2)。
- Produces: `AddNodeMenu` 组件,Props:
  ```ts
  interface AddNodeMenuProps {
    triggerRef: React.RefObject<HTMLElement>;  // 触发按钮,用于定位
    open: boolean;
    onClose: () => void;
    onPick: (type: string) => void;            // 选中节点类型
    align?: 'left' | 'right';                  // 相对触发按钮的对齐,默认 'left'
  }
  ```

- [ ] **Step 1: 写 `AddNodeMenu.tsx` 骨架(图标 + 渲染,先不接定位)**

新建 `frontend/src/components/AddNodeMenu.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildAddableGroups, type AddableType } from '../lib/nodeRegistry';

// ---- 内联 SVG 图标(24x24, stroke=currentColor, 1.5px) ----
const ICONS: Record<string, JSX.Element> = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {[7, 12, 17].map(cy => [7, 12, 17].map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill="currentColor" stroke="none" />))}
    </svg>
  ),
  axes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M6 18 V6 M6 18 H18" />
      <path d="M6 6 l-2.5 2.5 M6 6 l2.5 2.5 M6 6 l0 0" />
      <path d="M18 18 l-2.5 -2.5 M18 18 l-2.5 2.5" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 5 H19 V19 H14" />
      <path d="M5 12 H15" />
      <path d="M11 8 l4 4 -4 4" />
    </svg>
  ),
  'wave-cut': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3 14 q3 -5 6 0 t6 0 t6 0" />
      <path d="M4 20 L20 4" strokeDasharray="2 2" />
    </svg>
  ),
  wave: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3 12 q3 -5 6 0 t6 0 t6 0" />
    </svg>
  ),
  ransac: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M4 18 L20 6" />
      {[{x:7,y:9},{x:11,y:13},{x:14,y:7},{x:17,y:15}].map(p => <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={1.1} fill="currentColor" stroke="none" />)}
    </svg>
  ),
};

const ROLE_COLOR: Record<string, string> = {
  source: 'var(--data)',
  algorithm: 'var(--arc)',
  tool: 'var(--ink-dim)',
  sink: 'var(--arc)',
};

interface Props {
  triggerRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  onPick: (type: string) => void;
  align?: 'left' | 'right';
}

export function AddNodeMenu({ triggerRef, open, onClose, onPick, align = 'left' }: Props) {
  const groups = useRef(buildAddableGroups()).current;
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 定位:锚定触发按钮下沿,超出视口下沿则向上翻转。
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const compute = () => {
      const btn = triggerRef.current!;
      const br = btn.getBoundingClientRect();
      const W = 340;
      const left = align === 'right' ? br.right - W : br.left;
      const downTop = br.bottom + 6;
      const menuH = 420; // 估算上限;实际由内容撑开,翻转判断用保守值
      const flip = downTop + menuH > window.innerHeight;
      setPos({
        left: Math.max(8, Math.min(left, window.innerWidth - W - 8)),
        top: flip ? Math.max(8, br.top - 6 - menuH) : downTop,
      });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, align, triggerRef]);

  // outside-click / Escape 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      className="anm-menu"
      ref={menuRef}
      role="menu"
      aria-label="选择要插入的节点类型"
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: 340 }}
    >
      {groups.map(g => (
        <section key={g.group} className="anm-group">
          <h3 className="anm-group-label">{g.group}</h3>
          {g.items.map((t: AddableType, i) => (
            <button
              key={t.type}
              role="menuitem"
              className="anm-item"
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => { onPick(t.type); onClose(); }}
            >
              <span className="anm-icon">{ICONS[t.icon] ?? ICONS.wave}</span>
              <span className="anm-text">
                <span className="anm-name">{t.label}</span>
                <span className="anm-desc">{t.desc}</span>
              </span>
              <span className="anm-role" style={{ background: ROLE_COLOR[t.role] }} aria-hidden="true" />
            </button>
          ))}
        </section>
      ))}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: 在 `App.css` 加 `.anm-*` 样式**

在 `frontend/src/App.css` 的 `.nc-add-menu` 样式块**之后**(`.node-tail` 之前)加:

```css
/* --- 重建:添加节点菜单 (AddNodeMenu) --- */
.anm-menu {
  z-index: 1000;
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(34, 211, 238, 0.06);
  padding: 6px;
  max-height: 70vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.anm-group { display: flex; flex-direction: column; gap: 1px; }
.anm-group:not(:first-child) { border-top: 1px solid var(--line-soft); margin-top: 4px; padding-top: 4px; }
.anm-group-label {
  margin: 2px 6px 4px;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 600;
}
.anm-item {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr 8px;
  align-items: center;
  gap: 10px;
  padding: 7px 10px 7px 12px;
  font-family: var(--sans);
  color: var(--ink);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  text-align: left;
  min-height: 44px;
  opacity: 0;
  animation: anm-item-in 120ms ease-out forwards;
}
.anm-item::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: var(--arc);
  transform: scaleY(0);
  transform-origin: top;
  transition: transform 120ms ease-out;
}
.anm-item:hover, .anm-item:focus-visible {
  background: var(--bg-inset);
  border-color: var(--line);
  outline: none;
}
.anm-item:hover::before, .anm-item:focus-visible::before { transform: scaleY(1); }
.anm-item:focus-visible { box-shadow: inset 0 0 0 2px var(--arc); }
.anm-icon { width: 24px; height: 24px; color: var(--ink-dim); display: flex; align-items: center; justify-content: center; }
.anm-icon svg { width: 100%; height: 100%; }
.anm-item:hover .anm-icon, .anm-item:focus-visible .anm-icon { color: var(--arc); }
.anm-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.anm-name { font-size: 13px; font-weight: 500; line-height: 1.2; }
.anm-desc {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-faint);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.anm-role { width: 6px; height: 6px; border-radius: 50%; justify-self: end; }
@keyframes anm-item-in {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .anm-item { animation: none; opacity: 1; }
  .anm-item::before { transition: none; }
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。(`AddNodeMenu` 此时尚未被引用,但应能独立编译。)

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/AddNodeMenu.tsx frontend/src/App.css
git commit -m "feat(ui): 新建 AddNodeMenu 统一添加节点 popover 组件"
```

---

### Task 4: `NodeCard` 节点头入口接入 `AddNodeMenu`

**Files:**
- Modify: `frontend/src/components/NodeCard.tsx:84-210`(替换 `addMenuOpen` 定位逻辑为 `AddNodeMenu`)

**Interfaces:**
- Consumes: `AddNodeMenu`(Task 3)。
- 保留 `onAddAfter(type)` 回调语义不变。

- [ ] **Step 1: 删除 `NodeCard` 自有定位逻辑,接入 `AddNodeMenu`**

在 `frontend/src/components/NodeCard.tsx`:

1. 顶部 import 加:`import { AddNodeMenu } from './AddNodeMenu';`
2. 删除 `addMenuRef`、`addMenuPos` state 与第 103-153 行的两个 `useEffect`(定位 + outside-click)。
3. 保留 `const [addMenuOpen, setAddMenuOpen] = useState(false);` 与 `addBtnRef`。
4. 把第 174-210 行的 `createPortal(...)` 整块替换为:

```tsx
          <AddNodeMenu
            triggerRef={addBtnRef}
            open={addMenuOpen}
            onClose={() => setAddMenuOpen(false)}
            onPick={type => onAddAfter(type)}
            align="right"
          />
```

5. 触发按钮(第 164-172 行)的 `onClick`、`is-open` class 逻辑不变。

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。

- [ ] **Step 3: 手动验证**

Run: `npm run dev`,浏览器打开,添加几个节点后点节点头的 `+`。
Expected: popover 从 `+` 按钮下沿向下展开,右对齐;四段分组;每项有图标/名字/描述/角色色点;hover 出现琥珀指示条;点击项后节点插入到该节点之后;outside-click/Escape 关闭。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/NodeCard.tsx
git commit -m "feat(ui): NodeCard 节点头 + 入口接入 AddNodeMenu"
```

---

### Task 5: `NodeChain` 链尾入口接入 `AddNodeMenu` 并清理旧样式

**Files:**
- Modify: `frontend/src/components/NodeChain.tsx:43-169`(替换 `tailOpen` 定位逻辑为 `AddNodeMenu`)
- Modify: `frontend/src/App.css`(删除已废弃的旧 `.nc-add-menu`/`.nc-add-item`/`.nc-add-cat`/`.nc-add-label`/`.nc-add-short`/`.nc-add-empty`/`.add-group`/`.add-group-label`/`.node-tail-menu` 样式)

**Interfaces:**
- Consumes: `AddNodeMenu`(Task 3)。
- 保留 `onAddNode(type)`(链尾=追加末尾)回调语义不变。

- [ ] **Step 1: 删除 `NodeChain` 自有定位逻辑,接入 `AddNodeMenu`**

在 `frontend/src/components/NodeChain.tsx`:

1. 顶部 import 加:`import { AddNodeMenu } from './AddNodeMenu';`
2. 删除 `tailRef`、`tailPos` state 与第 54-97 行的两个 `useEffect`(定位 + outside-click)。
3. 保留 `const [tailOpen, setTailOpen] = useState(false);` 与 `tailBtnRef`。
4. 把第 133-165 行的 `createPortal(...)` 整块替换为:

```tsx
        <AddNodeMenu
          triggerRef={tailBtnRef}
          open={tailOpen}
          onClose={() => setTailOpen(false)}
          onPick={type => props.onAddNode(type)}
          align="left"
        />
```

5. 链尾按钮(第 122-132 行)的 `onClick`、`is-open` class 逻辑不变。

- [ ] **Step 2: 删除 `App.css` 中废弃的旧添加菜单样式**

在 `frontend/src/App.css` 删除以下规则块(它们不再有元素引用):
- `.nc-add-menu` 及其 `@keyframes nc-add-menu-in` 与对应 `@media (prefers-reduced-motion)`(第 1104-1129 行附近)
- `.nc-add-item`、`.nc-add-item:hover`、`.nc-add-item:focus-visible`、`.nc-add-cat`、`.nc-add-label`、`.nc-add-short`、`.nc-add-empty`(第 1130-1176 行附近)
- `.node-tail-menu`(第 1194 行)
- `.add-group`、`.add-group-label`(第 1205-1206 行)

**保留**:`.nc-add-toggle`(节点头 `+` 按钮仍在用)、`.node-tail` / `.node-tail-btn` 及其 hover/is-open(链尾按钮仍在用)。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc -b && npm run build`
Expected: 构建成功,无错误。

- [ ] **Step 4: 全量测试**

Run: `npx tsx src/lib/nodeRegistry.test.ts && npx tsx src/api/node.test.ts`
Expected: 两个测试都 OK。

- [ ] **Step 5: 手动验证(链尾入口)**

Run: `npm run dev`:
- 空流水线时链尾 `+` 打开 popover,左对齐,向下展开。
- 有节点时链尾 `+` 追加到末尾。
- 接近视口下沿时自动向上翻转,不溢出。
- 两个入口(链尾 / 节点头)视觉一致,都用四段分组。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/NodeChain.tsx frontend/src/App.css
git commit -m "feat(ui): NodeChain 链尾入口接入 AddNodeMenu,清理废弃样式"
```

---

## 自审

- **Spec 覆盖**:图标体系(Task 1 数据 + Task 3 SVG)、角色色点(Task 3 `ROLE_COLOR`)、四段分组(Task 2)、单项卡片布局与指示条与 stagger(Task 3 CSS)、键盘 focus-visible(Task 3 CSS)、两个入口统一(Task 4/5)、锚定定位 + 翻转(Task 3 `useLayoutEffect`)、数据流单一源(Task 1/2)——均覆盖。搜索为非目标,不加任务。
- **占位符扫描**:无 TBD/TODO;CSS 行号为当前快照,实现时以实际为准(已在步骤中说明「附近」)。
- **类型一致**:`AddNodeMenu` Props 在 Task 3 定义、Task 4/5 消费,签名一致(`triggerRef`/`open`/`onClose`/`onPick`/`align`);`AddableType.icon` 在 Task 2 产出、Task 3 `ICONS[t.icon]` 消费,key 集合一致(`grid`/`axes`/`export`/`wave-cut`/`wave`/`ransac`)。
