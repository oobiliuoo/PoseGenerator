import type { PoseFrame } from '../types';
import { Preview2D } from './Preview2D';
import { PoseTable } from './PoseTable';
import { downloadPointsCsv } from '../lib/csv';

export function NodeResult({ frame, loading, nodeName }: { frame: PoseFrame | null; loading: boolean; nodeName: string | null }) {
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
        <div className="panel-head panel-head-row">
          <span className="title">位姿数据流</span>
          <span className="badge">{points.length} × 6</span>
          <button
            className="link nc-export-csv"
            onClick={() => downloadPointsCsv(points, nodeName)}
            disabled={points.length === 0}
            title={`导出 CSV: ${nodeName ?? 'pose'}_<时间>.csv`}
          >
            导出 CSV
          </button>
        </div>
        <PoseTable points={points} />
      </div>
    </div>
  );
}