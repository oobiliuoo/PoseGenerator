import assert from 'node:assert';

async function run() {
  const { NODE_REGISTRY } = await import('./nodeRegistry');

  // 每个节点都有 desc 与 role
  for (const def of Object.values(NODE_REGISTRY)) {
    assert(def.desc && def.desc.length > 0, `${def.type} 缺 desc`);
    assert(['source', 'algorithm', 'tool', 'sink'].includes(def.role!), `${def.type} role 非法`);
  }

  // 角色与 isSource/isSink 一致性
  assert(NODE_REGISTRY['csv_input'].role === 'source', 'csv_input 应为 source');
  assert(NODE_REGISTRY['pathview_export'].role === 'sink', 'pathview_export 应为 sink');
  assert(NODE_REGISTRY['pose_generate'].role === 'algorithm', 'pose_generate 应为 algorithm');
  for (const t of ['filter_distance', 'filter_mean', 'filter_ransac_line']) {
    assert(NODE_REGISTRY[t].role === 'tool', `${t} 应为 tool`);
  }

  console.log('nodeRegistry.test OK');
}
run();
