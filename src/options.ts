import type { EulerOrder, Material, Texture } from "three";
import type {
  BBCubeFace,
  BBElementBase,
  BBExpressionValue,
  BBMeshFace,
  BBTextureData,
  BBTextureGroup,
  BBTextureReference,
} from "./types.js";

export interface BBModelExpressionContext {
  animation: string;
  animator: string;
  channel: string;
  axis: "x" | "y" | "z";
  time: number;
}

export type BBModelExpressionEvaluator = (
  expression: BBExpressionValue,
  context: BBModelExpressionContext,
) => number;

export interface BBModelTextureLoadContext {
  url: string;
  texture: BBTextureData;
}

export type BBModelTextureFactory = (context: BBModelTextureLoadContext) => Promise<Texture>;

export interface BBModelMaterialContext {
  element: BBElementBase;
  face: BBCubeFace | BBMeshFace;
  texture: Texture | null;
  textureData: BBTextureData | null;
  textureGroup: BBTextureGroup | null;
  textureReference: BBTextureReference | undefined;
  shade: boolean;
  color: number;
  tint: number;
  lightEmission: number;
}

export type BBModelMaterialFactory = (context: BBModelMaterialContext) => Material;

export interface BBModelLoaderOptions {
  /** Three.js units per Blockbench pixel. Defaults to 1 / 16. */
  unitScale?: number;
  /** Override Blockbench's format Euler order. Generic projects default to ZYX. */
  eulerOrder?: EulerOrder;
  /** Load image assets. Disable for server-side geometry inspection. Defaults to true. */
  loadTextures?: boolean;
  /** Sample rate for nonlinear animation, or `snapping` to use each clip's timeline rate. */
  animationSampleRate?: number | "snapping";
  /** Safety ceiling for sampled animation. Defaults to 120 samples per second. */
  maxAnimationSampleRate?: number;
  /** Throw instead of warning when a referenced object is missing. */
  strict?: boolean;
  expressionEvaluator?: BBModelExpressionEvaluator;
  textureFactory?: BBModelTextureFactory;
  materialFactory?: BBModelMaterialFactory;
}

export interface ResolvedBBModelLoaderOptions {
  unitScale: number;
  eulerOrder: EulerOrder;
  loadTextures: boolean;
  animationSampleRate: number | "snapping";
  maxAnimationSampleRate: number;
  strict: boolean;
  expressionEvaluator?: BBModelExpressionEvaluator;
  textureFactory?: BBModelTextureFactory;
  materialFactory?: BBModelMaterialFactory;
}

export function resolveOptions(options: BBModelLoaderOptions = {}): ResolvedBBModelLoaderOptions {
  const resolved: ResolvedBBModelLoaderOptions = {
    unitScale: options.unitScale ?? 1 / 16,
    eulerOrder: options.eulerOrder ?? "ZYX",
    loadTextures: options.loadTextures ?? true,
    animationSampleRate: options.animationSampleRate ?? "snapping",
    maxAnimationSampleRate: options.maxAnimationSampleRate ?? 120,
    strict: options.strict ?? false,
  };
  if (options.expressionEvaluator !== undefined) resolved.expressionEvaluator = options.expressionEvaluator;
  if (options.textureFactory !== undefined) resolved.textureFactory = options.textureFactory;
  if (options.materialFactory !== undefined) resolved.materialFactory = options.materialFactory;
  return resolved;
}
