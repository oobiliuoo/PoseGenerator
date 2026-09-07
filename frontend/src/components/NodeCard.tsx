import { useRef, useState } from 'react';
import type { PipelineNode, PoseFrame, NodeParamSpec } from '../types';
import type { NodeOutput } from '../lib/pipeline';
import { NODE_REGISTRY } from '../lib/nodeRegistry';
import { AddNodeMenu } from './AddNodeMenu';
import { Icon } from './icons';

interface Props {
  node: PipelineNode;
  output: NodeOutput | undefined;
  selected: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: () => void;
  onParams: (patch: Record<string, number>) => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onAddAfter: (type: string) => void;
  onCsvFile: (name: string, text: string) => void;
  onExport?: () => void;
}

function NumCtrl(p: {
  spec: NodeParamSpec;
  value: number;
  allParams: Record<string, number>;
  onChange: (v: number) => void;
  maxOverride?: number;
}) {
  const { spec, value, allParams, onChange, maxOverride } = p;
  const disabled = spec.disabledWhen ? spec.disabledWhen(allParams) : false;
  const max = maxOverride ?? spec.max;
  const set = (v: number) => {
    if (spec.forcedOdd) {
      const i = Math.max(1, Math.round(v));
      onChange(i % 2 === 0 ? i + 1 : i);
    } else {
      onChange(v);
    }
  };
  // number 输入的字符串草稿:允许中间态(空/负号/尾小数点),blur/Enter 才提交。
  // 受控 value + parseFloat NaN 守卫会把 "-"、"1." 判为 NaN 拒绝更新,负数输不进去。
  const [draft, setDraft] = useState<string | null>(null);
  const commitDraft = () => {
    if (draft === null) return;
    const n = parseFloat(draft);
    setDraft(null);  // 退出编辑态,回显外部 value
    if (!Number.isNaN(n)) {
      // 提交时钳制到 [min, max],避免越界值进流水线
      const lo = spec.min ?? -Infinity;
      const hi = max ?? Infinity;
      set(Math.min(hi, Math.max(lo, n)));
    }
  };
  if (spec.type === 'select') {
    return (
      <div className={`ctrl compact${disabled ? ' is-disabled' : ''}`} onClick={e => e.stopPropagation()}>
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
    <div className={`ctrl compact${disabled ? ' is-disabled' : ''}`} onClick={e => e.stopPropagation()}>
      <label>
        <span className="ctrl-name">
          {spec.label}
          {disabled && spec.disabledHint && <span className="hint">{spec.disabledHint}</span>}
        </span>
        <input type="number" min={spec.min} max={max} step={spec.step}
          value={draft ?? String(value)}
          disabled={disabled}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(); } }} />
      </label>
      <input type="range" min={spec.min} max={max} step={spec.step} value={value}
        disabled={disabled}
        onChange={e => set(parseFloat(e.target.value))}
        aria-label={spec.label} />
    </div>
  );
}

export function NodeCard({ node, output, selected, expanded, onToggleExpanded, onSelect, onParams, onToggleEnabled, onRemove, onMove, onAddAfter, onCsvFile, onExport }: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const def = NODE_REGISTRY[node.type];
  if (!def) return <div className="node-card">未知节点: {node.type}</div>;

  const frame: PoseFrame | null = output && !('error' in output) ? output : null;
  const err: string | null = output && 'error' in output ? output.error : null;
  const outCount = frame?.points.length ?? 0;
  const disabledNode = node.enabled === false;

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => onCsvFile(f.name, String(reader.result ?? ''));
    reader.readAsText(f);
  };

  return (
    <div
      className={`node-card${selected ? ' is-selected' : ''}${dragOver ? ' is-dragover' : ''}${disabledNode ? ' is-bypassed' : ''}`}
      onClick={onSelect}
      onDragOver={def.isSource ? e => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={def.isSource ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); } : undefined}
      onDrop={def.isSource ? e => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      } : undefined}
    >
      <div className="nc-head">
        <span className="nc-dot" />
        <span className="nc-label">{def.label}</span>
        <span className="nc-actions" onClick={e => e.stopPropagation()}>
          {!def.isSource && (
            <button
              onClick={onToggleEnabled}
              title={disabledNode ? '恢复该节点处理' : '屏蔽该节点(输入直通输出)'}
              aria-label={disabledNode ? '恢复该节点处理' : '屏蔽该节点'}
              aria-pressed={disabledNode}
              className={disabledNode ? 'nc-bypass on' : 'nc-bypass'}
            >⊘</button>
          )}
          <button onClick={() => onMove(-1)} title="上移" aria-label="上移">↑</button>
          <button onClick={() => onMove(1)} title="下移" aria-label="下移">↓</button>
          <button onClick={onRemove} title="删除" aria-label="删除" className="nc-danger">×</button>
          <button
            ref={addBtnRef}
            className={`nc-add-toggle${addMenuOpen ? ' is-open' : ''}`}
            title="在此节点之后插入"
            aria-label="在此节点之后插入"
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            onClick={e => { e.stopPropagation(); setAddMenuOpen(x => !x); }}
          >+</button>
        </span>
        <AddNodeMenu
          triggerRef={addBtnRef}
          open={addMenuOpen}
          onClose={() => setAddMenuOpen(false)}
          onPick={type => onAddAfter(type)}
          align="right"
        />
        <button className="nc-toggle" onClick={e => { e.stopPropagation(); onToggleExpanded(); }} aria-label={expanded ? '折叠' : '展开'}>
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="nc-body">
          {/* Meta row: category + output status (moved out of head for breathing room) */}
          <div className={`nc-meta${err ? ' is-err' : ''}`}>
            <span className="nc-cat">{def.category}</span>
            {err
              ? <span className="nc-status nc-err">{err}</span>
              : disabledNode
                ? <span className="nc-status nc-bypassed">已屏蔽 · 直通 {outCount} pts</span>
                : <span className="nc-status">{outCount} pts</span>}
          </div>
          {def.type === 'filter_ransac_line' && (
            <div className="nc-note">⚠ RANSAC 结果有随机性,重算可能变化</div>
          )}
          {def.type === 'filter_ransac_line' && node.params.enableProjection === 1 && (
            <div className="nc-note">⚠ 启用投影会清空姿态数据(rx/ry/rz 归零)</div>
          )}
          {def.type === 'slice' && (frame?.meta as any)?.note && (
            <div className="nc-note">⚠ {(frame?.meta as any).note}</div>
          )}
          {def.type === 'filter_path_segmentor' && (frame?.meta as any)?.segments && (
            <div className="nc-seg-summary">
              {((frame!.meta as any).segments as { start: number; end: number; type: string }[])
                .map((s, i) => (
                  <button key={i}
                    className={`seg-chip${s.type === 'curve' ? ' curve' : ''}${node.params.output_segment === i ? ' on' : ''}`}
                    onClick={e => { e.stopPropagation(); onParams({ output_segment: i }); }}
                    title={`段${i}: [${s.start}, ${s.end}] ${s.type === 'curve' ? '曲线' : '直线'}`}
                  >{i}</button>
                ))}
              <button
                className={`seg-chip all${node.params.output_segment === -1 ? ' on' : ''}`}
                onClick={e => { e.stopPropagation(); onParams({ output_segment: -1 }); }}
                title="输出全部路径"
              >全</button>
            </div>
          )}
          {/* 源节点:文件选择(拖放目标为整张卡片) */}
          {def.isSource && (
            <label className="nc-file" onClick={e => e.stopPropagation()}>
              <input type="file" accept=".csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              <span>{(frame?.meta as any)?.fileName ?? '选择 CSV / 拖入'}</span>
              {(frame?.meta as any)?.hasRotation && <span className="hint"> 含姿态</span>}
            </label>
          )}
          {/* 算法/工具节点:参数 */}
          {def.params.map(spec => {
            // slice 节点:拉环 max 按总点数动态限制,保证起点/长度不超范围
            let maxOverride: number | undefined;
            if (def.type === 'slice') {
              const total = (frame?.meta as any)?.sliced?.total as number | undefined;
              if (typeof total === 'number') {
                const curStart = Math.min(Math.floor(node.params.start ?? 0), total);
                maxOverride = spec.key === 'start' ? total : Math.max(0, total - curStart);
              }
            }
            // path_segmentor:output_segment 拉环 max 随实际段数动态扩展(-1=全路径常驻)
            if (def.type === 'filter_path_segmentor' && spec.key === 'output_segment') {
              const segs = (frame?.meta as any)?.segments;
              if (Array.isArray(segs)) maxOverride = Math.max(0, segs.length - 1);
            }
            return (
              <NumCtrl key={spec.key} spec={spec} value={node.params[spec.key] ?? spec.default}
                allParams={node.params}
                maxOverride={maxOverride}
                onChange={v => onParams({ [spec.key]: v })} />
            );
          })}
          {/* 终点节点:导出按钮 */}
          {def.isSink && (
            <button className="nc-export" onClick={e => { e.stopPropagation(); onExport?.(); }}
              disabled={!frame || frame.points.length === 0}>
              <Icon name="send" size={14} /><span>推送到 pathview</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
