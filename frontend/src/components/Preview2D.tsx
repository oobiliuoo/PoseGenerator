import { useMemo, useState } from 'react';
import type { PosePoint } from '../types';
import { eulerToVec } from '../lib/euler';

interface Props { points: PosePoint[]; }

const W = 480, H = 360, PAD = 24, ARROW = 18;

type Plane = 'xy' | 'xz' | 'yz';

interface Geom { X: number; Y: number; dx: number; dy: number; }

function project(points: PosePoint[], plane: Plane): Geom[] | null {
  if (points.length === 0) return null;
  const axis = (p: PosePoint) => {
    if (plane === 'xy') return { a: p.x, b: p.y };
    if (plane === 'xz') return { a: p.x, b: p.z };
    return { a: p.y, b: p.z }; // yz
  };
  const dirs = points.map(p => {
    const v = eulerToVec(p.rx, p.ry, p.rz);
    return plane === 'xy' ? { a: v.vx, b: v.vy }
         : plane === 'xz' ? { a: v.vx, b: v.vz }
         :                  { a: v.vy, b: v.vz };
  });
  const A = points.map(p => axis(p).a);
  const B = points.map(p => axis(p).b);
  const minA = Math.min(...A), maxA = Math.max(...A);
  const minB = Math.min(...B), maxB = Math.max(...B);
  const sA = (maxA - minA) || 1, sB = (maxB - minB) || 1;
  const scale = Math.min((W - 2 * PAD) / sA, (H - 2 * PAD) / sB);
  const ox = PAD + (W - 2 * PAD - sA * scale) / 2 - minA * scale;
  const oy = PAD + (H - 2 * PAD - sB * scale) / 2 - minB * scale;
  return points.map((p, i) => {
    const { a, b } = axis(p);
    const d = dirs[i];
    return {
      X: a * scale + ox,
      Y: H - (b * scale + oy), // flip Y for screen coords
      dx: d.a * ARROW,
      dy: -d.b * ARROW,        // flip arrow Y to match screen
    };
  });
}

const PLANE_LABELS: Record<Plane, string> = {
  xy: 'XY 俯视',
  xz: 'XZ 正视',
  yz: 'YZ 侧视',
};

export function Preview2D({ points }: Props) {
  const [plane, setPlane] = useState<Plane>('xy');
  const [showPose, setShowPose] = useState(true);
  const geom = useMemo(() => project(points, plane), [points, plane]);

  return (
    <div className="preview">
      <div className="preview-toolbar">
        <div className="seg" role="tablist" aria-label="投影平面">
          {(['xy', 'xz', 'yz'] as Plane[]).map(p => (
            <button
              key={p}
              role="tab"
              aria-selected={plane === p}
              className={plane === p ? 'seg-on' : ''}
              onClick={() => setPlane(p)}
            >{PLANE_LABELS[p]}</button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showPose}
          aria-label="显示姿态方向"
          className={showPose ? 'pose-toggle on' : 'pose-toggle'}
          onClick={() => setShowPose(v => !v)}
          title={showPose ? '隐藏姿态方向' : '显示姿态方向'}
        >
          <span className="pose-toggle-dot" aria-hidden="true" />
          姿态
        </button>
      </div>

      {!geom ? (
        <div className="preview-empty">导入 CSV 后显示预览</div>
      ) : (
        <div className="preview-frame">
          <svg viewBox={`0 0 ${W} ${H}`} className="preview2d" role="img" aria-label={`${PLANE_LABELS[plane]} 投影`}>
          {/* origin crosshair */}
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#1d2128" strokeWidth={1} strokeDasharray="2 4" />
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#1d2128" strokeWidth={1} strokeDasharray="2 4" />
          {/* path */}
          <polyline
            points={geom.map(g => `${g.X},${g.Y}`).join(' ')}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={2}
            opacity={0.9}
          />
          {geom.map((g, i) => {
            const len = Math.hypot(g.dx, g.dy);
            return (
              <g key={i}>
                <circle cx={g.X} cy={g.Y} r={3} fill="#ffb627" stroke="#0a0c0f" strokeWidth={1} />
                {showPose && len >= 1e-3 && (
                  <line x1={g.X} y1={g.Y} x2={g.X + g.dx} y2={g.Y + g.dy}
                    stroke="#ffb627" strokeWidth={2} opacity={0.8} />
                )}
              </g>
            );
          })}
          </svg>
        </div>
      )}
    </div>
  );
}