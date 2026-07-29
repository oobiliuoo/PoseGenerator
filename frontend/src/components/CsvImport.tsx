import { parseCsvPoints } from '../lib/csv';
import type { Point, Rotation } from '../types';

interface Props {
  onLoaded: (points: Point[], rotations: Rotation[] | null, fileName: string, ignored: number, error?: string) => void;
  fileName: string | null;
  pointCount: number;
  ignored: number;
  /** parse error (e.g. header columns not matched), shown when present */
  error?: string | null;
  /** true when the CSV carried rx/ry/rz columns */
  hasRotation: boolean;
}

export function CsvImport({ onLoaded, fileName, pointCount, ignored, error, hasRotation }: Props) {
  const handle = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = parseCsvPoints(text);
      onLoaded(res.points, res.rotations, file.name, res.ignored, res.error);
    };
    reader.readAsText(file);
  };
  return (
    <div className="csv-import">
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }}
      />
      {fileName && (
        <div className="csv-meta">
          <div><span className="kv">FILE</span> <span className="v">{fileName}</span></div>
          <div><span className="kv">PTS</span> <span className="v">{pointCount}</span>
            {ignored > 0 && <span className="kv"> · 忽略 {ignored} 行</span>}
            {hasRotation && <span className="kv"> · 含姿态</span>}
          </div>
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {!error && pointCount < 3 && <div style={{ color: 'var(--danger)' }}>至少需要 3 个点</div>}
        </div>
      )}
    </div>
  );
}
