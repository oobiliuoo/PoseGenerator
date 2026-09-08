import { useEffect, useRef, useState } from 'react';
import type { Pipeline } from '../types';
import { Icon } from './icons';
import { PLANE_LABELS, type Plane } from './Preview2D';
import { downloadPipelineJson, readPipelineJson, decodePipeline } from '../lib/pipelineCodec';

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
  onImportNodes: (nodes: Pipeline['nodes']) => void;
}

export function PipelineBar(props: Props) {
  const { current, builtinPipelines, customPipelines } = props;
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 竖向滚轮映射为横向滚动:React onWheel 是 passive 的,preventDefault 需原生监听
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onImportFile = async (f: File) => {
    try {
      const text = await readPipelineJson(f);
      const nodes = await decodePipeline(JSON.parse(text));
      if (nodes.length === 0) return;
      props.onImportNodes(nodes);
    } catch {
      // 文件损坏/后端不可达:静默忽略
    }
  };

  const save = () => {
    const name = draft.trim();
    if (!name) { setNaming(false); return; }
    props.onSave(name);
    setNaming(false); setDraft('');
  };

  return (
    <div className="pipeline-bar action-bar">
      {/* 组1:流水线管理(左) — 列表横向滚动,滚轮映射为横向 */}
      <span className="pb-label">流水线</span>
      <div ref={scrollRef} className="pb-scroll">
        {builtinPipelines.map(p => (
          <button key={p.name} className={current.name === p.name ? 'seg-on' : ''} onClick={() => props.onSelect(p)}>{p.name}</button>
        ))}
        {customPipelines.length > 0 && <span className="preset-sep" aria-hidden="true" />}
        {customPipelines.map(p => (
          <button key={p.name} className={current.name === p.name ? 'seg-on' : ''} onClick={() => props.onSelect(p)}>{p.name}</button>
        ))}
      </div>
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
      <button onClick={() => downloadPipelineJson(current).catch(err => console.error('导出失败', err))} title="导出为 MWS_PathFilterAndPoseGenerator 序列化文件">
        <span>导出</span>
      </button>
      <button onClick={() => importFileRef.current?.click()} title="从序列化文件快速构建节点链">
        <span>导入</span>
      </button>
      <button
        onClick={() => props.onDelete(current.name)}
        disabled={!customPipelines.some(p => p.name === current.name)}
        title={customPipelines.some(p => p.name === current.name) ? `删除流水线 ${current.name}` : '内置流水线不可删除'}
      >
        <span>删除</span>
      </button>
      <input ref={importFileRef} type="file" accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ''; }} />
      {/* 组2:运行(中) */}
      <span className="preset-sep" aria-hidden="true" />
      <button className="pb-run" onClick={props.onRunAll} disabled={props.loading}>
        <Icon name="play" size={14} /><span>{props.loading ? '运行中…' : '运行全部'}</span>
      </button>
      {/* 组3:预览视图(右) — 视角 + 姿态 + 视图模式 */}
      <span className="pb-tail">
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
        <span className="preset-sep" aria-hidden="true" />
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