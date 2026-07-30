import { useRef, type ChangeEvent } from 'react';
import type { Point, Rotation } from '../types';

interface Props {
  /** Called with the picked/dropped File. The parent is responsible for
   *  parsing and updating app state. */
  onFile: (file: File) => void;
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
 *
 * Single row, click-to-pick. Drag-and-drop is handled by the parent
 * (the whole ActionBar is the drop target) so the user can drop a
 * file anywhere on the bar — not just on this small zone.
 */
export function CsvImport({ onFile, fileName, pointCount, ignored, error, hasRotation }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    // reset so picking the same file again still triggers onChange
    e.target.value = '';
  };

  const tooFew = !error && pointCount > 0 && pointCount < 3;

  return (
    <div className="ab-csv">
      <label
        className={`ab-dropzone${fileName ? ' is-loaded' : ''}`}
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