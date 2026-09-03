import type { PipelineNode, PoseFrame, ExecCtx } from '../types';
import { EMPTY_FRAME } from '../types';
import { NODE_REGISTRY } from './nodeRegistry';

export type NodeOutput = PoseFrame | { error: string };

/**
 * 从 fromIndex 跑到 nodes 末尾,依次执行节点,更新并返回 outputs。
 * - 上游输出作为下游输入(源节点 input=null)。
 * - 任一节点抛错或返回 error,该节点 outputs 记 error,下游以 EMPTY_FRAME 继续。
 * - 不会跑 fromIndex 之前的节点(增量重算:上游不动)。
 */
export async function runPipeline(
  nodes: PipelineNode[],
  fromIndex: number,
  ctx: ExecCtx,
  outputs: Record<string, NodeOutput>,
): Promise<Record<string, NodeOutput>> {
  const out = { ...outputs };
  let input: PoseFrame | null = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (i < fromIndex) {
      // 上游:从已有 outputs 取输入(若该上游是源则 input 保持 null)
      input = getOutput(out, node.id);
      continue;
    }
    const def = NODE_REGISTRY[node.type];
    if (!def) {
      out[node.id] = { error: `未知节点类型: ${node.type}` };
      input = EMPTY_FRAME;
      continue;
    }
    // 屏蔽节点:不执行,输入直通输出(源节点屏蔽视为空帧)
    if (node.enabled === false) {
      const bypassed: PoseFrame = def.isSource
        ? { ...EMPTY_FRAME, meta: { bypassed: true } }
        : { ...(input ?? EMPTY_FRAME), meta: { ...(input?.meta ?? {}), bypassed: true } };
      out[node.id] = bypassed;
      input = bypassed;
      continue;
    }
    // 源节点 input=null;否则用上一个成功输出
    const nodeInput = def.isSource ? null : input;
    try {
      const result = await def.execute(nodeInput, node.params, ctx);
      out[node.id] = result;
      input = result;
    } catch (e) {
      out[node.id] = { error: (e as Error).message };
      input = EMPTY_FRAME;
    }
  }
  return out;
}

/** 取某节点的成功输出;若是 error 或不存在,返回 null。 */
export function getOutput(outputs: Record<string, NodeOutput>, nodeId: string): PoseFrame | null {
  const o = outputs[nodeId];
  if (!o || 'error' in o) return null;
  return o;
}