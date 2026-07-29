import { useEffect, useState } from 'react';
import { healthCheck } from '../api/generate';

export function BackendStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const tick = async () => { if (active) setOk(await healthCheck()); };
    tick();
    const id = setInterval(tick, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);
  const cls = ok ? 'online' : (ok === false ? 'offline' : 'unknown');
  const label = ok ? '后端在线' : (ok === false ? '后端离线' : '检测中');
  return (
    <span className={`backend-status ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}