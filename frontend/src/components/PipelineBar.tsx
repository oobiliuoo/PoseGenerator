import { useState } from 'react';
import type { Pipeline } from '../types';
import { BackendStatus } from './BackendStatus';

interface Props {
  current: Pipeline;
  builtinPipelines: Pipeline[];
  customPipelines: Pipeline[];
  onSelect: (p: Pipeline) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  onRunAll: () => void;
  loading: boolean;
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
        <button onClick={() => { setNaming(true); setDraft(current.name === '默认' ? '我的流水线' : current.name); }}>+ 保存当前</button>
      )}
      <span className="preset-sep" aria-hidden="true" />
      <button className="pb-run" onClick={props.onRunAll} disabled={props.loading}>{props.loading ? '运行中…' : '运行全部'}</button>
      <span style={{ marginLeft: 'auto' }}><BackendStatus /></span>
    </div>
  );
}