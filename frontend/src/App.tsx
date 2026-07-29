import { useMemo, useState } from 'react';
import type { GenerateParams, InitialPose, Point, PosePreset } from './types';
import { DEFAULT_INITIAL_POSE, DEFAULT_PARAMS } from './types';
import { CsvImport } from './components/CsvImport';
import { ParamsPanel } from './components/ParamsPanel';
import { PresetBar } from './components/PresetBar';
import { Preview2D } from './components/Preview2D';
import { PoseTable } from './components/PoseTable';
import { BackendStatus } from './components/BackendStatus';
import { useGenerate } from './hooks/useGenerate';
import { sendToPathview, openPathview } from './api/pathview';

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [ignored, setIgnored] = useState(0);
  const [params, setParams] = useState<GenerateParams>({ ...DEFAULT_PARAMS });
  const [initialPose, setInitialPose] = useState<InitialPose>({ ...DEFAULT_INITIAL_POSE });
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const req = useMemo(() => ({
    points,
    initial_pose: initialPose,
    params,
  }), [points, initialPose, params]);

  const enabled = points.length >= 3;
  const { result, error, loading } = useGenerate(req, enabled);
  const posePoints = result?.result ?? [];

  const currentPreset: PosePreset = useMemo(() => ({
    name: '_current', initial_pose: initialPose, params,
  }), [initialPose, params]);

  const applyPreset = (p: PosePreset) => {
    setParams({ ...p.params });
    setInitialPose({ ...p.initial_pose });
  };

  const onLoaded = (pts: Point[], name: string) => {
    setPoints(pts); setFileName(name); setIgnored(0);
  };

  const exportToPathview = async () => {
    if (posePoints.length === 0) return;
    setExporting(true); setExportErr(null);
    try {
      await sendToPathview(posePoints, fileName ?? 'pose');
      openPathview();
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <header><h1>PoseGenerator</h1><BackendStatus /></header>
      <div className="layout">
        <aside className="left">
          <CsvImport onLoaded={onLoaded} fileName={fileName}
            pointCount={points.length} ignored={ignored} />
          <PresetBar current={currentPreset} onApply={applyPreset} />
          <ParamsPanel params={params} initialPose={initialPose}
            onParams={setParams} onInitialPose={setInitialPose} />
          <button onClick={exportToPathview} disabled={!enabled || exporting || posePoints.length === 0}>
            {exporting ? '导出中…' : '在 pathview 中查看 →'}
          </button>
          {exportErr && <div className="err">{exportErr}</div>}
          {error && <div className="err">生成失败: {error}</div>}
        </aside>
        <main className="right">
          <Preview2D points={posePoints} />
          <PoseTable points={posePoints} />
        </main>
      </div>
    </div>
  );
}
