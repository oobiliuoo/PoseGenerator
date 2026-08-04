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

/** 全部节点视图:每个节点一张紧凑卡(label + 点数 + 2D 投影小图),纵向排列。 */
export function AllNodesView({ nodes, outputs, selectedNodeId, loading, plane, showPose }: Props) {
  if (nodes.length === 0) {
    return <div className="panel"><div className="panel-body"><div className="preview-empty">流水线为空</div></div></div>;
  }
  return (
    <div className="all-view">
      {nodes.map(n => {
        const def = NODE_REGISTRY[n.type];
        const out = outputs[n.id];
        const frame: PoseFrame | null = getOutput(outputs, n.id);
        const err = out && 'error' in out ? out.error : null;
        const count = frame?.points.length ?? 0;
        return (
          <div key={n.id} className={`all-card${selectedNodeId === n.id ? ' is-selected' : ''}`}>
            <div className="all-card-head">
              <span className="all-card-label">{def?.label ?? n.type}</span>
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
