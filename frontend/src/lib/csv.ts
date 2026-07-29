import Papa from 'papaparse';
import type { Point } from '../types';

export interface CsvParseResult {
  points: Point[];
  ignored: number;
  header: boolean;
  /** column names matched to x/y/z (only when header present) */
  mapping?: { x: string; y: string; z: string };
  /** human-readable error when required columns can't be matched */
  error?: string;
}

// Same alias table as pathview's columnMatcher, for behavioral consistency.
const POSITION_ALIASES: Record<'x' | 'y' | 'z', string[]> = {
  x: ['x', 'pos_x', 'position_x', 'px', 'x_pos', 'x_position'],
  y: ['y', 'pos_y', 'position_y', 'py', 'y_pos', 'y_position'],
  z: ['z', 'pos_z', 'position_z', 'pz', 'z_pos', 'z_position'],
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

export function parseCsvPoints(text: string): CsvParseResult {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = res.data as string[][];
  if (rows.length === 0) return { points: [], ignored: 0, header: false };

  // Detect header: if any cell in row 0 is non-numeric (after trim).
  const first = rows[0].map(c => (c ?? '').trim());
  const isHeader = first.some(c => c.length > 0 && isNaN(Number(c)));
  const dataRows = isHeader ? rows.slice(1) : rows;

  // Column selection: by name when there is a header, else positional (first 3).
  let xCol = 0, yCol = 1, zCol = 2;
  let mapping: { x: string; y: string; z: string } | undefined;
  if (isHeader) {
    const cols = first;
    const mx = findColumn(cols, POSITION_ALIASES.x);
    const my = findColumn(cols, POSITION_ALIASES.y);
    const mz = findColumn(cols, POSITION_ALIASES.z);
    if (!mx || !my || !mz) {
      const missing = [
        !mx && 'x', !my && 'y', !mz && 'z',
      ].filter(Boolean).join(', ');
      return {
        points: [],
        ignored: dataRows.length,
        header: true,
        error: `表头中找不到位置列: ${missing}（支持列名 x/pos_x/px 等，大小写不敏感）`,
      };
    }
    xCol = cols.indexOf(mx); yCol = cols.indexOf(my); zCol = cols.indexOf(mz);
    mapping = { x: mx, y: my, z: mz };
  }

  const points: Point[] = [];
  let ignored = 0;
  for (const row of dataRows) {
    const cells = row.map(c => (c ?? '').trim());
    if (cells.length <= Math.max(xCol, yCol, zCol)) { ignored++; continue; }
    const x = Number(cells[xCol]), y = Number(cells[yCol]), z = Number(cells[zCol]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) { ignored++; continue; }
    points.push({ x, y, z });
  }
  return { points, ignored, header: isHeader, mapping };
}
