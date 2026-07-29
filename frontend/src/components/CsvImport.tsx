import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const ingest = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = parseCsvPoints(text);
      onLoaded(res.points, res.rotations, file.name, res.ignored, res.error);
    };
    reader.readAsText(file);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) ingest(f);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) ingest(f);
  };

  const tooFew = !error && pointCount > 0 && pointCount < 3;

  return (
    <div className="csv-import">
      <label
        className={`dropzone${dragOver ? ' is-drag-over' : ''}${fileName ? ' is-loaded' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onPick}
          aria-label="选择 CSV 文件"
        />
        <div className="dz-body">
          <span className="dz-title">{fileName ? '替换文件' : '拖入 CSV 或点击选择'}</span>
          <span className="dz-hint">支持 x / y / z 列名（含 pos_x、px 等别名），可选 rx / ry / rz</span>
        </div>
      </label>

      {fileName && (
        <dl className="csv-meta">
          <div><dt>文件</dt><dd>{fileName}</dd></div>
          <div>
            <dt>点数</dt>
            <dd>
              {pointCount}
              {ignored > 0 && <span className="meta-dim"> · 忽略 {ignored} 行</span>}
              {hasRotation && <span className="meta-dim"> · 含姿态</span>}
            </dd>
          </div>
        </dl>
      )}

      {error && <div className="err">{error}</div>}
      {tooFew && <div className="err">至少需要 3 个点</div>}
    </div>
  );
}