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

  // buildAddableGroups 四段分组
  const { buildAddableGroups } = await import('./nodeRegistry');
  const groups = buildAddableGroups();
  assert(groups.length === 4, '应有 4 段分组');
  assert(groups[0].group === '输入源' && groups[0].items.length === 1, '输入源段');
  assert(groups[1].group === '算法' && groups[1].items.length === 1, '算法段');
  assert(groups[2].group === '滤波工具' && groups[2].items.length === 7, '滤波工具段应有 7 个');
  assert(groups[3].group === '输出' && groups[3].items.length === 1, '输出段');

  // 每项都有 icon/desc/role
  for (const g of groups) {
    for (const it of g.items) {
      assert(it.icon && it.desc && it.role, `${it.type} 缺字段`);
    }
  }

  console.log('nodeRegistry.test OK');
}
run();
