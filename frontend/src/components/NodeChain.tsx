import { useRef, useState } from 'react';
import type { PipelineNode } from '../types';
import type { NodeOutput } from '../lib/pipeline';
import { AddNodeMenu } from './AddNodeMenu';
import { NodeCard } from './NodeCard';

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

export function NodeChain(props: Props) {
  const { nodes, outputs, selectedNodeId } = props;

  // Tail "+" is the append entry. Once any node exists the
  // user can extend the chain from any node's head-bar "↑ ↓ × +" cluster.
  const [tailOpen, setTailOpen] = useState(false);
  const tailBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="node-chain">
      {nodes.map(n => (
        <div key={n.id} className="node-slot">
          <NodeCard
            node={n}
            output={outputs[n.id]}
            selected={selectedNodeId === n.id}
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
      <div className="node-tail">
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
        <AddNodeMenu
          triggerRef={tailBtnRef}
          open={tailOpen}
          onClose={() => setTailOpen(false)}
          onPick={type => props.onAddNode(type)}
          align="left"
        />
      </div>
    </div>
  );
}
