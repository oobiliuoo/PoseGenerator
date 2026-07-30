import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PipelineNode } from '../types';
import type { NodeOutput } from '../lib/pipeline';
import { NODE_REGISTRY } from '../lib/nodeRegistry';
import { NodeCard, type AddableType, type AddableGroup } from './NodeCard';

interface Props {
  nodes: PipelineNode[];
  outputs: Record<string, NodeOutput>;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onParams: (id: string, patch: Record<string, number>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAddNode: (type: string, afterId?: string) => void;
  onCsvFile: (id: string, name: string, text: string) => void;
  onExport?: (id: string) => void;
}

function buildAddableGroups(): AddableGroup[] {
  const groups: AddableGroup[] = [
    { group: 'I/O', items: [] },
    { group: '算法', items: [] },
    { group: '滤波', items: [] },
  ];
  for (const d of Object.values(NODE_REGISTRY)) {
    const idx = d.category === 'io' ? 0 : d.category === 'algorithm' ? 1 : 2;
    const t: AddableType = {
      type: d.type,
      label: d.label,
      short: d.type === 'csv_input' ? 'CSV'
           : d.type === 'pose_generate' ? '姿态'
           : d.type === 'pathview_export' ? '导出'
           : d.label,
      category: d.category,
    };
    groups[idx].items.push(t);
  }
  return groups;
}

export function NodeChain(props: Props) {
  const { nodes, outputs, selectedNodeId } = props;
  const addableGroups = useRef(buildAddableGroups()).current;

  // Tail "+" is the empty-state / append entry. Once any node exists the
  // user can extend the chain from any node's head-bar "↑ ↓ × +" cluster.
  const [tailOpen, setTailOpen] = useState(false);
  const tailRef = useRef<HTMLDivElement>(null);
  const tailBtnRef = useRef<HTMLButtonElement>(null);
  const [tailPos, setTailPos] = useState<{ left: number; top: number; width: number; anchor: 'tail' } | null>(null);

  useEffect(() => {
    if (!tailOpen || !tailBtnRef.current) { setTailPos(null); return; }
    const compute = () => {
      const btn = tailBtnRef.current!;
      const panel = btn.closest('.panel') as HTMLElement | null;
      if (!panel) { setTailPos(null); return; }
      const pr = panel.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      const firstHead = panel.querySelector('.nc-head') as HTMLElement | null;
      const headTop = firstHead
        ? firstHead.getBoundingClientRect().top
        : pr.top + 56;
      setTailPos({
        left: br.left,
        top: headTop - 4,
        width: br.width,
        anchor: 'tail' as const,
      });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [tailOpen]);

  useEffect(() => {
    if (!tailOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tailRef.current && tailRef.current.contains(t)) return;
      if (tailBtnRef.current && tailBtnRef.current.contains(t)) return;
      setTailOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTailOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tailOpen]);

  return (
    <div className="node-chain">
      {nodes.map(n => (
        <div key={n.id} className="node-slot">
          <NodeCard
            node={n}
            output={outputs[n.id]}
            selected={selectedNodeId === n.id}
            addableGroups={addableGroups}
            onSelect={() => props.onSelect(n.id)}
            onParams={patch => props.onParams(n.id, patch)}
            onRemove={() => props.onRemove(n.id)}
            onMove={dir => props.onMove(n.id, dir)}
            onAddAfter={type => props.onAddNode(type, n.id)}
            onCsvFile={(name, text) => props.onCsvFile(n.id, name, text)}
            onExport={props.onExport ? () => props.onExport!(n.id) : undefined}
          />
        </div>
      ))}
      {nodes.length === 0 && <div className="node-empty">流水线为空,从下方添加节点。</div>}
      {/* Tail "append" — gives an entry point when the chain is empty,
          and a one-click "add to the end" when it isn't. Each node card
          also has its own "+" so insertion-in-middle doesn't need this. */}
      <div className="node-tail" ref={tailRef}>
        <button
          ref={tailBtnRef}
          className={`node-tail-btn${tailOpen ? ' is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={tailOpen}
          aria-label={nodes.length === 0 ? '添加第一个节点' : '在末尾追加节点'}
          onClick={() => setTailOpen(x => !x)}
        >
          + 添加节点
        </button>
        {tailOpen && tailPos && createPortal(
          <div
            className="nc-add-menu node-tail-menu"
            role="menu"
            aria-label="选择节点类型"
            style={{
              position: 'fixed',
              left: tailPos.left,
              top: tailPos.top,
              width: tailPos.width,
              transform: 'translateY(-100%)',
            }}
          >
            {addableGroups.map(g => (
              <span key={g.group} className="add-group">
                <span className="add-group-label">{g.group}</span>
                {g.items.map(t => (
                  <button
                    key={t.type}
                    role="menuitem"
                    className="nc-add-item"
                    onClick={() => { props.onAddNode(t.type); setTailOpen(false); }}
                  >
                    <span className="nc-add-cat">{t.category}</span>
                    <span className="nc-add-label">{t.label}</span>
                    <span className="nc-add-short">+ {t.short}</span>
                  </button>
                ))}
              </span>
            ))}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
