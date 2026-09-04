import type { NodeDef, PoseFrame, NodeParamSpec, NodeRole } from '../types';
import { EMPTY_FRAME, DEFAULT_PARAMS, DEFAULT_INITIAL_POSE } from '../types';
import { parseCsvPoints } from './csv';

// ---- pose_generate 参数 schema (8 算法参数 + 初始姿态,复用现有默认值) ----
const POSE_GEN_PARAMS: NodeParamSpec[] = [
  { key: 'curvature_threshold', label: 'curvature_threshold', type: 'number', min: 0, max: 0.5, step: 0.001, default: DEFAULT_PARAMS.curvature_threshold },
  { key: 'smooth_half_width', label: 'smooth_half_width', type: 'number', min: 0, max: 50, step: 1, default: DEFAULT_PARAMS.smooth_half_width },
  { key: 'tangent_smooth_window', label: 'tangent_smooth_window', type: 'number', min: 1, max: 51, step: 1, default: DEFAULT_PARAMS.tangent_smooth_window, forcedOdd: true },
  { key: 'min_corner_region_length', label: 'min_corner_region_length', type: 'number', min: 1, max: 50, step: 1, default: DEFAULT_PARAMS.min_corner_region_length },
  { key: 'output_mode', label: 'output_mode', type: 'select', default: 0, options: [{ value: 0, label: 'FULL' }, { value: 1, label: 'KEYPOINTS' }] },
  { key: 'max_pose_change_angle', label: 'max_pose_change_angle', type: 'number', min: 0, max: 180, step: 0.5, default: DEFAULT_PARAMS.max_pose_change_angle },
  { key: 'all_curve_threshold', label: 'all_curve_threshold', type: 'number', min: 0, max: 1, step: 0.01, default: DEFAULT_PARAMS.all_curve_threshold },
  { key: 'keypoint_pose_angle_threshold', label: 'keypoint_pose_angle_threshold', type: 'number', min: 0, max: 90, step: 0.5, default: DEFAULT_PARAMS.keypoint_pose_angle_threshold, disabledWhen: p => p.output_mode !== 1, disabledHint: '仅 KEYPOINTS 模式' },
  // 初始姿态作为 pose_generate 的参数(rx/ry/rz),用 number 类型存度数。
  { key: 'init_rx', label: 'init_rx', type: 'number', min: -180, max: 180, step: 0.5, default: DEFAULT_INITIAL_POSE.rx },
  { key: 'init_ry', label: 'init_ry', type: 'number', min: -180, max: 180, step: 0.5, default: DEFAULT_INITIAL_POSE.ry },
  { key: 'init_rz', label: 'init_rz', type: 'number', min: -180, max: 180, step: 0.5, default: DEFAULT_INITIAL_POSE.rz },
  // 初始切线方向 tx/ty/tz(可选,全 0=起点切线方向=初始姿态切线方向,不做对齐旋转)
  { key: 'init_tx', label: 'init_tx', type: 'number', min: -1000, max: 1000, step: 1, default: 0 },
  { key: 'init_ty', label: 'init_ty', type: 'number', min: -1000, max: 1000, step: 1, default: 0 },
  { key: 'init_tz', label: 'init_tz', type: 'number', min: -1000, max: 1000, step: 1, default: 0 },
];

// 把节点的扁平 params 转成后端期望的 {算法参数..., initial_pose:{rx,ry,rz}, initial_tangent:{tx,ty,tz}}
function packPoseGenParams(p: Record<string, number>): Record<string, any> {
  const { init_rx, init_ry, init_rz, init_tx, init_ty, init_tz, ...algo } = p;
  return { ...algo, initial_pose: { rx: init_rx, ry: init_ry, rz: init_rz }, initial_tangent: { tx: init_tx, ty: init_ty, tz: init_tz } };
}

export const NODE_REGISTRY: Record<string, NodeDef> = {
  csv_input: {
    type: 'csv_input',
    label: 'CSV 输入',
    category: 'io',
    role: 'source',
    desc: '从 CSV 文件读入轨迹点',
    isSource: true,
    isSink: false,
    params: [],   // 文件不进 params schema
    async execute(_input, _params, ctx) {
      if (!ctx.csvFile) {
        return { ...EMPTY_FRAME, meta: { error: '未选择文件' } };
      }
      const res = parseCsvPoints(ctx.csvFile.text);
      if (res.error) {
        return { points: [], meta: { error: res.error, ignored: res.ignored } };
      }
      const points = res.points.map((p, i) => {
        const r = res.rotations?.[i];
        return r ? { ...p, ...r } : { ...p, rx: 0, ry: 0, rz: 0 };
      });
      return { points, meta: { fileName: ctx.csvFile.name, hasRotation: !!res.rotations, ignored: res.ignored } };
    },
  },

  pose_generate: {
    type: 'pose_generate',
    label: '姿态生成',
    category: 'algorithm',
    role: 'algorithm',
    desc: '由曲率生成焊枪姿态',
    isSource: false,
    isSink: false,
    params: POSE_GEN_PARAMS,
    async execute(input, params, ctx) {
      if (!input || input.points.length < 3) {
        // 点数不足,原样透传(后端也会透传,但前端短路省一次请求)
        return input ?? EMPTY_FRAME;
      }
      // 注意:这里不自动用首点姿态覆盖——首点姿态是否"真实"无法可靠判断
      // (csv_input 给无姿态点填了 0)。初始姿态由用户在节点参数里设。
      return ctx.executeNode('pose_generate', input, packPoseGenParams(params));
    },
    visualizableMeta: [],   // 不改 nexus,无算法中间产物
  },

  pathview_export: {
    type: 'pathview_export',
    label: 'pathview 导出',
    category: 'io',
    role: 'sink',
    desc: '推送结果到 pathview',
    isSource: false,
    isSink: true,
    params: [],
    async execute(input, _params, _ctx) {
      if (!input) return EMPTY_FRAME;
      // 输出 = 输入(导出不改数据,选中仍可看)。推送由显式按钮触发。
      return input;
    },
  },

  filter_distance: {
    type: 'filter_distance',
    label: '距离滤波',
    category: 'tool',
    role: 'tool',
    desc: '按点间距剔除离群点',
    isSource: false, isSink: false,
    params: [
      { key: 'min_th', label: 'min_th', type: 'number', min: 0, max: 50, step: 0.1, default: 1.0 },
      { key: 'max_th', label: 'max_th', type: 'number', min: 0, max: 500, step: 1, default: 30.0 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_distance', input, params);
    },
    visualizableMeta: [],
  },
  filter_angle: {
    type: 'filter_angle',
    label: '角度滤波',
    category: 'tool',
    role: 'tool',
    desc: '按方向角变化剔除抖动',
    isSource: false, isSink: false,
    params: [
      { key: 'angleThreshold', label: 'angleThreshold', type: 'number', min: 0, max: 90, step: 1, default: 30.0 },
      { key: 'directionWindowSize', label: 'directionWindowSize', type: 'number', min: 2, max: 50, step: 1, default: 5 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_angle', input, params);
    },
    visualizableMeta: [],
  },
  filter_mean: {
    type: 'filter_mean',
    label: '均值平滑',
    category: 'tool',
    role: 'tool',
    desc: '邻域均值平滑轨迹',
    isSource: false, isSink: false,
    params: [
      { key: 'radius', label: 'radius', type: 'number', min: 0.1, max: 100, step: 0.1, default: 5.0 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_mean', input, params);
    },
    visualizableMeta: [],
  },
  filter_gaussian: {
    type: 'filter_gaussian',
    label: '高斯平滑',
    category: 'tool',
    role: 'tool',
    desc: '高斯核平滑轨迹',
    isSource: false, isSink: false,
    params: [
      { key: 'sigma', label: 'sigma', type: 'number', min: 0.1, max: 10, step: 0.1, default: 1.0 },
      { key: 'kernelSize', label: 'kernelSize', type: 'number', min: 1, max: 51, step: 2, default: 9, forcedOdd: true },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_gaussian', input, params);
    },
    visualizableMeta: [],
  },
  filter_savgol: {
    type: 'filter_savgol',
    label: 'Savitzky-Golay 平滑',
    category: 'tool',
    role: 'tool',
    desc: 'Savitzky-Golay 多项式平滑',
    isSource: false, isSink: false,
    params: [
      { key: 'halfWindow', label: 'halfWindow', type: 'number', min: 1, max: 50, step: 1, default: 5 },
      { key: 'degree', label: 'degree', type: 'number', min: 1, max: 10, step: 1, default: 3 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_savgol', input, params);
    },
    visualizableMeta: [],
  },
  filter_stat_outlier: {
    type: 'filter_stat_outlier',
    label: '统计离群剔除',
    category: 'tool',
    role: 'tool',
    desc: '统计离群点剔除',
    isSource: false, isSink: false,
    params: [
      { key: 'threshold', label: 'threshold', type: 'number', min: 0, max: 5, step: 0.1, default: 0.5 },
      { key: 'k', label: 'k', type: 'number', min: 1, max: 50, step: 1, default: 5 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_stat_outlier', input, params);
    },
    visualizableMeta: [],
  },
  filter_ransac_line: {
    type: 'filter_ransac_line',
    label: 'RANSAC 直线',
    category: 'tool',
    role: 'tool',
    desc: 'RANSAC 直线拟合(结果有随机性)',
    isSource: false, isSink: false,
    params: [
      { key: 'inlierThreshold', label: 'inlierThreshold', type: 'number', min: 0, max: 50, step: 0.1, default: 1.0 },
      { key: 'maxIterations', label: 'maxIterations', type: 'number', min: 1, max: 1000, step: 1, default: 100 },
      { key: 'minInlierRatio', label: 'minInlierRatio', type: 'number', min: 0, max: 1, step: 0.05, default: 0.7 },
      { key: 'enableProjection', label: 'enableProjection', type: 'select', default: 0, options: [{ value: 0, label: '关' }, { value: 1, label: '开' }] },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_ransac_line', input, params);
    },
    visualizableMeta: [],
  },
  filter_bspline: {
    type: 'filter_bspline',
    label: 'B样条重建',
    category: 'tool',
    role: 'tool',
    desc: 'B样条拟合重建:均匀重采样或逐点投影',
    isSource: false, isSink: false,
    params: [
      { key: 'uniform', label: 'uniform', type: 'select', default: 1, options: [{ value: 1, label: '均匀重采样' }, { value: 0, label: '逐点投影' }] },
      { key: 'step', label: 'step', type: 'number', min: 0.1, max: 100, step: 0.1, default: 1.0 },
      { key: 'Tol3D', label: 'Tol3D', type: 'number', min: 0.1, max: 20, step: 0.1, default: 3.0 },
      { key: 'degMin', label: 'degMin', type: 'number', min: 1, max: 8, step: 1, default: 3 },
      { key: 'continuity', label: 'continuity', type: 'number', min: 0, max: 2, step: 1, default: 1 },
    ],
    async execute(input, params, ctx) {
      if (!input) return EMPTY_FRAME;
      return ctx.executeNode('filter_bspline', input, params);
    },
    visualizableMeta: [],
  },
  slice: {
    type: 'slice',
    label: '数据截取',
    category: 'tool',
    role: 'tool',
    desc: '按起始位置与长度截取路径片段',
    isSource: false, isSink: false,
    params: [
      { key: 'start', label: 'start', type: 'number', min: 0, max: 100000, step: 1, default: 0 },
      { key: 'length', label: 'length', type: 'number', min: 0, max: 100000, step: 1, default: 100 },
    ],
    async execute(input, params, _ctx) {
      if (!input) return EMPTY_FRAME;
      const n = input.points.length;
      const reqStart = Math.max(0, Math.floor(params.start ?? 0));
      const reqLength = Math.max(0, Math.floor(params.length ?? 0));
      // 钳制到有效范围:start ∈ [0, n],length ∈ [0, n - start]
      const start = Math.min(reqStart, n);
      const length = Math.min(reqLength, n - start);
      const sliced = input.points.slice(start, start + length);
      const meta: Record<string, unknown> = {
        ...input.meta,
        sliced: { start, length, total: n, out: sliced.length },
      };
      // 参数超出总点数 → 提示实际生效范围(非报错,结果仍有效)
      if (reqStart > n || reqLength > n - start) {
        meta.note = `已截取 [${start}, ${start + length}) / 共 ${n} 点`;
      }
      return { points: sliced, meta };
    },
    visualizableMeta: [],
  },
};

/** 从 NodeDef.params 生成默认 params 对象。 */
export function defaultParamsFor(type: string): Record<string, number> {
  const def = NODE_REGISTRY[type];
  if (!def) return {};
  const out: Record<string, number> = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}

/** 新建一个节点实例(带唯一 id)。 */
export function makeNode(type: string): { id: string; type: string; params: Record<string, number> } {
  // 简单 id:类型+随机后缀。
  const id = `${type}_${Math.random().toString(36).slice(2, 6)}`;
  return { id, type, params: defaultParamsFor(type) };
}

// ---- 添加菜单数据模型 ----

export interface AddableType {
  type: string;
  label: string;
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
  slice: 'wave-cut',
};

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
      category: d.category,
      desc: d.desc ?? '',
      role,
      icon: ICON_KEY[d.type] ?? 'wave',
    });
  }
  return groups;
}
