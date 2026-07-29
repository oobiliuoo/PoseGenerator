import { useMemo, useState } from 'react';
import type { GenerateParams, InitialPose, Point, PosePoint, PosePreset, Rotation } from './types';
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
  const [csvRotations, setCsvRotations] = useState<Rotation[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [ignored, setIgnored] = useState(0);
  const [csvErr, setCsvErr] = useState<string | null>(null);
  const [params, setParams] = useState<GenerateParams>({ ...DEFAULT_PARAMS });
  const [initialPose, setInitialPose] = useState<InitialPose>({ ...DEFAULT_INITIAL_POSE });
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  /** which pose stream to view/export: generated (algorithm) vs csv (original) */
  const [poseSrc, setPoseSrc] = useState<'generated' | 'csv'>('generated');

  const req = useMemo(() => ({
    points,
    initial_pose: initialPose,
    params,
  }), [points, initialPose, params]);

  const enabled = points.length >= 3;
  const { result, error, loading } = useGenerate(req, enabled);
  const generatedPoints = result?.result ?? [];

  // The active pose stream selected by the toggle (csv only when present).
  const hasCsvRot = !!csvRotations && csvRotations.length === points.length;
  const csvPosePoints: PosePoint[] = useMemo(() => hasCsvRot
    ? points.map((p, i) => ({ ...p, ...csvRotations![i] }))
    : [], [points, csvRotations, hasCsvRot]);
  const posePoints = poseSrc === 'csv' && hasCsvRot ? csvPosePoints : generatedPoints;

  const currentPreset: PosePreset = useMemo(() => ({
    name: '_current', initial_pose: initialPose, params,
  }), [initialPose, params]);

  const applyPreset = (p: PosePreset) => {
    setParams({ ...p.params });
    setInitialPose({ ...p.initial_pose });
  };

  const onLoaded = (pts: Point[], rots: Rotation[] | null, name: string, ignored: number, error?: string) => {
    setPoints(pts); setCsvRotations(rots); setFileName(name); setIgnored(ignored); setCsvErr(error ?? null);
    if (rots) setPoseSrc('csv'); else setPoseSrc('generated');
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
                pointCount={points.length} ignored={ignored} error={csvErr}
                hasRotation={hasCsvRot} />
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
            <div className="panel-head pose-src-bar" style={{ borderTop: 'none', borderBottom: '1px solid var(--line)' }}>
              {hasCsvRot ? (
                <div className="seg">
                  <button className={poseSrc === 'csv' ? 'seg-on' : ''} onClick={() => setPoseSrc('csv')}>CSV 原始</button>
                  <button className={poseSrc === 'generated' ? 'seg-on' : ''} onClick={() => setPoseSrc('generated')}>算法生成</button>
                </div>
              ) : <span className="kv">算法生成 · ZYX</span>}
            </div>
            <PoseTable points={posePoints} />
          </div>
        </section>
      </div>
    </div>
  );
}

