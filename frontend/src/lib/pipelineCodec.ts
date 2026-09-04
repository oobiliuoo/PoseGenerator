// 前端节点链 <-> mws::MWS_PathFilterAndPoseGenerator 序列化文件互转。
// 库格式(JsonFileInterface): {"pipeline":{filters:[{name,config},...]}, "pose":{8参数}}
// 只覆盖库支持的 8 个 filter + pose 参数;csv_input/pathview_export/slice 等
// 前端节点不进序列化文件;导入时自动补 csv_input 开头、pathview_export 结尾。
import type { Pipeline, PipelineNode } from '../types';
import { defaultParamsFor } from './nodeRegistry';

// 库 filter name -> 前端 node_type
const NAME_TO_TYPE: Record<string, string> = {
  DistanceFilter: 'filter_distance',
  AngleFilter: 'filter_angle',
  MeanSmoothingFilter: 'filter_mean',
  GaussianSmoothingFilter: 'filter_gaussian',
  SavitzkyGolayFilter: 'filter_savgol',
  StatisticalOutlierFilter: 'filter_stat_outlier',
  RansacLineFilter: 'filter_ransac_line',
  BSplineFilter: 'filter_bspline',
};
const TYPE_TO_NAME = Object.fromEntries(Object.entries(NAME_TO_TYPE).map(([k, v]) => [v, k]));

// 前端参数 key -> 库 config key(仅列不同的;同名省略)
const PARAM_KEY_MAP: Record<string, Record<string, string>> = {
  filter_distance: { min_th: 'minDistanceThreshold', max_th: 'maxDistanceThreshold' },
  filter_bspline: { Tol3D: 'tol3d', degMin: 'deg_min' },
};
// 反转供导入用
const PARAM_KEY_REV: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(PARAM_KEY_MAP).map(([t, m]) => [t, Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]))]),
);

// 库 pose Params 默认值(与 CorrugatedWeldPoseGenerator::Params 一致)
const POSE_DEFAULTS: Record<string, number> = {
  curvature_threshold: 0.07,
  smooth_half_width: 2,
  tangent_smooth_window: 5,
  min_corner_region_length: 2,
  output_mode: 0,
  max_pose_change_angle: 45.0,
  all_curve_threshold: 0.8,
  keypoint_pose_angle_threshold: 5.0,
};

/** 导出:节点链 -> 序列化 JSON 对象。屏蔽节点跳过;无 pose 节点用库默认值。 */
export function encodePipeline(pipeline: Pipeline): Record<string, unknown> {
  const filters: unknown[] = [];
  let pose: Record<string, number> = { ...POSE_DEFAULTS };
  for (const n of pipeline.nodes) {
    if (n.enabled === false) continue;  // 屏蔽节点不导出
    if (TYPE_TO_NAME[n.type]) {
      const map = PARAM_KEY_MAP[n.type] ?? {};
      const config: Record<string, number> = {};
      const def = n.params;
      for (const [k, v] of Object.entries(def)) {
        config[map[k] ?? k] = v;
      }
      filters.push({ name: TYPE_TO_NAME[n.type], config });
    } else if (n.type === 'pose_generate') {
      pose = { ...pose, ...n.params };  // init_rx 等额外字段会混进来,剔除:
      for (const k of Object.keys(pose)) {
        if (!(k in POSE_DEFAULTS)) delete pose[k];
      }
    }
    // csv_input / pathview_export / slice 等不导出
  }
  return { pipeline: { filters }, pose };
}

/** 导入:序列化 JSON -> 完整节点链(csv_input 开头 + filters + pose_generate + pathview_export 结尾)。 */
export function decodePipeline(json: Record<string, any>): PipelineNode[] {
  const nodes: PipelineNode[] = [];
  const mk = (type: string, params?: Record<string, number>): PipelineNode => {
    const base = { id: `${type}_${Math.random().toString(36).slice(2, 6)}`, type, params: params ?? defaultParamsFor(type) };
    return base;
  };
  nodes.push(mk('csv_input'));
  const filterArr = json?.pipeline?.filters;
  if (Array.isArray(filterArr)) {
    for (const f of filterArr) {
      const type = NAME_TO_TYPE[f?.name];
      if (!type) continue;  // 未知 filter 跳过
      const map = PARAM_KEY_REV[type] ?? {};
      const params: Record<string, number> = defaultParamsFor(type);
      for (const [libKey, v] of Object.entries(f?.config ?? {})) {
        if (typeof v === 'number') params[map[libKey] ?? libKey] = v;
      }
      nodes.push(mk(type, params));
    }
  }
  const poseParams = { ...defaultParamsFor('pose_generate') };
  if (json?.pose && typeof json.pose === 'object') {
    for (const [k, v] of Object.entries(json.pose)) {
      if (typeof v === 'number' && k in poseParams) poseParams[k] = v;
    }
  }
  nodes.push(mk('pose_generate', poseParams));
  nodes.push(mk('pathview_export'));
  return nodes;
}

/** 下载序列化文件(文件名按当前流水线名)。 */
export function downloadPipelineJson(pipeline: Pipeline): void {
  const obj = encodePipeline(pipeline);
  const safe = (pipeline.name || 'pipeline').replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 读序列化文件文本。 */
export function readPipelineJson(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
