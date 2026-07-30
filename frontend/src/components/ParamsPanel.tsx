import type { GenerateParams, InitialPose, OutputMode } from '../types';

interface Props {
  params: GenerateParams;
  initialPose: InitialPose;
  onParams: (p: GenerateParams) => void;
  onInitialPose: (p: InitialPose) => void;
}

/**
 * Compact numeric control: label + number readout share one line, slider
 * gets its own line. Saves ~30% vertical space versus the standard
 * slider+number-on-second-row layout.
 */
function NumControl(props: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; hint?: string;
}) {
  const { label, value, min, max, step, onChange, disabled, hint } = props;
  return (
    <div className={`ctrl compact${disabled ? ' is-disabled' : ''}`}>
      <label>
        <span className="ctrl-name">
          {label}
          {hint && <span className="hint">{hint}</span>}
        </span>
        <input type="number" min={min} max={max} step={step} value={value}
          disabled={disabled}
          onChange={e => {
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
        />
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

/** Compact select (same single-row pattern as NumControl). */
function SelControl(props: {
  label: string; value: number; options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <div className="ctrl compact">
      <label>
        <span className="ctrl-name">{label}</span>
        <select value={value} onChange={e => onChange(Number(e.target.value))}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    </div>
  );
}

export function ParamsPanel({ params, initialPose, onParams, onInitialPose }: Props) {
  const setP = (patch: Partial<GenerateParams>) => onParams({ ...params, ...patch });
  // tangent_smooth_window forced odd
  const setTsw = (v: number) => {
    const i = Math.max(1, Math.round(v));
    setP({ tangent_smooth_window: i % 2 === 0 ? i + 1 : i });
  };
  // keypoint threshold active only when output_mode==KEYPOINTS (per spec, conservative rule).
  const kpDisabled = params.output_mode !== 1;

  return (
    <div className="params-panel">
      <h3>初始姿态 (度, ZYX)</h3>
      <NumControl label="rx" value={initialPose.rx} min={-180} max={180} step={0.5}
        onChange={v => onInitialPose({ ...initialPose, rx: v })} />
      <NumControl label="ry" value={initialPose.ry} min={-180} max={180} step={0.5}
        onChange={v => onInitialPose({ ...initialPose, ry: v })} />
      <NumControl label="rz" value={initialPose.rz} min={-180} max={180} step={0.5}
        onChange={v => onInitialPose({ ...initialPose, rz: v })} />

      <h3>算法参数</h3>
      <NumControl label="curvature_threshold" value={params.curvature_threshold}
        min={0} max={0.5} step={0.001} onChange={v => setP({ curvature_threshold: v })} />
      <NumControl label="smooth_half_width" value={params.smooth_half_width}
        min={0} max={50} step={1} onChange={v => setP({ smooth_half_width: Math.round(v) })} />
      <NumControl label="tangent_smooth_window" value={params.tangent_smooth_window}
        min={1} max={51} step={1} onChange={setTsw} hint="强制奇数" />
      <NumControl label="min_corner_region_length" value={params.min_corner_region_length}
        min={1} max={50} step={1} onChange={v => setP({ min_corner_region_length: Math.round(v) })} />
      <SelControl label="output_mode" value={params.output_mode}
        options={[{ value: 0 as OutputMode, label: 'FULL' }, { value: 1 as OutputMode, label: 'KEYPOINTS' }]}
        onChange={v => setP({ output_mode: v as OutputMode })} />
      <NumControl label="max_pose_change_angle" value={params.max_pose_change_angle}
        min={0} max={180} step={0.5} onChange={v => setP({ max_pose_change_angle: v })} />
      <NumControl label="all_curve_threshold" value={params.all_curve_threshold}
        min={0} max={1} step={0.01} onChange={v => setP({ all_curve_threshold: v })} />
      <NumControl label="keypoint_pose_angle_threshold" value={params.keypoint_pose_angle_threshold}
        min={0} max={90} step={0.5} disabled={kpDisabled}
        onChange={v => setP({ keypoint_pose_angle_threshold: v })}
        hint={kpDisabled ? '仅 KEYPOINTS 模式' : undefined} />
    </div>
  );
}