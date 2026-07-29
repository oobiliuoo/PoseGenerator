export interface Point { x: number; y: number; z: number; }

export interface Rotation { rx: number; ry: number; rz: number; }

export interface PosePoint extends Point { rx: number; ry: number; rz: number; }

export type OutputMode = 0 | 1; // 0=FULL, 1=KEYPOINTS

export interface GenerateParams {
  curvature_threshold: number;
  smooth_half_width: number;
  tangent_smooth_window: number;     // forced odd on the UI side
  min_corner_region_length: number;
  output_mode: OutputMode;
  max_pose_change_angle: number;
  all_curve_threshold: number;
  keypoint_pose_angle_threshold: number;
}

export interface InitialPose { rx: number; ry: number; rz: number; }

export interface GenerateRequest {
  points: Point[];
  initial_pose: InitialPose;
  params: GenerateParams;
}

export interface GenerateResponse {
  result: PosePoint[];
  point_count: number;
}

export interface PosePreset {
  name: string;
  initial_pose: InitialPose;
  params: GenerateParams;
  builtin?: boolean;
}

export const DEFAULT_PARAMS: GenerateParams = {
  curvature_threshold: 0.07,
  smooth_half_width: 2,
  tangent_smooth_window: 5,
  min_corner_region_length: 2,
  output_mode: 0,
  max_pose_change_angle: 45.0,
  all_curve_threshold: 0.8,
  keypoint_pose_angle_threshold: 5.0,
};

export const DEFAULT_INITIAL_POSE: InitialPose = { rx: 0, ry: 45, rz: 178 };