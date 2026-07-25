export type BBVector2 = [number, number];
export type BBVector3 = [number, number, number];
export type BBVector4 = [number, number, number, number];
export type BBExpressionValue = number | string;
export type BBTextureReference = string | number | false | null;

export interface BBMeta extends Record<string, unknown> {
  format_version: string;
  model_format: string;
  box_uv?: boolean;
  backup?: boolean;
}

export interface BBResolution extends Record<string, unknown> {
  width: number;
  height: number;
}

export interface BBTextureLayer extends Record<string, unknown> {
  uuid: string;
  name?: string;
  data_url?: string;
  width?: number;
  height?: number;
  opacity?: number;
  blend_mode?: string;
  visible?: boolean;
  offset?: BBVector2;
  scale?: BBVector2;
}

export type BBTextureRenderMode = "default" | "emissive" | "additive" | "layered";
export type BBTextureRenderSides = "auto" | "front" | "double";
export type BBTextureWrapMode = "limited" | "repeat" | "clamp";

export interface BBTextureData extends Record<string, unknown> {
  uuid: string;
  name: string;
  id?: string;
  group?: string;
  source?: string;
  path?: string;
  relative_path?: string;
  internal?: boolean;
  visible?: boolean;
  width?: number;
  height?: number;
  uv_width?: number;
  uv_height?: number;
  render_mode?: BBTextureRenderMode;
  render_sides?: BBTextureRenderSides;
  wrap_mode?: BBTextureWrapMode;
  pbr_channel?: "color" | "normal" | "height" | "mer";
  fps?: number;
  frame_time?: number;
  frame_order_type?: "loop" | "backwards" | "back_and_forth" | "custom";
  frame_order?: string;
  frame_interpolate?: boolean;
  layers_enabled?: boolean;
  layers?: BBTextureLayer[];
}

export interface BBTextureGroupMaterialConfig extends Record<string, unknown> {
  color_value?: BBVector4;
  mer_value?: BBVector3;
  subsurface_value?: number;
}

export interface BBTextureGroup extends Record<string, unknown> {
  uuid: string;
  name?: string;
  is_material?: boolean;
  material_config?: BBTextureGroupMaterialConfig;
}

export interface BBCubeFace extends Record<string, unknown> {
  uv?: BBVector4;
  texture?: BBTextureReference;
  rotation?: 0 | 90 | 180 | 270 | number;
  cullface?: "" | "north" | "south" | "east" | "west" | "up" | "down";
  tint?: number;
  material_name?: string;
  enabled?: boolean;
}

export type BBCubeFaceDirection = "east" | "west" | "up" | "down" | "south" | "north";
export type BBCubeFaces = Partial<Record<BBCubeFaceDirection, BBCubeFace>>;

export interface BBMeshFace extends Record<string, unknown> {
  vertices: string[];
  uv?: Record<string, BBVector2>;
  texture?: BBTextureReference;
}

export type BBElementRenderOrder = "default" | "behind" | "in_front";

export interface BBElementBase extends Record<string, unknown> {
  type: string;
  uuid: string;
  name?: string;
  origin?: BBVector3;
  rotation?: BBVector3;
  visibility?: boolean;
  export?: boolean;
  color?: number;
  shade?: boolean;
  render_order?: BBElementRenderOrder;
}

export interface BBCubeElement extends BBElementBase {
  type: "cube";
  from: BBVector3;
  to: BBVector3;
  faces: BBCubeFaces;
  inflate?: number;
  stretch?: BBVector3;
  mirror_uv?: boolean;
  box_uv?: boolean;
  uv_offset?: BBVector2;
  rescale?: boolean;
  light_emission?: number;
}

export interface BBMeshElement extends BBElementBase {
  type: "mesh";
  vertices: Record<string, BBVector3>;
  faces: Record<string, BBMeshFace>;
  seams?: Record<string, boolean>;
  shading?: "flat" | "smooth";
}

export interface BBGroup extends Record<string, unknown> {
  uuid: string;
  name: string;
  origin?: BBVector3;
  rotation?: BBVector3;
  visibility?: boolean;
  export?: boolean;
  shade?: boolean;
  mirror_uv?: boolean;
  reset?: boolean;
  bedrock_binding?: string;
  texture?: string;
}

export interface BBOutlinerGroup extends Record<string, unknown> {
  uuid: string;
  children: BBOutlinerNode[];
  isOpen?: boolean;
  name?: string;
  origin?: BBVector3;
  rotation?: BBVector3;
}

export type BBOutlinerNode = string | BBOutlinerGroup;

export type BBAnimationLoop = "once" | "loop" | "hold";
export type BBInterpolation = "linear" | "catmullrom" | "bezier" | "step";
export type BBTransformChannel = "rotation" | "position" | "scale";
export type BBEffectChannel = "sound" | "particle" | "timeline";

export interface BBKeyframeDataPoint extends Record<string, unknown> {
  x?: BBExpressionValue;
  y?: BBExpressionValue;
  z?: BBExpressionValue;
  effect?: string;
  file?: string;
  locator?: string;
  script?: string;
}

export interface BBKeyframe extends Record<string, unknown> {
  uuid: string;
  channel: BBTransformChannel | BBEffectChannel | string;
  time: number;
  interpolation?: BBInterpolation;
  data_points: BBKeyframeDataPoint[];
  uniform?: boolean;
  bezier_linked?: boolean;
  bezier_left_time?: BBVector3;
  bezier_left_value?: BBVector3;
  bezier_right_time?: BBVector3;
  bezier_right_value?: BBVector3;
}

export interface BBAnimator extends Record<string, unknown> {
  name: string;
  type: "bone" | "element" | "effect" | string;
  keyframes?: BBKeyframe[];
  rotation_global?: boolean;
  quaternion_interpolation?: boolean;
}

export interface BBAnimation extends Record<string, unknown> {
  uuid: string;
  name: string;
  loop?: BBAnimationLoop;
  override?: boolean;
  length: number;
  snapping?: number;
  anim_time_update?: string;
  blend_weight?: string;
  start_delay?: string;
  loop_delay?: string;
  markers?: Array<{ time: number; color?: number }>;
  animators: Record<string, BBAnimator>;
}

export interface BBDisplayTransform extends Record<string, unknown> {
  rotation?: BBVector3;
  translation?: BBVector3;
  scale?: BBVector3;
}

export interface BBAnimationControllerTransition extends Record<string, unknown> {
  target: string;
  condition: string;
}

export interface BBAnimationControllerState extends Record<string, unknown> {
  uuid: string;
  name: string;
  animations?: string[];
  transitions?: BBAnimationControllerTransition[];
  on_entry?: string[];
  on_exit?: string[];
}

export interface BBAnimationController extends Record<string, unknown> {
  uuid: string;
  name: string;
  type?: "animation_controller" | string;
  initial_state?: string;
  states?: BBAnimationControllerState[];
}

export interface BBModelDocument extends Record<string, unknown> {
  meta: BBMeta;
  resolution: BBResolution;
  elements: BBElementBase[];
  groups: BBGroup[];
  outliner: BBOutlinerNode[];
  textures: BBTextureData[];
  texture_groups?: BBTextureGroup[];
  animations?: BBAnimation[];
  animation_controllers?: BBAnimationController[];
  animation_variable_placeholders?: string;
  display?: Record<string, BBDisplayTransform>;
  collections?: Array<Record<string, unknown>>;
  reference_images?: Array<Record<string, unknown>>;
}

export function isCubeElement(element: BBElementBase): element is BBCubeElement {
  return (
    element.type === "cube" &&
    Array.isArray(element.from) &&
    Array.isArray(element.to) &&
    typeof element.faces === "object" &&
    element.faces !== null
  );
}

export function isMeshElement(element: BBElementBase): element is BBMeshElement {
  return (
    element.type === "mesh" &&
    typeof element.vertices === "object" &&
    element.vertices !== null &&
    typeof element.faces === "object" &&
    element.faces !== null
  );
}
