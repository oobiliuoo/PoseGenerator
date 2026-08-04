import { useState } from 'react';
import type { Pipeline } from '../types';
import { Icon } from './icons';
import { PLANE_LABELS, type Plane } from './Preview2D';

interface Props {
  current: Pipeline;
  builtinPipelines: Pipeline[];
  customPipelines: Pipeline[];
  onSelect: (p: Pipeline) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  onRunAll: () => void;
  loading: boolean;
  viewMode: 'single' | 'all';
  onSetViewMode: (m: 'single' | 'all') => void;
  plane: Plane;
  onPlaneChange: (p: Plane) => void;
  showPose: boolean;
  onToggleShowPose: () => void;
}

export function PipelineBar(props: Props) {
  const { current, builtinPipelines, customPipelines } = props;
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');

  const save = () => {
    const name = draft.trim();
    if (!name) { setNaming(false); return; }
    props.onSave(name);
    setNaming(false); setDraft('');
  };

  return (
    <div className="pipeline-bar action-bar">
      <span className="pb-label">流水线</span>
      {builtinPipelines.map(p => (
        <button key={p.name} className={current.name === p.name ? 'seg-on' : ''} onClick={() => props.onSelect(p)}>{p.name}</button>
      ))}
      {customPipelines.length > 0 && <span className="preset-sep" aria-hidden="true" />}
      {customPipelines.map(p => (
        <span key={p.name} className="preset-item">
          <button className={current.name === p.name ? 'seg-on' : ''} onClick={() => props.onSelect(p)}>{p.name}</button>
          <button className="del" onClick={() => props.onDelete(p.name)} aria-label={`删除 ${p.name}`}>×</button>
        </span>
      ))}
      {naming ? (
        <span className="preset-name-input">
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); }}
            placeholder="流水线名称" autoFocus />
          <button className="primary" onClick={save} disabled={!draft.trim()}>保存</button>
          <button onClick={() => setNaming(false)}>取消</button>
        </span>
      ) : (
        <button onClick={() => { setNaming(true); setDraft(current.name === '默认' ? '我的流水线' : current.name); }}>
          <Icon name="save" size={14} /><span>保存当前</span>
        </button>
      )}
      <span className="preset-sep" aria-hidden="true" />
      <button className="pb-run" onClick={props.onRunAll} disabled={props.loading}>
        <Icon name="play" size={14} /><span>{props.loading ? '运行中…' : '运行全部'}</span>
      </button>
      <span className="preset-sep" aria-hidden="true" />
      <div className="seg" role="tablist" aria-label="投影平面">
        {(['xy', 'xz', 'yz'] as Plane[]).map(p => (
          <button
            key={p}
            role="tab"
            aria-selected={props.plane === p}
            className={props.plane === p ? 'seg-on' : ''}
            onClick={() => props.onPlaneChange(p)}
          >{PLANE_LABELS[p]}</button>
        ))}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.showPose}
        aria-label="显示姿态方向"
        className={props.showPose ? 'pose-toggle on' : 'pose-toggle'}
        onClick={props.onToggleShowPose}
        title={props.showPose ? '隐藏姿态方向' : '显示姿态方向'}
      >
        <span className="pose-toggle-dot" aria-hidden="true" />
        姿态
      </button>
      <span className="pb-tail">
        <div className="seg" role="tablist" aria-label="视图模式">
          <button
            role="tab"
            aria-selected={props.viewMode === 'single'}
            className={props.viewMode === 'single' ? 'seg-on' : ''}
            onClick={() => props.onSetViewMode('single')}
            title="仅显示选中节点"
          >单节点</button>
          <button
            role="tab"
            aria-selected={props.viewMode === 'all'}
            className={props.viewMode === 'all' ? 'seg-on' : ''}
            onClick={() => props.onSetViewMode('all')}
            title="显示全部节点投影"
          >全部节点</button>
        </div>
      </span>
    </div>
  );
}