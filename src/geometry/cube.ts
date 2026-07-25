import { BoxGeometry, Float32BufferAttribute } from "three";
import type { BBCubeElement, BBCubeFace, BBCubeFaceDirection, BBVector4 } from "../types.js";
import type { BBElementGeometry, BBFaceSpan, ResolveUVSize } from "./types.js";

export const CUBE_FACE_ORDER: readonly BBCubeFaceDirection[] = [
  "east",
  "west",
  "up",
  "down",
  "south",
  "north",
];

function boxUV(element: BBCubeElement, direction: BBCubeFaceDirection): BBVector4 {
  const size = element.to.map((value, index) => Math.abs(value - (element.from[index] ?? value))) as [
    number,
    number,
    number,
  ];
  const [x, y, z] = size;
  const definitions: Record<BBCubeFaceDirection, { from: [number, number]; size: [number, number] }> = {
    east: { from: [0, z], size: [z, y] },
    west: { from: [z + x, z], size: [z, y] },
    up: { from: [z + x, z], size: [-x, -z] },
    down: { from: [z + x * 2, 0], size: [-x, z] },
    south: { from: [z * 2 + x, z], size: [x, y] },
    north: { from: [z, z], size: [x, y] },
  };
  const current = definitions[direction];
  const from = [...current.from] as [number, number];
  const faceSize = [...current.size] as [number, number];

  if (element.mirror_uv === true) {
    from[0] += faceSize[0];
    faceSize[0] *= -1;
    if (direction === "east" || direction === "west") {
      const otherDirection = direction === "east" ? "west" : "east";
      const other = definitions[otherDirection];
      from[0] = other.from[0] + other.size[0];
      faceSize[0] = -other.size[0];
    }
  }

  const offset = element.uv_offset ?? [0, 0];
  return [
    from[0] + offset[0],
    from[1] + offset[1],
    from[0] + faceSize[0] + offset[0],
    from[1] + faceSize[1] + offset[1],
  ];
}

function uvForFace(
  element: BBCubeElement,
  direction: BBCubeFaceDirection,
  face: BBCubeFace,
  resolveUVSize: ResolveUVSize,
): number[] {
  const uv = element.box_uv === true ? boxUV(element, direction) : (face.uv ?? [0, 0, 0, 0]);
  const [width, height] = resolveUVSize(face.texture);
  const safeWidth = width || 16;
  const safeHeight = height || 16;
  const result = [
    [uv[0] / safeWidth, 1 - uv[1] / safeHeight],
    [uv[2] / safeWidth, 1 - uv[1] / safeHeight],
    [uv[0] / safeWidth, 1 - uv[3] / safeHeight],
    [uv[2] / safeWidth, 1 - uv[3] / safeHeight],
  ];
  let rotation = ((face.rotation ?? 0) % 360 + 360) % 360;
  while (rotation >= 90) {
    const first = result[0];
    const second = result[1];
    const third = result[2];
    const fourth = result[3];
    if (first !== undefined && second !== undefined && third !== undefined && fourth !== undefined) {
      result[0] = third;
      result[1] = first;
      result[2] = fourth;
      result[3] = second;
    }
    rotation -= 90;
  }
  return result.flat();
}

export function cubeRescale(element: BBCubeElement): [number, number, number] {
  if (element.rescale !== true) return [1, 1, 1];
  const rotation = element.rotation ?? [0, 0, 0];
  const factor = rotation.map((value) => {
    let angle = Math.abs(value) % 90;
    if (angle > 45) angle = 90 - angle;
    return 1 / Math.cos((angle * Math.PI) / 180);
  });
  return [
    (factor[1] ?? 1) * (factor[2] ?? 1),
    (factor[0] ?? 1) * (factor[2] ?? 1),
    (factor[0] ?? 1) * (factor[1] ?? 1),
  ];
}

export function buildCubeGeometry(
  element: BBCubeElement,
  unitScale: number,
  resolveUVSize: ResolveUVSize,
): BBElementGeometry {
  const stretch = element.stretch ?? [1, 1, 1];
  const inflate = element.inflate ?? 0;
  const from: [number, number, number] = [...element.from];
  const to: [number, number, number] = [...element.to];
  for (let axis = 0; axis < 3; axis += 1) {
    const start = element.from[axis] ?? 0;
    const end = element.to[axis] ?? start;
    const half = (end - start) / 2;
    const center = start + half;
    const axisStretch = stretch[axis] ?? 1;
    from[axis] = center - (half + inflate) * axisStretch;
    to[axis] = center + (half + inflate) * axisStretch;
  }

  const size = from.map((value, axis) => Math.max(Math.abs((to[axis] ?? value) - value), 0.001) * unitScale) as [
    number,
    number,
    number,
  ];
  const origin = element.origin ?? [0, 0, 0];
  const center = from.map(
    (value, axis) => (((to[axis] ?? value) + value) / 2 - (origin[axis] ?? 0)) * unitScale,
  ) as [number, number, number];
  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(center[0], center[1], center[2]);

  const sourceIndex = geometry.getIndex();
  const uvAttribute = geometry.getAttribute("uv");
  const uvs = new Float32Array(uvAttribute.count * 2);
  const indices: number[] = [];
  const faces: BBFaceSpan[] = [];
  geometry.clearGroups();

  CUBE_FACE_ORDER.forEach((direction, faceIndex) => {
    const face = element.faces[direction] ?? {};
    uvs.set(uvForFace(element, direction, face, resolveUVSize), faceIndex * 8);
    if (face.texture === null || face.enabled === false || sourceIndex === null) return;
    const start = indices.length;
    for (let offset = 0; offset < 6; offset += 1) {
      indices.push(sourceIndex.getX(faceIndex * 6 + offset));
    }
    const span: BBFaceSpan = {
      start,
      count: 6,
      texture: face.texture,
      tint: face.tint ?? -1,
      source: face,
    };
    faces.push(span);
    geometry.addGroup(start, 6, faces.length - 1);
  });

  geometry.setIndex(indices);
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.blockbenchElement = element;
  return { element, geometry, faces };
}
