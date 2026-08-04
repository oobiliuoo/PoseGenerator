import type { Pipeline } from '../types';
import { makeNode } from './nodeRegistry';
import { deleteCsvText } from './csvStore';

const STORAGE_KEY = 'pose_generator_pipelines';

/** 内置默认流水线:csv_input -> pose_generate -> pathview_export。 */
export const BUILTIN_PIPELINES: Pipeline[] = [
  {
    name: '默认',
    nodes: [
      makeNode('csv_input'),
      makeNode('pose_generate'),
      makeNode('pathview_export'),
    ],
    builtin: true,
  },
];

export function loadPipelines(): Pipeline[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Pipeline[];
    return arr.filter(p => p && p.name && Array.isArray(p.nodes));
  } catch { return []; }
}

export function savePipeline(p: Pipeline): Pipeline[] {
  const list = loadPipelines().filter(x => x.name !== p.name);
  list.push({ ...p, builtin: false });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export async function deletePipeline(name: string): Promise<Pipeline[]> {
  const list = loadPipelines().filter(x => x.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  // 同步删 IndexedDB 里该流水线绑定的 CSV 文本,避免垃圾累积
  await deleteCsvText(name).catch(() => { /* 删不掉不阻塞 UI */ });
  return list;
}
