import { useMemo } from 'react';
import type { PosePoint } from '../types';
import { eulerToDirXY } from '../lib/euler';

interface Props { points: PosePoint[]; }

const W = 480, H = 360, PAD = 24, ARROW = 18;

export function Preview2D({ points }: Props) {
  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1;
    const scale = Math.min((W - 2 * PAD) / sx, (H - 2 * PAD) / sy);
    const ox = PAD + (W - 2 * PAD - sx * scale) / 2 - minX * scale;
    const flat = (p: { x: number; y: number }) => ({ X: p.x * scale + ox, Y: H - PAD - (p.y - minY) * scale });
    return points.map(p => {
      const s = flat(p);
      const d = eulerToDirXY(p.rx, p.ry, p.rz);
      return { ...s, dx: d.dx * ARROW, dy: -d.dy * ARROW }; // screen Y down
    });
  }, [points]);

  if (!geom) return <div className="preview-empty">导入 CSV 后显示预览</div>;
  const line = geom.map(g => `${g.X},${g.Y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="preview2d">
      {/* origin crosshair */}
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#1d2128" strokeWidth={1} strokeDasharray="2 4" />
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#1d2128" strokeWidth={1} strokeDasharray="2 4" />
      {/* path */}
      <polyline points={line} fill="none" stroke="#22d3ee" strokeWidth={2} opacity={0.9} />
      {geom.map((g, i) => (
        <g key={i}>
          <circle cx={g.X} cy={g.Y} r={3} fill="#ffb627" stroke="#0a0c0f" strokeWidth={1} />
          {(() => {
            const len = Math.hypot(g.dx, g.dy);
            if (len < 1e-3) return null;
            return <line x1={g.X} y1={g.Y} x2={g.X + g.dx} y2={g.Y + g.dy}
              stroke="#ffb627" strokeWidth={2} opacity={0.8} />;
          })()}
        </g>
      ))}
    </svg>
  );
}