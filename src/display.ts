import { Group, type EulerOrder, type Object3D } from "three";
import type { BBDisplayTransform, BBModelDocument } from "./types.js";

export function applyBBDisplayTransform<T extends Object3D>(
  object: T,
  transform: BBDisplayTransform,
  unitScale = 1 / 16,
  eulerOrder: EulerOrder = "XYZ",
): T {
  const translation = transform.translation ?? [0, 0, 0];
  const rotation = transform.rotation ?? [0, 0, 0];
  const scale = transform.scale ?? [1, 1, 1];
  object.position.set(
    translation[0] * unitScale,
    translation[1] * unitScale,
    translation[2] * unitScale,
  );
  object.rotation.set(
    rotation[0] * Math.PI / 180,
    rotation[1] * Math.PI / 180,
    rotation[2] * Math.PI / 180,
    eulerOrder,
  );
  object.scale.fromArray(scale);
  return object;
}

export function createBBDisplayGroup(
  document: BBModelDocument,
  slot: string,
  unitScale = 1 / 16,
  eulerOrder: EulerOrder = "XYZ",
): Group | null {
  const transform = document.display?.[slot];
  if (transform === undefined) return null;
  const group = new Group();
  group.name = `display.${slot}`;
  group.userData.blockbenchDisplaySlot = slot;
  return applyBBDisplayTransform(group, transform, unitScale, eulerOrder);
}
