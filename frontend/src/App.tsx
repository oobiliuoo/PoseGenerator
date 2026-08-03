import { useMemo, useState } from 'react';
import { usePipeline } from './hooks/usePipeline';
import { NodeChain } from './components/NodeChain';
import { NodeResult } from './components/NodeResult';
import { PipelineBar } from './components/PipelineBar';
import { NODE_REGISTRY } from './lib/nodeRegistry';

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

  // 选中节点的 label(用于 CSV 导出文件名)
  const selectedNodeName = useMemo(() => {
    const node = pipeline.nodes.find(n => n.id === selectedNodeId);
    return node ? (NODE_REGISTRY[node.type]?.label ?? node.type) : null;
  }, [pipeline.nodes, selectedNodeId]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>PoseGenerator<span className="sub">点位流水线 · ZYX</span></h1>
        </div>
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
                onRemove={actions.removeNode}
                onMove={actions.moveNode}
                onAddNode={actions.addNode}
                onCsvFile={(_id, name, text) => actions.loadCsv(name, text)}
                onExport={actions.exportToPathview}
              />
            </div>
          </div>
        </aside>

        <main className="right">
          <NodeResult frame={selectedOutput} loading={loading} nodeName={selectedNodeName} />
        </main>
      </div>

      <PipelineBar
        current={pipeline}
        builtinPipelines={builtinPipelines}
        customPipelines={customPipelines}
        onSelect={actions.selectPipeline}
        onSave={actions.saveCurrentAs}
        onDelete={actions.removePipeline}
        onRunAll={actions.runAll}
        loading={loading}
      />
    </div>
  );
}