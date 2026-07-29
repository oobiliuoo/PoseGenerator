import type { PosePoint } from '../types';

// POST points to pathview's /api/paths via Vite proxy. Returns new path id.
export async function sendToPathview(points: PosePoint[], sourceFile: string): Promise<number> {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const name = `${sourceFile} ${hh}:${mm}:${ss}`;
  const res = await fetch('/api/paths', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, source_file: sourceFile, points }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || 'failed to create path in pathview');
  }
  const data = await res.json();
  return data.id as number;
}

export function openPathview(): void {
  window.open('http://localhost:5173', '_blank');
}
