import type { PosePoint } from '../types';

// Probe pathview via Vite proxy. Returns true when the server is reachable.
export async function healthCheckPathview(): Promise<boolean> {
  try {
    const r = await fetch('/api/paths', { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}

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

const PATHVIEW_WINDOW = 'pathview';

export function openPathview(): void {
  // 命名窗口:已存在则复用(重新导航刷新到列表)并聚焦,不重复开新页
  window.open('http://localhost:5173', PATHVIEW_WINDOW)?.focus();
}
