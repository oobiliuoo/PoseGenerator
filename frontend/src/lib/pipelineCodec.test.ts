import assert from 'node:assert';
import { encodePipeline, decodePipeline } from './pipelineCodec';
import { defaultParamsFor } from './nodeRegistry';
import type { Pipeline, PipelineNode } from '../types';

async function run() {
  // 造链:csv -> distance(参数用库不同 key) -> bspline -> pose -> export
  const nodes: PipelineNode[] = [
    { id: 'a', type: 'csv_input', params: {} },
    { id: 'b', type: 'filter_distance', params: { min_th: 2.5, max_th: 40 } },
    { id: 'c', type: 'filter_bspline', params: { uniform: 0, step: 2, Tol3D: 4, degMin: 3, continuity: 2 } },
    { id: 'd', type: 'pose_generate', params: { ...defaultParamsFor('pose_generate'), curvature_threshold: 0.1, init_rx: 15 } },
    { id: 'e', type: 'pathview_export', params: {} },
  ];
  const pipeline: Pipeline = { name: 't', nodes };

  // 导出:库格式
  const json = encodePipeline(pipeline) as any;
  assert(json.pipeline.filters.length === 2, '2 filters exported');
  assert(json.pipeline.filters[0].name === 'DistanceFilter', 'lib filter name');
  assert(json.pipeline.filters[0].config.minDistanceThreshold === 2.5, 'key mapped min_th');
  assert(json.pipeline.filters[1].name === 'BSplineFilter', 'bspline exported');
  assert(json.pipeline.filters[1].config.tol3d === 4, 'Tol3D -> tol3d');
  assert(json.pipeline.filters[1].config.deg_min === 3, 'degMin -> deg_min');
  assert(json.pose.curvature_threshold === 0.1, 'pose param exported');
  assert(!('init_rx' in json.pose), 'init_rx not in pose json');

  // 导入:重建链
  const back = decodePipeline(json);
  assert(back[0].type === 'csv_input', 'csv_input prepended');
  assert(back[back.length - 1].type === 'pathview_export', 'pathview_export appended');
  const dist = back.find(n => n.type === 'filter_distance')!;
  assert(dist.params.min_th === 2.5, 'min_th roundtrip');
  const bs = back.find(n => n.type === 'filter_bspline')!;
  assert(bs.params.Tol3D === 4 && bs.params.uniform === 0, 'bspline params roundtrip');
  const pose = back.find(n => n.type === 'pose_generate')!;
  assert(pose.params.curvature_threshold === 0.1, 'pose roundtrip');
  assert(pose.params.tangent_smooth_window === 5, 'missing pose param falls back to default');

  // 空文件/坏文件:filters 缺失 -> 只有 csv+pose+export
  const minimal = decodePipeline({ pose: { curvature_threshold: 0.2 } });
  assert(minimal.length === 3, 'minimal file -> 3 nodes');
  assert(minimal.find(n => n.type === 'pose_generate')!.params.curvature_threshold === 0.2, 'pose from minimal');

  console.log('pipelineCodec.test OK');
}
run();
