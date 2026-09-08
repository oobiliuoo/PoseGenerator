// 前端节点链 <-> mws::MWS_PathFilterAndPoseGenerator 序列化互导。
// 序列化/反序列化直接调后端 /pipeline/serialize|deserialize,内部走库
// CascadeRbtPathFilter + CorrugatedWeldPoseGenerator 的 toJson/analysisJson——
// 格式与生产完全一致(bool 字段、key 命名、默认值补全都由库负责)。
// 本文件只做:请求组装(前端 key)与响应映射(库 config -> 前端 params)。
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

// 前端参数 key -> 库 config key(仅列不同的;同名省略)。decode 映射用。
const PARAM_KEY_MAP: Record<string, Record<string, string>> = {
  filter_distance: { min_th: 'minDistanceThreshold', max_th: 'maxDistanceThreshold' },
  filter_bspline: { Tol3D: 'tol3d', degMin: 'deg_min' },
};
const PARAM_KEY_REV: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(PARAM_KEY_MAP).map(([t, m]) => [t, Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]))]),
);

// 库 pose Params 8 字段(与 CorrugatedWeldPoseGenerator::Params 一致)。
// 前端 pose_generate 节点额外有 init_* 参数,不进序列化文件。
const POSE_KEYS = [
  'curvature_threshold', 'smooth_half_width', 'tangent_smooth_window',
  'min_corner_region_length', 'output_mode', 'max_pose_change_angle',
  'all_curve_threshold', 'keypoint_pose_angle_threshold',
];

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `${url} failed: ${res.status}`);
  }
  return res.json();
}

/** 组装 /pipeline/serialize 请求体:跳过屏蔽节点;csv/pathview/segmentor 不进库链;pose 剔除 init_*。 */
export function toSerializeReq(pipeline: Pipeline): { nodes: { type: string; params: Record<string, number> }[]; pose: Record<string, number> } {
  const nodes: { type: string; params: Record<string, number> }[] = [];
  let pose: Record<string, number> = {};
  for (const n of pipeline.nodes) {
    if (n.enabled === false) continue;
    if (n.type.startsWith('filter_') && n.type !== 'filter_path_segmentor') {
      nodes.push({ type: n.type, params: { ...n.params } });
    } else if (n.type === 'pose_generate') {
      for (const k of POSE_KEYS) {
        if (k in n.params) pose[k] = n.params[k];
      }
    }
  }
  return { nodes, pose };
}

/** 库回显({filters:[{name,config}], pose}) -> 完整节点链(csv 开头 + filters + pose + pathview 结尾)。 */
export function fromDeserializeResp(resp: Record<string, any>): PipelineNode[] {
  const nodes: PipelineNode[] = [];
  const mk = (type: string, params?: Record<string, number>): PipelineNode => ({
    id: `${type}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    params: params ?? defaultParamsFor(type),
  });
  nodes.push(mk('csv_input'));
  const filterArr = resp?.filters;
  if (Array.isArray(filterArr)) {
    for (const f of filterArr) {
      const type = NAME_TO_TYPE[f?.name];
      if (!type) continue;  // 未知 filter 跳过(库 analysisJson 也跳)
      const map = PARAM_KEY_REV[type] ?? {};
      const params: Record<string, number> = defaultParamsFor(type);
      for (const [libKey, v] of Object.entries(f?.config ?? {})) {
        const key = map[libKey] ?? libKey;
        if (typeof v === 'number') params[key] = v;
        else if (typeof v === 'boolean') params[key] = v ? 1 : 0;  // 库 bool 字段还原 0/1
      }
      nodes.push(mk(type, params));
    }
  }
  const poseParams = { ...defaultParamsFor('pose_generate') };
  if (resp?.pose && typeof resp.pose === 'object') {
    for (const [k, v] of Object.entries(resp.pose)) {
      if (typeof v === 'number' && k in poseParams) poseParams[k] = v;
    }
  }
  nodes.push(mk('pose_generate', poseParams));
  nodes.push(mk('pathview_export'));
  return nodes;
}

/** 导出:调后端走库 toJson,返回权威序列化对象(直接落文件)。 */
export async function encodePipeline(pipeline: Pipeline): Promise<Record<string, unknown>> {
  return postJson('/pipeline/serialize', toSerializeReq(pipeline));
}

/** 导入:原文发后端走库 analysisJson 解析,再映射回前端节点链。 */
export async function decodePipeline(json: Record<string, any>): Promise<PipelineNode[]> {
  const resp = await postJson('/pipeline/deserialize', json);
  return fromDeserializeResp(resp);
}

/** 下载序列化文件(文件名按当前流水线名)。 */
export async function downloadPipelineJson(pipeline: Pipeline): Promise<void> {
  const obj = await encodePipeline(pipeline);
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
