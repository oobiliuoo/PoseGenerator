import { useState } from 'react';
import type { PipelineNode, PoseFrame, NodeParamSpec } from '../types';
import type { NodeOutput } from '../lib/pipeline';
import { NODE_REGISTRY } from '../lib/nodeRegistry';

interface Props {
  node: PipelineNode;
  output: NodeOutput | undefined;
  selected: boolean;
  onSelect: () => void;
  onParams: (patch: Record<string, number>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onCsvFile: (name: string, text: string) => void;
  onExport?: () => void;
}

function NumCtrl(p: {
  spec: NodeParamSpec;
  value: number;
  allParams: Record<string, number>;
  onChange: (v: number) => void;
}) {
  const { spec, value, allParams, onChange } = p;
  const disabled = spec.disabledWhen ? spec.disabledWhen(allParams) : false;
  const set = (v: number) => {
    if (spec.forcedOdd) {
      const i = Math.max(1, Math.round(v));
      onChange(i % 2 === 0 ? i + 1 : i);
    } else {
      onChange(v);
    }
  };
  if (spec.type === 'select') {
    return (
      <div className={`ctrl compact${disabled ? ' is-disabled' : ''}`}>
        <label>
          <span className="ctrl-name">
            {spec.label}
            {disabled && spec.disabledHint && <span className="hint">{spec.disabledHint}</span>}
          </span>
          <select value={value} disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}>
            {spec.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
    );
  }
  return (
    <div className={`ctrl compact${disabled ? ' is-disabled' : ''}`}>
      <label>
        <span className="ctrl-name">
          {spec.label}
          {disabled && spec.disabledHint && <span className="hint">{spec.disabledHint}</span>}
        </span>
        <input type="number" min={spec.min} max={spec.max} step={spec.step} value={value}
          disabled={disabled}
          onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set(n); }} />
      </label>
      <input type="range" min={spec.min} max={spec.max} step={spec.step} value={value}
        disabled={disabled}
        onChange={e => set(parseFloat(e.target.value))}
        aria-label={spec.label} />
    </div>
  );
}

export function NodeCard({ node, output, selected, onSelect, onParams, onRemove, onMove, onCsvFile, onExport }: Props) {
  const [expanded, setExpanded] = useState(true);
  const def = NODE_REGISTRY[node.type];
  if (!def) return <div className="node-card">未知节点: {node.type}</div>;

  const frame: PoseFrame | null = output && !('error' in output) ? output : null;
  const err: string | null = output && 'error' in output ? output.error : null;
  const outCount = frame?.points.length ?? 0;

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => onCsvFile(f.name, String(reader.result ?? ''));
    reader.readAsText(f);
  };

  return (
    <div className={`node-card${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <div className="nc-head">
        <span className="nc-dot" />
        <span className="nc-label">{def.label}</span>
        <span className="nc-cat">{def.category}</span>
        {err
          ? <span className="nc-status nc-err">错误</span>
          : <span className="nc-status">{outCount} pts</span>}
        <button className="nc-toggle" onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}>
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="nc-body">
          {/* 源节点:文件选择 */}
          {def.isSource && (
            <label className="nc-file">
              <input type="file" accept=".csv,text/csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              <span>{(frame?.meta as any)?.fileName ?? '选择 CSV / 拖入'}</span>
              {(frame?.meta as any)?.hasRotation && <span className="hint"> 含姿态</span>}
            </label>
          )}
          {/* 算法/工具节点:参数 */}
          {def.params.map(spec => (
            <NumCtrl key={spec.key} spec={spec} value={node.params[spec.key] ?? spec.default}
              allParams={node.params}
              onChange={v => onParams({ [spec.key]: v })} />
          ))}
          {/* 终点节点:导出按钮 */}
          {def.isSink && (
            <button className="nc-export" onClick={e => { e.stopPropagation(); onExport?.(); }}
              disabled={!frame || frame.points.length === 0}>
              推送到 pathview
            </button>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      )}
      <div className="nc-actions" onClick={e => e.stopPropagation()}>
        <button onClick={() => onMove(-1)} title="上移">↑</button>
        <button onClick={() => onMove(1)} title="下移">↓</button>
        <button onClick={onRemove} title="删除">×</button>
      </div>
    </div>
  );
}
