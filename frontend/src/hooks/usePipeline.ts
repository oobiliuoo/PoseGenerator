import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pipeline, PoseFrame, ExecCtx } from '../types';
import { runPipeline, getOutput, type NodeOutput } from '../lib/pipeline';
import { NODE_REGISTRY, makeNode, setCsvFile } from '../lib/nodeRegistry';
import { BUILTIN_PIPELINES, loadPipelines, savePipeline, deletePipeline } from '../lib/pipelinesStore';
import { executeNode as apiExecuteNode } from '../api/node';

const DEBOUNCE_MS = 300;

export function usePipeline() {
  const [pipeline, setPipeline] = useState<Pipeline>(BUILTIN_PIPELINES[0]);
  const [outputs, setOutputs] = useState<Record<string, NodeOutput>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customPipelines, setCustomPipelines] = useState<Pipeline[]>(() => loadPipelines());
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputsRef = useRef<Record<string, NodeOutput>>({});

  const ctx: ExecCtx = {
    executeNode: (nodeType, input, params) => apiExecuteNode(nodeType, input, params, abortRef.current?.signal),
  };

  // 跑流水线:从 fromIndex 开始。可选立即跑(不等 debounce)。
  const run = useCallback(async (nodes: Pipeline['nodes'], fromIndex: number, immediate = false) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const doRun = async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const out = await runPipeline(nodes, fromIndex, ctx, outputsRef.current);
        outputsRef.current = out;
        setOutputs(out);
      } finally {
        setLoading(false);
      }
    };
    if (immediate) {
      await doRun();
    } else {
      debounceTimer.current = setTimeout(doRun, DEBOUNCE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 节点参数变更:标记该节点及下游脏,debounce 重算。
  const updateNodeParams = useCallback((nodeId: string, patch: Record<string, number>) => {
    setPipeline(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      if (idx < 0) return prev;
      const nodes = prev.nodes.map((n, i) =>
        i === idx ? { ...n, params: { ...n.params, ...patch } } : n
      );
      run(nodes, idx);
      return { ...prev, nodes };
    });
  }, [run]);

  // CSV 文件载入:写文本 + 触发 csv_input 重算(及下游)
  const loadCsv = useCallback((name: string, text: string) => {
    setCsvFile(name, text);
    setPipeline(prev => {
      const csvNode = prev.nodes.find(n => n.type === 'csv_input');
      if (csvNode) run(prev.nodes, prev.nodes.indexOf(csvNode));
      return prev;
    });
  }, [run]);

  // 增删/移动节点
  const addNode = useCallback((type: string, afterId?: string) => {
    setPipeline(prev => {
      const node = makeNode(type);
      let nodes: typeof prev.nodes;
      let insertIdx: number;
      if (afterId) {
        const idx = prev.nodes.findIndex(n => n.id === afterId);
        nodes = [...prev.nodes.slice(0, idx + 1), node, ...prev.nodes.slice(idx + 1)];
        insertIdx = idx + 1;
      } else {
        nodes = [...prev.nodes, node];
        insertIdx = nodes.length - 1;
      }
      run(nodes, insertIdx);
      return { ...prev, nodes };
    });
  }, [run]);

  const removeNode = useCallback((nodeId: string) => {
    setPipeline(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      if (idx < 0) return prev;
      const nodes = prev.nodes.filter(n => n.id !== nodeId);
      const fromIdx = Math.max(0, idx - 1);
      run(nodes, fromIdx);
      return { ...prev, nodes };
    });
    // 若删的是当前选中节点,指向新的末节点(或空)
    setSelectedNodeId(prevId => {
      if (prevId !== nodeId) return prevId;
      const nodes = pipeline.nodes.filter(n => n.id !== nodeId);
      return nodes.length > 0 ? nodes[nodes.length - 1].id : null;
    });
  }, [run, pipeline.nodes]);

  const moveNode = useCallback((nodeId: string, dir: -1 | 1) => {
    setPipeline(prev => {
      const idx = prev.nodes.findIndex(n => n.id === nodeId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.nodes.length) return prev;
      const nodes = [...prev.nodes];
      [nodes[idx], nodes[target]] = [nodes[target], nodes[idx]];
      run(nodes, Math.min(idx, target));
      return { ...prev, nodes };
    });
  }, [run]);

  // 运行全部(立即,从头)
  const runAll = useCallback(() => {
    run(pipeline.nodes, 0, true);
  }, [pipeline.nodes, run]);

  // 选中节点(默认选末节点)
  useEffect(() => {
    if (!selectedNodeId && pipeline.nodes.length > 0) {
      setSelectedNodeId(pipeline.nodes[pipeline.nodes.length - 1].id);
    }
  }, [pipeline.nodes, selectedNodeId]);

  // 流水线切换/保存/删除
  const selectPipeline = useCallback((p: Pipeline) => {
    setPipeline(p);
    setOutputs({});
    outputsRef.current = {};
    setSelectedNodeId(p.nodes[p.nodes.length - 1]?.id ?? null);
    run(p.nodes, 0, true);
  }, [run]);

  const saveCurrentAs = useCallback((name: string) => {
    const p: Pipeline = { name, nodes: pipeline.nodes.map(n => ({ ...n, params: { ...n.params } })) };
    const list = savePipeline(p);
    setCustomPipelines(list);
  }, [pipeline]);

  const removePipeline = useCallback((name: string) => {
    const list = deletePipeline(name);
    setCustomPipelines(list);
  }, []);

  const selectedOutput: PoseFrame | null = selectedNodeId ? getOutput(outputs, selectedNodeId) : null;

  return {
    pipeline,
    outputs,
    selectedNodeId,
    selectedOutput,
    loading,
    builtinPipelines: BUILTIN_PIPELINES,
    customPipelines,
    actions: {
      setSelectedNodeId,
      updateNodeParams,
      loadCsv,
      addNode,
      removeNode,
      moveNode,
      runAll,
      selectPipeline,
      saveCurrentAs,
      removePipeline,
    },
  };
}