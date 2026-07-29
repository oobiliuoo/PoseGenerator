import { useEffect, useRef, useState } from 'react';
import type { GenerateRequest, GenerateResponse } from '../types';
import { generate } from '../api/generate';

export function useGenerate(req: GenerateRequest, enabled: boolean) {
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(req);
  reqRef.current = req;

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await generate(reqRef.current);
        setResult(r);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [req, enabled]);

  return { result, error, loading };
}
