import Papa from 'papaparse';
import type { Point, Rotation } from '../types';

export interface CsvParseResult {
  points: Point[];
  /** per-point rotation if rx/ry/rz columns were present (else null) */
  rotations: Rotation[] | null;
  ignored: number;
  header: boolean;
  /** column names matched to x/y/z (only when header present) */
  mapping?: { x: string; y: string; z: string; rx?: string; ry?: string; rz?: string };
  /** human-readable error when required columns can't be matched */
  error?: string;
}

// Same alias tables as pathview's columnMatcher, for behavioral consistency.
const POSITION_ALIASES: Record<'x' | 'y' | 'z', string[]> = {
  x: ['x', 'pos_x', 'position_x', 'px', 'x_pos', 'x_position'],
  y: ['y', 'pos_y', 'position_y', 'py', 'y_pos', 'y_position'],
  z: ['z', 'pos_z', 'position_z', 'pz', 'z_pos', 'z_position'],
};
const ROTATION_ALIASES: Record<'rx' | 'ry' | 'rz', string[]> = {
  rx: ['rx', 'rot_x', 'rotation_x', 'roll', 'r_x', 'x_rot'],
  ry: ['ry', 'rot_y', 'rotation_y', 'pitch', 'r_y', 'y_rot'],
  rz: ['rz', 'rot_z', 'rotation_z', 'yaw', 'r_z', 'z_rot'],
};

/** Find which column name matches one of the aliases (case-insensitive). */
function findColumn(columns: string[], aliases: string[]): string | undefined {
  const lowerCols = columns.map(c => c.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lowerCols.indexOf(alias.toLowerCase());
    if (idx >= 0) return columns[idx];
  }
  return undefined;
}

/** Parse a float, treating empty string as "no value" (returns null). */
function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

export function parseCsvPoints(text: string): CsvParseResult {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = res.data as string[][];
  if (rows.length === 0) return { points: [], rotations: null, ignored: 0, header: false };

  // Detect header: if any cell in row 0 is non-numeric (after trim).
  const first = rows[0].map(c => (c ?? '').trim());
  const isHeader = first.some(c => c.length > 0 && isNaN(Number(c)));
  const dataRows = isHeader ? rows.slice(1) : rows;

  // Column selection: by name when there is a header, else positional (first 3).
  let xCol = 0, yCol = 1, zCol = 2;
  let rxCol = -1, ryCol = -1, rzCol = -1;
  let mapping: CsvParseResult['mapping'];
  if (isHeader) {
    const cols = first;
    const mx = findColumn(cols, POSITION_ALIASES.x);
    const my = findColumn(cols, POSITION_ALIASES.y);
    const mz = findColumn(cols, POSITION_ALIASES.z);
    if (!mx || !my || !mz) {
      const missing = [!mx && 'x', !my && 'y', !mz && 'z'].filter(Boolean).join(', ');
      return {
        points: [], rotations: null, ignored: dataRows.length, header: true,
        error: `表头中找不到位置列: ${missing}（支持列名 x/pos_x/px 等，大小写不敏感）`,
      };
    }
    xCol = cols.indexOf(mx); yCol = cols.indexOf(my); zCol = cols.indexOf(mz);
    const mrx = findColumn(cols, ROTATION_ALIASES.rx);
    const mry = findColumn(cols, ROTATION_ALIASES.ry);
    const mrz = findColumn(cols, ROTATION_ALIASES.rz);
    if (mrx) rxCol = cols.indexOf(mrx);
    if (mry) ryCol = cols.indexOf(mry);
    if (mrz) rzCol = cols.indexOf(mrz);
    mapping = { x: mx, y: my, z: mz, rx: mrx, ry: mry, rz: mrz };
  }

  const hasRot = rxCol >= 0 && ryCol >= 0 && rzCol >= 0;
  const points: Point[] = [];
  const rotations: Rotation[] | null = hasRot ? [] : null;
  let ignored = 0;
  for (const row of dataRows) {
    const cells = row.map(c => (c ?? '').trim());
    if (cells.length <= Math.max(xCol, yCol, zCol)) { ignored++; continue; }
    const x = Number(cells[xCol]), y = Number(cells[yCol]), z = Number(cells[zCol]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) { ignored++; continue; }
    points.push({ x, y, z });

    if (hasRot) {
      // A row is valid for rotation if all three rotation cells parse; missing
      // rotation cells are treated as 0 only if the column exists but is blank.
      const rx = numOrUndef(cells[rxCol]);
      const ry = numOrUndef(cells[ryCol]);
      const rz = numOrUndef(cells[rzCol]);
      rotations!.push({
        rx: rx ?? 0, ry: ry ?? 0, rz: rz ?? 0,
      });
    }
  }
  return { points, rotations, ignored, header: isHeader, mapping };
}
