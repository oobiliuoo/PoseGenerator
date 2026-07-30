import { useEffect, useMemo, useState } from 'react';
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

/** Compute lightweight path statistics from a list of 3D points. */
function computeStats(pts: Point[]) {
  if (pts.length === 0) {
    return { count: 0, length: 0, bbox: null as null | { dx: number; dy: number; dz: number } };
  }
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let length = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    if (i > 0) {
      const q = pts[i - 1];
      length += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    }
  }
  return { count: pts.length, length, bbox: { dx: maxX - minX, dy: maxY - minY, dz: maxZ - minZ } };
}

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

  const stats = useMemo(() => computeStats(points), [points]);

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

  const resetParams = () => {
    setParams({ ...DEFAULT_PARAMS });
    setInitialPose({ ...DEFAULT_INITIAL_POSE });
  };

  const onLoaded = (pts: Point[], rots: Rotation[] | null, name: string, ignored: number, error?: string) => {
    setPoints(pts); setCsvRotations(rots); setFileName(name); setIgnored(ignored); setCsvErr(error ?? null);
    // Default the initial pose to the first input point's pose when present,
    // so generate() seeds from the CSV's real attitude instead of the fixed
    // (0, 45, 178) default.
    if (rots && rots.length > 0) {
      setInitialPose({ rx: rots[0].rx, ry: rots[0].ry, rz: rots[0].rz });
      setPoseSrc('csv');
    } else {
      setPoseSrc('generated');
    }
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

  // Cmd/Ctrl + E → export to pathview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (!exporting && enabled && posePoints.length > 0) exportToPathview();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting, enabled, posePoints, fileName]);

  const canExport = enabled && posePoints.length > 0 && !exporting;

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>
            PoseGenerator
            <span className="sub">姿态调控台 · ZYX</span>
          </h1>
        </div>
        <BackendStatus />
      </header>

      <div className="layout">
        <aside className="left">
          <div className="panel">
            <div className="panel-head">
              <span className="title">参数预设</span>
              <span className="badge">PRESETS</span>
            </div>
            <PresetBar current={currentPreset} onApply={applyPreset} />
          </div>

          <div className="panel">
            <div className="panel-head panel-head-row">
              <span className="title">算法参数</span>
              <button className="link" onClick={resetParams} title="恢复默认参数">重置</button>
            </div>
            <div className="panel-body">
              <ParamsPanel params={params} initialPose={initialPose}
                onParams={setParams} onInitialPose={setInitialPose} />
            </div>
          </div>
        </aside>

        <main className="right">
          <div className="panel preview-panel">
            <div className="panel-head panel-head-row">
              <span className="title">2D 投影预览</span>
              <span className="badge">
                {posePoints.length} PTS
                {loading && <span className="loading-dot" aria-label="生成中" />}
              </span>
            </div>
            <div className="panel-body">
              <Preview2D points={posePoints} />
            </div>
          </div>

          <div className="panel table-panel">
            <div className="panel-head">
              <span className="title">位姿数据流</span>
              <span className="badge">{posePoints.length} × 6</span>
            </div>
            <div className="panel-head pose-src-bar">
              {hasCsvRot ? (
                <div className="seg" role="tablist" aria-label="姿态来源">
                  <button role="tab" aria-selected={poseSrc === 'csv'} className={poseSrc === 'csv' ? 'seg-on' : ''} onClick={() => setPoseSrc('csv')}>CSV 原始</button>
                  <button role="tab" aria-selected={poseSrc === 'generated'} className={poseSrc === 'generated' ? 'seg-on' : ''} onClick={() => setPoseSrc('generated')}>算法生成</button>
                </div>
              ) : <span className="kv">算法生成 · ZYX</span>}
            </div>
            {posePoints.length === 0 ? (
              <div className="table-empty">
                <span className="kv">尚无数据</span>
                <p>导入至少 3 个点的 CSV 后,这里会显示完整位姿流。</p>
              </div>
            ) : (
              <PoseTable points={posePoints} />
            )}
          </div>

          {error && <div className="err inline-err">生成失败: {error}</div>}
        </main>
      </div>

      <div className="action-bar" role="region" aria-label="主操作">
        <div className="ab-file">
          <CsvImport onLoaded={onLoaded} fileName={fileName}
            pointCount={points.length} ignored={ignored} error={csvErr}
            hasRotation={hasCsvRot} />
        </div>
        <div className="ab-stats">
          {points.length === 0 ? (
            <span className="ab-empty">尚未导入</span>
          ) : (
            <>
              <span className="ab-stat"><span className="k">PTS</span><span className="v">{stats.count}</span></span>
              <span className="ab-stat"><span className="k">LEN</span><span className="v">{stats.length.toFixed(3)}</span></span>
              {stats.bbox && (
                <span className="ab-stat">
                  <span className="k">BBOX</span>
                  <span className="v">
                    Δ{stats.bbox.dx.toFixed(2)} × Δ{stats.bbox.dy.toFixed(2)} × Δ{stats.bbox.dz.toFixed(2)}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
        <div className="ab-actions">
          {exportErr && <span className="ab-err" role="alert">{exportErr}</span>}
          <span className="ab-hint" aria-hidden="true">⌘/Ctrl + E</span>
          <button
            className="primary-cta"
            onClick={exportToPathview}
            disabled={!canExport}
            aria-keyshortcuts="Control+E Meta+E"
          >
            {exporting ? '导出中…' : '在 pathview 中查看'}
            <span className="cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}