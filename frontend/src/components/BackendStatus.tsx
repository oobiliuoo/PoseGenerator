import { useEffect, useState } from 'react';
import { healthCheck as healthPose } from '../api/generate';
import { healthCheckPathview } from '../api/pathview';

type Status = 'online' | 'offline' | 'checking';

interface ServiceProps {
  label: string;
  status: Status;
}

function Service({ label, status }: ServiceProps) {
  const text =
    status === 'online' ? '在线'
    : status === 'offline' ? '离线'
    : '检测中';
  return (
    <span
      className={`svc-pill svc-${status}`}
      role="status"
      aria-label={`${label} ${text}`}
    >
      <span className="dot" aria-hidden="true" />
      <span className="lbl">{label}</span>
      <span className="state">{text}</span>
    </span>
  );
}

/** Live indicators for both upstream services: pose_backend (algorithm) and pathview (3D viewer). */
export function BackendStatus() {
  const [pose, setPose] = useState<Status>('checking');
  const [path, setPath] = useState<Status>('checking');

  useEffect(() => {
    let active = true;
    const tick = async () => {
      if (!active) return;
      const [a, b] = await Promise.all([healthPose(), healthCheckPathview()]);
      if (!active) return;
      setPose(a ? 'online' : 'offline');
      setPath(b ? 'online' : 'offline');
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <div className="backend-status">
      <Service label="pose" status={pose} />
      <Service label="pathview" status={path} />
    </div>
  );
}