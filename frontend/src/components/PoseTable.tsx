import type { PosePoint } from '../types';

export function PoseTable({ points }: { points: PosePoint[] }) {
  if (points.length === 0) return null;
  return (
    <div className="pose-table-wrap">
      <table className="pose-table">
        <thead><tr><th>#</th><th>x</th><th>y</th><th>z</th><th>rx</th><th>ry</th><th>rz</th></tr></thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{i}</td>
              <td>{p.x.toFixed(3)}</td><td>{p.y.toFixed(3)}</td><td>{p.z.toFixed(3)}</td>
              <td>{p.rx.toFixed(3)}</td><td>{p.ry.toFixed(3)}</td><td>{p.rz.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}