import { useState } from 'react';
import type { PoseFrame } from '../types';
import { Preview2D, type Plane } from './Preview2D';
import { PoseTable } from './PoseTable';
import { downloadPointsCsv } from '../lib/csv';

export function NodeResult({ frame, loading, nodeName, plane, showPose }: { frame: PoseFrame | null; loading: boolean; nodeName: string | null; plane: Plane; showPose: boolean }) {
  const points = frame?.points ?? [];
  // 表格选中行 ↔ 2D 投影高亮联动。参数微调重算后保留选中(点数变化时越界自动失效)。
  const [picked, setPicked] = useState<number | null>(null);
  // 两面板并列:投影(.preview-panel)与位姿数据流(.table-panel)
  // 作为 .right 网格的两列;窄屏下由响应式断点自动堆叠。
  return (
    <>
      <div className="panel preview-panel">
        <div className="panel-head panel-head-row">
          <span className="title">节点输出 · 2D 投影</span>
          <span className="badge">
            {points.length} PTS
            {loading && <span className="loading-dot" aria-label="计算中" />}
          </span>
        </div>
        <div className="panel-body">
          <Preview2D points={points} plane={plane} showPose={showPose} highlightIndex={picked} />
        </div>
      </div>
      <div className="panel table-panel">
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
        <PoseTable points={points} selectedIndex={picked} onSelect={setPicked} />
      </div>
    </>
  );
}