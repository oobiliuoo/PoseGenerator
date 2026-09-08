import assert from 'node:assert';
import { toSerializeReq, fromDeserializeResp } from './pipelineCodec';
import { defaultParamsFor } from './nodeRegistry';
import type { Pipeline, PipelineNode } from '../types';

async function run() {
  // 造链:csv -> distance(参数用库不同 key) -> bspline -> ransac -> segmentor -> pose -> export
  const nodes: PipelineNode[] = [
    { id: 'a', type: 'csv_input', params: {} },
    { id: 'b', type: 'filter_distance', params: { min_th: 2.5, max_th: 40 } },
    { id: 'c', type: 'filter_bspline', params: { uniform: 0, step: 2, Tol3D: 4, degMin: 3, continuity: 2 } },
    { id: 'd', type: 'filter_ransac_line', params: { inlierThreshold: 1, maxIterations: 100, minInlierRatio: 0.7, enableProjection: 1 } },
    { id: 's', type: 'filter_path_segmentor', params: { output_segment: -1 } },
    { id: 'e', type: 'pose_generate', params: { ...defaultParamsFor('pose_generate'), curvature_threshold: 0.1, init_rx: 15 } },
    { id: 'f', type: 'pathview_export', params: {} },
  ];
  const pipeline: Pipeline = { name: 't', nodes };

  // serialize 请求组装:只含库链 filter,pose 剔除 init_*
  const req = toSerializeReq(pipeline);
  assert(req.nodes.length === 3, '3 lib-chain filters in request');
  assert(req.nodes[0].type === 'filter_distance' && req.nodes[0].params.min_th === 2.5, 'front-end keys as-is');
  assert(!req.nodes.some(n => n.type === 'filter_path_segmentor'), 'segmentor not in lib chain');
  assert(req.pose.curvature_threshold === 0.1, 'pose param included');
  assert(!('init_rx' in req.pose), 'init_rx excluded from pose');

  // 屏蔽节点不导出
  const disabled: PipelineNode[] = [{ id: 'x', type: 'filter_mean', params: { radius: 5 }, enabled: false }];
  assert(toSerializeReq({ name: 't', nodes: disabled }).nodes.length === 0, 'disabled node skipped');

  // 库回显 -> 节点链:bool 还原 0/1、key 映射、未知 filter 跳过、缺省参数补默认
  const resp = {
    filters: [
      { name: 'DistanceFilter', config: { minDistanceThreshold: 2.5, maxDistanceThreshold: 40 } },
      { name: 'BogusFilter', config: {} },
      { name: 'BSplineFilter', config: { uniform: true, step: 3, tol3d: 4, deg_min: 3, continuity: 1 } },
    ],
    pose: { curvature_threshold: 0.1 },
  };
  const back = fromDeserializeResp(resp);
  assert(back[0].type === 'csv_input', 'csv_input prepended');
  assert(back[back.length - 1].type === 'pathview_export', 'pathview_export appended');
  const dist = back.find(n => n.type === 'filter_distance')!;
  assert(dist.params.min_th === 2.5 && dist.params.max_th === 40, 'minDistanceThreshold -> min_th');
  const bs = back.find(n => n.type === 'filter_bspline')!;
  assert(bs.params.uniform === 1 && bs.params.step === 3 && bs.params.Tol3D === 4, 'bool true -> 1, tol3d -> Tol3D');
  assert(!back.some(n => n.type === 'bogusfilter' || n.type === 'BogusFilter'), 'unknown filter skipped');
  const pose = back.find(n => n.type === 'pose_generate')!;
  assert(pose.params.curvature_threshold === 0.1, 'pose roundtrip');
  assert(pose.params.tangent_smooth_window === 5, 'missing pose param falls back to default');

  // 空/坏文件容错:filters 缺失 -> 只有 csv+pose+export
  const minimal = fromDeserializeResp({ pose: { curvature_threshold: 0.2 } });
  assert(minimal.length === 3, 'minimal resp -> 3 nodes');
  assert(minimal.find(n => n.type === 'pose_generate')!.params.curvature_threshold === 0.2, 'pose from minimal');

  console.log('pipelineCodec.test OK');
}
run();
