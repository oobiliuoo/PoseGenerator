import type { GenerateParams, InitialPose, PosePreset } from '../types';
import { DEFAULT_PARAMS, DEFAULT_INITIAL_POSE } from '../types';

const STORAGE_KEY = 'pose_generator_custom_presets';

export const BUILTIN_PRESETS: PosePreset[] = [
  {
    name: '默认',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: { ...DEFAULT_PARAMS },
    builtin: true,
  },
  {
    name: '波纹板',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: {
      ...DEFAULT_PARAMS,
      curvature_threshold: 0.07,
      smooth_half_width: 2,
      tangent_smooth_window: 5,
      min_corner_region_length: 1,
    },
    builtin: true,
  },
  {
    name: '圆形闭环',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: {
      ...DEFAULT_PARAMS,
      curvature_threshold: 0.001,
      all_curve_threshold: 0.6,
      smooth_half_width: 0,
      tangent_smooth_window: 5,
    },
    builtin: true,
  },
  {
    name: '一般弧形',
    initial_pose: { ...DEFAULT_INITIAL_POSE },
    params: {
      ...DEFAULT_PARAMS,
      output_mode: 1,            // KEYPOINTS
      max_pose_change_angle: 30.0,
      keypoint_pose_angle_threshold: 3.0,
    },
    builtin: true,
  },
];

export function loadCustomPresets(): PosePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PosePreset[];
    return arr.filter(p => p && p.name && p.params && p.initial_pose);
  } catch { return []; }
}

export function saveCustomPreset(p: PosePreset): PosePreset[] {
  const list = loadCustomPresets().filter(x => x.name !== p.name);
  list.push({ ...p, builtin: false });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function deleteCustomPreset(name: string): PosePreset[] {
  const list = loadCustomPresets().filter(x => x.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}