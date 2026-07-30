import assert from 'node:assert';

// 用全局 fetch mock 验证 executeNode 的请求体构造与响应解析。
async function run() {
  let captured: { url: string; body: any } | null = null;
  const origFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    captured = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      output: { points: [{ x: 1, y: 2, z: 3, rx: 0, ry: 0, rz: 0 }], meta: {} },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { executeNode } = await import('./node');
    const out = await executeNode('pose_generate',
      { points: [{ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }], meta: {} },
      { output_mode: 0 });
    assert(captured!.url === '/node/execute', 'posts to /node/execute');
    assert(captured!.body.node_type === 'pose_generate', 'body has node_type');
    assert(Array.isArray(captured!.body.input.points), 'body has input.points');
    assert(out.points.length === 1, 'parses output points');
    assert(out.meta && typeof out.meta === 'object', 'parses meta (default {})');
  } finally {
    (globalThis as any).fetch = origFetch;
  }
  console.log('node.test OK');
}
run();
