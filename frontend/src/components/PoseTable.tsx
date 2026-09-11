import type { PosePoint } from '../types';

interface Props {
  points: PosePoint[];
  /** 当前选中行(与 2D 投影高亮联动);null = 未选中 */
  selectedIndex?: number | null;
  /** 点击行回调:再点同一行传 null 取消选中 */
  onSelect?: (index: number | null) => void;
}

export function PoseTable({ points, selectedIndex = null, onSelect }: Props) {
  if (points.length === 0) return null;
  return (
    <div className="pose-table-wrap">
      <table className="pose-table">
        <thead><tr><th>#</th><th>x</th><th>y</th><th>z</th><th>rx</th><th>ry</th><th>rz</th></tr></thead>
        <tbody>
          {points.map((p, i) => (
            <tr
              key={i}
              className={i === selectedIndex ? 'is-picked' : ''}
              onClick={onSelect ? () => onSelect(i === selectedIndex ? null : i) : undefined}
            >
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