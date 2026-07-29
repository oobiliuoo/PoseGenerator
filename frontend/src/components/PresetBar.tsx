import { useEffect, useRef, useState } from 'react';
import type { PosePreset } from '../types';
import { BUILTIN_PRESETS, loadCustomPresets, saveCustomPreset, deleteCustomPreset } from '../lib/presets';

interface Props {
  current: PosePreset; // current params+pose packed
  onApply: (p: PosePreset) => void;
}

export function PresetBar({ current, onApply }: Props) {
  const [custom, setCustom] = useState<PosePreset[]>([]);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCustom(loadCustomPresets()); }, []);
  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  const commit = () => {
    const name = draft.trim();
    if (!name) { setNaming(false); setDraft(''); return; }
    setCustom(saveCustomPreset({ ...current, name }));
    setNaming(false); setDraft('');
  };
  const cancel = () => { setNaming(false); setDraft(''); };
  const remove = (name: string) => setCustom(deleteCustomPreset(name));

  return (
    <div className="preset-bar">
      <span className="preset-bar-label">预设</span>
      {BUILTIN_PRESETS.map(p => (
        <button key={p.name} onClick={() => onApply(p)} title={p.name}>{p.name}</button>
      ))}
      {custom.length > 0 && <span className="preset-sep" aria-hidden="true" />}
      {custom.map(p => (
        <span key={p.name} className="preset-item">
          <button onClick={() => onApply(p)} title={p.name}>{p.name}</button>
          <button
            className="del"
            onClick={() => remove(p.name)}
            aria-label={`删除预设 ${p.name}`}
            title="删除预设"
          >×</button>
        </span>
      ))}

      {naming ? (
        <span className="preset-name-input">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            placeholder="预设名称"
            maxLength={32}
            aria-label="新预设名称"
          />
          <button className="primary" onClick={commit} disabled={!draft.trim()}>保存</button>
          <button onClick={cancel}>取消</button>
        </span>
      ) : (
        <button onClick={() => { setNaming(true); setDraft('我的预设'); }}>+ 保存当前</button>
      )}
    </div>
  );
}