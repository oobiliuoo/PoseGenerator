import { useLayoutEffect, useRef, useState } from 'react';
import type { PoseFrame, PipelineNode } from '../types';
import type { NodeOutput } from '../lib/pipeline';
import { getOutput } from '../lib/pipeline';
import { NODE_REGISTRY } from '../lib/nodeRegistry';
import { Preview2D, type Plane } from './Preview2D';

interface Props {
  nodes: PipelineNode[];
  outputs: Record<string, NodeOutput>;
  selectedNodeId: string | null;
  loading: boolean;
  plane: Plane;
  showPose: boolean;
}

const GAP = 12;
const MIN_CELL_H = 120;   // 单元格最小高,低于此宁可行溢出滚动

/** 枚举列数,取"最小边最大"的行列组合——单元格近方形,屏幕利用率最高。 */
function bestGrid(n: number, w: number, h: number): { cols: number; rows: number } {
  let best = { cols: 1, rows: n };
  let bestMin = -1;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (w - (cols - 1) * GAP) / cols;
    const ch = (h - (rows - 1) * GAP) / rows;
    if (cw <= 0 || ch <= 0) continue;
    // 行高不足最低阈值:该列数会导致滚动,只有没有任何可行解时才接受
    if (ch < MIN_CELL_H && bestMin >= 0) break;
    const minEdge = Math.min(cw, ch);
    if (minEdge > bestMin) {
      bestMin = minEdge;
      best = { cols, rows };
    }
  }
  return best;
}

/** 全部节点视图:每个节点一张紧凑卡(label + 点数 + 2D 投影小图),网格铺满容器。 */
export function AllNodesView({ nodes, outputs, selectedNodeId, loading, plane, showPose }: Props) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);

  const n = nodes.length;
  // useLayoutEffect:首帧前量好行列,避免先单列闪一下再重排
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el || n === 0) { setGrid(null); return; }
    const measure = () => {
      setGrid(bestGrid(n, el.clientWidth, el.clientHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  if (n === 0) {
    return <div className="panel"><div className="panel-body"><div className="preview-empty">流水线为空</div></div></div>;
  }
  return (
    <div
      ref={viewRef}
      className="all-view"
      style={grid ? {
        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${grid.rows}, minmax(${MIN_CELL_H}px, 1fr))`,
      } : undefined}
    >
      {nodes.map(node => {
        const def = NODE_REGISTRY[node.type];
        const out = outputs[node.id];
        const frame: PoseFrame | null = getOutput(outputs, node.id);
        const err = out && 'error' in out ? out.error : null;
        const count = frame?.points.length ?? 0;
        return (
          <div key={node.id} className={`all-card${selectedNodeId === node.id ? ' is-selected' : ''}`}>
            <div className="all-card-head">
              <span className="all-card-label">{def?.label ?? node.type}</span>
              <span className="all-card-count">
                {err ? <span className="nc-err">{err}</span> : `${count} pts`}
                {loading && <span className="loading-dot" aria-label="计算中" />}
              </span>
            </div>
            <div className="all-card-body">
              {frame && count > 0
                ? <Preview2D points={frame.points} plane={plane} showPose={showPose} />
                : <div className="preview-empty">无输出</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
