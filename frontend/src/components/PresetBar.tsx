import { useEffect, useState } from 'react';
import type { PosePreset } from '../types';
import { BUILTIN_PRESETS, loadCustomPresets, saveCustomPreset, deleteCustomPreset } from '../lib/presets';

interface Props {
  current: PosePreset; // current params+pose packed
  onApply: (p: PosePreset) => void;
}

export function PresetBar({ current, onApply }: Props) {
  const [custom, setCustom] = useState<PosePreset[]>([]);
  useEffect(() => { setCustom(loadCustomPresets()); }, []);

  const save = () => {
    const name = window.prompt('预设名称', '我的预设');
    if (!name) return;
    setCustom(saveCustomPreset({ ...current, name }));
  };
  const remove = (name: string) => setCustom(deleteCustomPreset(name));

  return (
    <div className="preset-bar">
      <span>预设: </span>
      {BUILTIN_PRESETS.map(p => (
        <button key={p.name} onClick={() => onApply(p)}>{p.name}</button>
      ))}
      <span style={{ margin: '0 8px' }}>|</span>
      {custom.map(p => (
        <span key={p.name} className="preset-item">
          <button onClick={() => onApply(p)}>{p.name}</button>
          <button className="del" onClick={() => remove(p.name)}>×</button>
        </span>
      ))}
      <button onClick={save}>保存当前为预设</button>
    </div>
  );
}