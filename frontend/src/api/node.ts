import type { PoseFrame } from '../types';

/**
 * 调后端 /node/execute。algorithm 节点的 execute 函数用这个。
 * signal 用于增量重算时取消进行中的请求(参数又变了)。
 */
export async function executeNode(
  nodeType: string,
  input: PoseFrame,
  params: Record<string, number>,
  signal?: AbortSignal,
): Promise<PoseFrame> {
  const res = await fetch('/node/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_type: nodeType, input, params }),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `node execute failed: ${res.status}`);
  }
  const data = await res.json();
  const output = (data as any).output;
  if (!output || !Array.isArray(output.points)) {
    throw new Error('node execute: malformed output frame');
  }
  return { points: output.points, meta: output.meta ?? {} };
}
