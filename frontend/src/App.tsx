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
  const [csvErr, setCsvErr] = useState<string | null>(null);
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

  const onLoaded = (pts: Point[], name: string, ignored: number, error?: string) => {
    setPoints(pts); setFileName(name); setIgnored(ignored); setCsvErr(error ?? null);
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
      <header>
        <h1>
          PoseGenerator
          <span className="sub">姿态调控台 · ZYX</span>
        </h1>
        <BackendStatus />
      </header>
      <div className="layout">
        <aside className="left">
          <div className="panel">
            <div className="panel-head">
              <span className="title">路径输入</span>
              <span className="badge">CSV · x,y,z</span>
            </div>
            <div className="panel-body">
              <CsvImport onLoaded={onLoaded} fileName={fileName}
                pointCount={points.length} ignored={ignored} error={csvErr} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="title">参数预设</span>
              <span className="badge">PRESETS</span>
            </div>
            <PresetBar current={currentPreset} onApply={applyPreset} />
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="title">算法参数</span>
              <span className="badge">PARAMS</span>
            </div>
            <div className="panel-body">
              <ParamsPanel params={params} initialPose={initialPose}
                onParams={setParams} onInitialPose={setInitialPose} />
              <button className="export-btn" onClick={exportToPathview}
                disabled={!enabled || exporting || posePoints.length === 0}>
                {exporting ? '导出中…' : '在 pathview 中查看  →'}
              </button>
              {exportErr && <div className="err">{exportErr}</div>}
              {error && <div className="err">生成失败: {error}</div>}
            </div>
          </div>
        </aside>

        <main className="right">
          <div className="panel">
            <div className="panel-head">
              <span className="title">2D 投影 · XY 俯视</span>
              <span className="badge">{posePoints.length} PTS</span>
            </div>
            <div className="panel-body">
              <Preview2D points={posePoints} />
            </div>
          </div>
        </main>

        <section className="right">
          <div className="panel">
            <div className="panel-head">
              <span className="title">位姿数据流</span>
              <span className="badge">{posePoints.length} × 6</span>
            </div>
            <PoseTable points={posePoints} />
          </div>
        </section>
      </div>
    </div>
  );
}
