import type { BufferGeometry } from "three";
import type { BBCubeFace, BBElementBase, BBMeshFace, BBTextureReference } from "../types.js";

export interface BBFaceSpan {
  start: number;
  count: number;
  texture: BBTextureReference | undefined;
  tint: number;
  source: BBCubeFace | BBMeshFace;
}

export interface BBElementGeometry {
  element: BBElementBase;
  geometry: BufferGeometry;
  faces: BBFaceSpan[];
}

export type ResolveUVSize = (reference: BBTextureReference | undefined) => readonly [number, number];
