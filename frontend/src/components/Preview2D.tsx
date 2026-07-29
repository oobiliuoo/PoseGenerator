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
    <svg width={W} height={H} className="preview2d">
      <polyline points={line} fill="none" stroke="#3b82f6" strokeWidth={2} />
      {geom.map((g, i) => (
        <g key={i}>
          <circle cx={g.X} cy={g.Y} r={3} fill="#ef4444" />
          {(() => {
            const len = Math.hypot(g.dx, g.dy);
            if (len < 1e-3) return null;
            return <line x1={g.X} y1={g.Y} x2={g.X + g.dx} y2={g.Y + g.dy} stroke="#22c55e" strokeWidth={2} />;
          })()}
        </g>
      ))}
    </svg>
  );
}