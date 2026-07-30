import { usePipeline } from './hooks/usePipeline';
import { NodeChain } from './components/NodeChain';
import { NodeResult } from './components/NodeResult';
import { PipelineBar } from './components/PipelineBar';

export default function App() {
  const { pipeline, outputs, selectedNodeId, selectedOutput, loading,
    builtinPipelines, customPipelines, actions } = usePipeline();

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
            <div className="panel-head"><span className="title">节点链</span><span className="badge">{pipeline.nodes.length} 节点</span></div>
            <div className="panel-body">
              <NodeChain
                nodes={pipeline.nodes}
                outputs={outputs}
                selectedNodeId={selectedNodeId}
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
          <NodeResult frame={selectedOutput} loading={loading} />
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