import Papa from 'papaparse';
import type { Point } from '../types';

export interface CsvParseResult { points: Point[]; ignored: number; header: boolean; }

export function parseCsvPoints(text: string): CsvParseResult {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = res.data as string[][];
  if (rows.length === 0) return { points: [], ignored: 0, header: false };

  // Detect header: if any cell in row 0 is non-numeric (after trim).
  const first = rows[0].map(c => (c ?? '').trim());
  const isHeader = first.some(c => c.length > 0 && isNaN(Number(c)));
  const dataRows = isHeader ? rows.slice(1) : rows;

  const points: Point[] = [];
  let ignored = 0;
  for (const row of dataRows) {
    const cells = row.map(c => (c ?? '').trim());
    if (cells.length < 3) { ignored++; continue; }
    const x = Number(cells[0]), y = Number(cells[1]), z = Number(cells[2]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) { ignored++; continue; }
    points.push({ x, y, z });
  }
  return { points, ignored, header: isHeader };
}