import type { GenerateRequest, GenerateResponse } from '../types';

export async function generate(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error || `generate failed: ${res.status}`);
  }
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const r = await fetch('/health');
    return r.ok;
  } catch { return false; }
}
