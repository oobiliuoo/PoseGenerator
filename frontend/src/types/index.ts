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

// =========================================================================
// 流水线 (Pipeline) 类型
// =========================================================================

/** 节点间数据契约:点序列 + 开放 meta map。 */
export interface PoseFrame {
  points: PosePoint[];
  meta: Record<string, unknown>;
}

/** 空帧(源节点无输入时用)。 */
export const EMPTY_FRAME: PoseFrame = { points: [], meta: {} };

/** 节点参数 schema 项。 */
export interface NodeParamSpec {
  key: string;
  label: string;
  type: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: number; label: string }[];
  default: number;
  /** 拖到偶数自动 +1 (tangent_smooth_window 用)。 */
  forcedOdd?: boolean;
  /** 条件禁用:返回 true 时该参数灰掉。 */
  disabledWhen?: (params: Record<string, number>) => boolean;
  /** 禁用时的提示文案。 */
  disabledHint?: string;
}

/** 执行上下文:前端节点用不到,算法节点用它发后端请求。 */
export interface ExecCtx {
  /** 算法节点调后端的 fetch 函数(便于测试时注入 mock)。 */
  executeNode: (nodeType: string, input: PoseFrame, params: Record<string, number>) => Promise<PoseFrame>;
}

/** 节点定义(注册表项)。 */
export interface NodeDef {
  type: string;
  label: string;
  category: 'io' | 'algorithm' | 'tool';
  isSource: boolean;
  isSink: boolean;
  params: NodeParamSpec[];
  /** input 为 null 表示源节点。返回输出 frame 或抛错。 */
  execute: (input: PoseFrame | null, params: Record<string, number>, ctx: ExecCtx) => Promise<PoseFrame>;
  /** 该节点能可视化哪些 meta key(用户可开关)。第一阶段 pose_generate 为空。 */
  visualizableMeta?: string[];
}

/** 流水线中的一个节点实例。 */
export interface PipelineNode {
  id: string;                       // 实例唯一 id(同一类型可多次出现)
  type: string;                     // 指向 NODE_REGISTRY 的 key
  params: Record<string, number>;   // 按 NodeParamSpec.key 存值
}

/** 一条流水线定义。 */
export interface Pipeline {
  name: string;
  nodes: PipelineNode[];
  builtin?: boolean;
}