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

/**
 * Compact file input designed for the bottom action bar.
 * Single row, drag-and-drop, shows the loaded filename + point count.
 * When no file is loaded it shows a "选择 CSV / 拖入" prompt.
 */
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
    // reset so picking the same file again still triggers onChange
    e.target.value = '';
  };

  const tooFew = !error && pointCount > 0 && pointCount < 3;

  return (
    <div className="ab-csv">
      <label
        className={`ab-dropzone${dragOver ? ' is-drag-over' : ''}${fileName ? ' is-loaded' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        title={fileName ?? '选择或拖入 CSV 文件'}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onPick}
          aria-label="选择 CSV 文件"
        />
        <span className="ab-dz-icon" aria-hidden="true">⤓</span>
        {fileName ? (
          <span className="ab-dz-loaded">
            <span className="ab-dz-name">{fileName}</span>
            <span className="ab-dz-meta">
              {pointCount} 点
              {ignored > 0 && ` · 忽略 ${ignored}`}
              {hasRotation && ' · 含姿态'}
            </span>
          </span>
        ) : (
          <span className="ab-dz-prompt">选择 CSV / 拖入</span>
        )}
      </label>

      {error && <div className="ab-err" role="alert">导入失败:{error}</div>}
      {tooFew && <div className="ab-err">至少需要 3 个点</div>}
    </div>
  );
}