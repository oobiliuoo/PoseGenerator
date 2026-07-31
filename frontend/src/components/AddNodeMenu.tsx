import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildAddableGroups, type AddableType } from '../lib/nodeRegistry';

// ---- 内联 SVG 图标(24x24, stroke=currentColor, 1.5px) ----
const ICONS: Record<string, ReactNode> = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {[7, 12, 17].map(cy => [7, 12, 17].map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill="currentColor" stroke="none" />))}
    </svg>
  ),
  axes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M6 18 V6 M6 18 H18" />
      <path d="M6 6 l-2.5 2.5 M6 6 l2.5 2.5 M6 6 l0 0" />
      <path d="M18 18 l-2.5 -2.5 M18 18 l-2.5 2.5" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 5 H19 V19 H14" />
      <path d="M5 12 H15" />
      <path d="M11 8 l4 4 -4 4" />
    </svg>
  ),
  'wave-cut': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3 14 q3 -5 6 0 t6 0 t6 0" />
      <path d="M4 20 L20 4" strokeDasharray="2 2" />
    </svg>
  ),
  wave: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3 12 q3 -5 6 0 t6 0 t6 0" />
    </svg>
  ),
  ransac: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M4 18 L20 6" />
      {[{x:7,y:9},{x:11,y:13},{x:14,y:7},{x:17,y:15}].map(p => <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={1.1} fill="currentColor" stroke="none" />)}
    </svg>
  ),
};

const ROLE_COLOR: Record<string, string> = {
  source: 'var(--data)',
  algorithm: 'var(--arc)',
  tool: 'var(--ink-dim)',
  sink: 'var(--arc)',
};

interface Props {
  triggerRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  onPick: (type: string) => void;
  align?: 'left' | 'right';
}

export function AddNodeMenu({ triggerRef, open, onClose, onPick, align = 'left' }: Props) {
  const groups = useRef(buildAddableGroups()).current;
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 定位:锚定触发按钮下沿,超出视口下沿则向上翻转。
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const compute = () => {
      const btn = triggerRef.current!;
      const br = btn.getBoundingClientRect();
      const W = 340;
      const left = align === 'right' ? br.right - W : br.left;
      const downTop = br.bottom + 6;
      const menuH = 420; // 估算上限;实际由内容撑开,翻转判断用保守值
      const flip = downTop + menuH > window.innerHeight;
      setPos({
        left: Math.max(8, Math.min(left, window.innerWidth - W - 8)),
        top: flip ? Math.max(8, br.top - 6 - menuH) : downTop,
      });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, align, triggerRef]);

  // outside-click / Escape 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      className="anm-menu"
      ref={menuRef}
      role="menu"
      aria-label="选择要插入的节点类型"
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: 340 }}
    >
      {groups.map(g => (
        <section key={g.group} className="anm-group">
          <h3 className="anm-group-label">{g.group}</h3>
          {g.items.map((t: AddableType, i) => (
            <button
              key={t.type}
              role="menuitem"
              className="anm-item"
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => { onPick(t.type); onClose(); }}
            >
              <span className="anm-icon">{ICONS[t.icon] ?? ICONS.wave}</span>
              <span className="anm-text">
                <span className="anm-name">{t.label}</span>
                <span className="anm-desc">{t.desc}</span>
              </span>
              <span className="anm-role" style={{ background: ROLE_COLOR[t.role] }} aria-hidden="true" />
            </button>
          ))}
        </section>
      ))}
    </div>,
    document.body,
  );
}