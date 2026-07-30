import type { NodeDef, PoseFrame, NodeParamSpec } from '../types';
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
];

// 把节点的扁平 params 转成后端期望的 {算法参数..., initial_pose:{rx,ry,rz}}
function packPoseGenParams(p: Record<string, number>): Record<string, any> {
  const { init_rx, init_ry, init_rz, ...algo } = p;
  return { ...algo, initial_pose: { rx: init_rx, ry: init_ry, rz: init_rz } };
}

export const NODE_REGISTRY: Record<string, NodeDef> = {
  csv_input: {
    type: 'csv_input',
    label: 'CSV 输入',
    category: 'io',
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
    isSource: false,
    isSink: true,
    params: [],
    async execute(input, _params, _ctx) {
      if (!input) return EMPTY_FRAME;
      // 输出 = 输入(导出不改数据,选中仍可看)。推送由显式按钮触发。
      return input;
    },
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