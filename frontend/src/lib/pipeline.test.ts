import assert from 'node:assert';
import { runPipeline, getOutput } from './pipeline';
import { NODE_REGISTRY, makeNode } from './nodeRegistry';
import type { PipelineNode, ExecCtx } from '../types';

// mock executeNode: 记录调用,返回可识别的 frame。
async function run() {
  const calls: string[] = [];
  const ctx: ExecCtx = {
    executeNode: async (nodeType, input, _params) => {
      calls.push(nodeType);
      // 透传 input,加个标记 meta 证明算法节点跑过
      return { points: input.points, meta: { ...input.meta, via: 'backend' } };
    },
    csvFile: { name: 't.csv', text: 'x,y,z\n0,0,0\n10,0,0\n20,0,0' },
  };

  // 造一条 csv_input -> pose_generate 的链(2 节点)
  const csv = makeNode('csv_input');
  const pose = makeNode('pose_generate');
  const nodes: PipelineNode[] = [csv, pose];

  const outputs = await runPipeline(nodes, 0, ctx, {});
  // csv_input 是源,跑完应有 3 点
  const csvOut = getOutput(outputs, csv.id);
  assert(csvOut && csvOut.points.length === 3, 'csv_input produced 3 points');
  // pose_generate 跑过(调了 executeNode)
  assert(calls.includes('pose_generate'), 'pose_generate executed via backend');
  const poseOut = getOutput(outputs, pose.id);
  assert(poseOut && (poseOut.meta as any).via === 'backend', 'pose_generate output has backend marker');

  // 增量:只重算 csv_input(fromIndex=0),pose_generate 也得重算(它是下游)
  calls.length = 0;
  await runPipeline(nodes, 0, ctx, {});
  assert(calls.includes('pose_generate'), 'rerun from 0 re-executes downstream');

  console.log('pipeline.test OK');
}
run();