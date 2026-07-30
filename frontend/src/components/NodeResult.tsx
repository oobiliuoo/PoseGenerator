import type { PoseFrame } from '../types';
import { Preview2D } from './Preview2D';
import { PoseTable } from './PoseTable';

export function NodeResult({ frame, loading }: { frame: PoseFrame | null; loading: boolean }) {
  const points = frame?.points ?? [];
  return (
    <div className="panel preview-panel">
      <div className="panel-head panel-head-row">
        <span className="title">节点输出 · 2D 投影</span>
        <span className="badge">
          {points.length} PTS
          {loading && <span className="loading-dot" aria-label="计算中" />}
        </span>
      </div>
      <div className="panel-body">
        <Preview2D points={points} />
      </div>
      <div className="panel">
        <div className="panel-head"><span className="title">位姿数据流</span><span className="badge">{points.length} × 6</span></div>
        <PoseTable points={points} />
      </div>
    </div>
  );
}