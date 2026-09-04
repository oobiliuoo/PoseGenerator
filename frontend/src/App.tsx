import { useMemo, useState } from 'react';
import { usePipeline } from './hooks/usePipeline';
import { NodeChain } from './components/NodeChain';
import { NodeResult } from './components/NodeResult';
import { AllNodesView } from './components/AllNodesView';
import { PipelineBar } from './components/PipelineBar';
import { BackendStatus } from './components/BackendStatus';
import { Icon } from './components/icons';
import { NODE_REGISTRY } from './lib/nodeRegistry';
import { PLANE_LABELS, type Plane } from './components/Preview2D';

const PLANES: Plane[] = ['xy', 'xz', 'yz'];

export default function App() {
  const { pipeline, outputs, selectedNodeId, selectedOutput, loading,
    builtinPipelines, customPipelines, actions } = usePipeline();

  // 折叠的节点 id 集合。「全部折叠/展开」与单个节点的折叠按钮共用。
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const allCollapsed = pipeline.nodes.length > 0 && pipeline.nodes.every(n => collapsedIds.has(n.id));
  const toggleAll = (collapsed: boolean) => {
    setCollapsedIds(collapsed ? new Set(pipeline.nodes.map(n => n.id)) : new Set());
  };
  const toggleOne = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 结果区视图模式:single=选中节点完整视图;all=全部节点投影小图
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  // 2D 投影全局视角与姿态显示(操作栏控制,单/全部模式共用)
  const [plane, setPlane] = useState<Plane>('xy');
  const [showPose, setShowPose] = useState(true);

  // 选中节点的 label(用于 CSV 导出文件名)
  const selectedNodeName = useMemo(() => {
    const node = pipeline.nodes.find(n => n.id === selectedNodeId);
    return node ? (NODE_REGISTRY[node.type]?.label ?? node.type) : null;
  }, [pipeline.nodes, selectedNodeId]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark"><Icon name="brand" size={18} /></span>
          <h1>PoseGenerator<span className="sub">点位流水线 · ZYX</span></h1>
        </div>
        <BackendStatus />
      </header>

      <div className="layout">
        <aside className="left">
          <div className="panel">
            <div className="panel-head panel-head-row">
              <span className="title">节点链</span>
              <span className="badge">
                {pipeline.nodes.length} 节点
                <button className="link nc-collapse-all" onClick={() => toggleAll(!allCollapsed)} disabled={pipeline.nodes.length === 0}>
                  {allCollapsed ? '全部展开' : '全部折叠'}
                </button>
              </span>
            </div>
            <div className="panel-body">
              <NodeChain
                nodes={pipeline.nodes}
                outputs={outputs}
                selectedNodeId={selectedNodeId}
                collapsedIds={collapsedIds}
                onToggleOne={toggleOne}
                onSelect={actions.setSelectedNodeId}
                onParams={actions.updateNodeParams}
                onToggleEnabled={actions.toggleNodeEnabled}
                onRemove={actions.removeNode}
                onMove={actions.moveNode}
                onAddNode={actions.addNode}
                onCsvFile={(_id, name, text) => actions.loadCsv(name, text)}
                onExport={actions.exportToPathview}
              />
            </div>
          </div>
        </aside>

        <main className={`right right--${viewMode}`}>
          {viewMode === 'single'
            ? <NodeResult frame={selectedOutput} loading={loading} nodeName={selectedNodeName} plane={plane} showPose={showPose} />
            : <AllNodesView
                nodes={pipeline.nodes}
                outputs={outputs}
                selectedNodeId={selectedNodeId}
                loading={loading}
                plane={plane}
                showPose={showPose}
              />}
        </main>
      </div>

      <PipelineBar
        current={pipeline}
        builtinPipelines={builtinPipelines}
        customPipelines={customPipelines}
        onSelect={actions.selectPipeline}
        onSave={actions.saveCurrentAs}
        onDelete={actions.removePipeline}
        onImportNodes={actions.importPipelineNodes}
        onRunAll={actions.runAll}
        loading={loading}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        plane={plane}
        onPlaneChange={setPlane}
        showPose={showPose}
        onToggleShowPose={() => setShowPose(v => !v)}
      />
    </div>
  );
}