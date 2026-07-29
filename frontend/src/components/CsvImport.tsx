import { parseCsvPoints } from '../lib/csv';
import type { Point } from '../types';

interface Props {
  onLoaded: (points: Point[], fileName: string, ignored: number) => void;
  fileName: string | null;
  pointCount: number;
  ignored: number;
}

export function CsvImport({ onLoaded, fileName, pointCount, ignored }: Props) {
  const handle = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = parseCsvPoints(text);
      onLoaded(res.points, file.name, res.ignored);
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
          <div>文件: {fileName}</div>
          <div>点数: {pointCount}{ignored > 0 ? ` （忽略 ${ignored} 行）` : ''}</div>
          {pointCount < 3 && <div style={{ color: '#ef4444' }}>至少需要 3 个点</div>}
        </div>
      )}
    </div>
  );
}