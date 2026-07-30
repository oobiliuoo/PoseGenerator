import type { PipelineNode } from '../types';
import type { NodeOutput } from '../lib/pipeline';
import { NODE_REGISTRY } from '../lib/nodeRegistry';
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
}

export function NodeChain(props: Props) {
  const { nodes, outputs, selectedNodeId } = props;
  const addableTypes = Object.values(NODE_REGISTRY).map(d => ({ type: d.type, label: d.label }));

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
            onCsvFile={(name, text) => props.onCsvFile(n.id, name, text)}
          />
          {/* 节点间"添加"按钮 */}
          <div className="node-add">
            {addableTypes.map(t => (
              <button key={t.type} onClick={() => props.onAddNode(t.type, n.id)} title={`在之后插入 ${t.label}`}>
                + {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {nodes.length === 0 && <div className="node-empty">流水线为空,从下方添加节点。</div>}
      {/* 链尾添加 */}
      <div className="node-add node-add-tail">
        {addableTypes.map(t => (
          <button key={t.type} onClick={() => props.onAddNode(t.type)}>+ {t.label}</button>
        ))}
      </div>
    </div>
  );
}
