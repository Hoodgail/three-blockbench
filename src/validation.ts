import { BBModelError } from "./errors.js";
import type { BBModelDocument } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function assertOutliner(nodes: unknown[], path: string): void {
  nodes.forEach((node, index) => {
    if (typeof node === "string") return;
    if (!isRecord(node) || !hasString(node, "uuid") || !Array.isArray(node.children)) {
      throw new BBModelError("Outliner entries must be element UUIDs or group nodes with children.", `${path}[${index}]`);
    }
    assertOutliner(node.children, `${path}[${index}].children`);
  });
}

function normalizeAnimations(record: Record<string, unknown>): void {
  if (record.animations === undefined) return;
  if (!Array.isArray(record.animations)) {
    throw new BBModelError("animations must be an array.", "animations");
  }
  record.animations.forEach((animation, animationIndex) => {
    const path = `animations[${animationIndex}]`;
    if (!isRecord(animation)) throw new BBModelError("Every animation must be an object.", path);
    if (!hasString(animation, "uuid")) animation.uuid = `animation_${animationIndex}`;
    if (!hasString(animation, "name")) animation.name = `animation_${animationIndex}`;
    if (typeof animation.length !== "number") animation.length = 0;
    const animators = isRecord(animation.animators) ? animation.animators : {};
    animation.animators = animators;
    for (const [animatorID, animator] of Object.entries(animators)) {
      const animatorPath = `${path}.animators.${animatorID}`;
      if (!isRecord(animator)) throw new BBModelError("Every animator must be an object.", animatorPath);
      if (!hasString(animator, "name")) animator.name = animatorID;
      if (!hasString(animator, "type")) animator.type = animatorID === "effects" ? "effect" : "bone";
      const keyframes = Array.isArray(animator.keyframes) ? animator.keyframes : [];
      animator.keyframes = keyframes;
      keyframes.forEach((keyframe, keyframeIndex) => {
        const keyframePath = `${animatorPath}.keyframes[${keyframeIndex}]`;
        if (!isRecord(keyframe)) throw new BBModelError("Every keyframe must be an object.", keyframePath);
        if (!hasString(keyframe, "uuid")) keyframe.uuid = `${animation.uuid}_${animatorID}_${keyframeIndex}`;
        if (!hasString(keyframe, "channel")) throw new BBModelError("A keyframe needs a channel.", keyframePath);
        if (typeof keyframe.time !== "number") keyframe.time = 0;
        const dataPoints = Array.isArray(keyframe.data_points) ? keyframe.data_points : [];
        keyframe.data_points = dataPoints;
        dataPoints.forEach((point, pointIndex) => {
          if (!isRecord(point)) {
            throw new BBModelError("Every keyframe data point must be an object.", `${keyframePath}.data_points[${pointIndex}]`);
          }
        });
      });
    }
  });
}

function assertDocument(value: unknown): asserts value is BBModelDocument {
  if (!isRecord(value)) throw new BBModelError("A .bbmodel must contain a JSON object.");
  if (!isRecord(value.meta)) throw new BBModelError("Missing required meta object.", "meta");

  if (!hasString(value.meta, "format_version") && hasString(value.meta, "format")) {
    value.meta.format_version = value.meta.format;
  }
  if (!hasString(value.meta, "format_version")) {
    throw new BBModelError("Missing meta.format_version.", "meta.format_version");
  }
  if (!hasString(value.meta, "model_format")) {
    value.meta.model_format = value.meta.bone_rig === true ? "bedrock_old" : "java_block";
  }

  const resolution = isRecord(value.resolution) ? value.resolution : { width: 16, height: 16 };
  value.resolution = resolution;
  if (typeof resolution.width !== "number" || typeof resolution.height !== "number") {
    throw new BBModelError("resolution.width and resolution.height must be numbers.", "resolution");
  }

  const elements = Array.isArray(value.elements)
    ? value.elements
    : Array.isArray(value.cubes) ? value.cubes : [];
  const groups = Array.isArray(value.groups) ? value.groups : [];
  const outliner = Array.isArray(value.outliner) ? value.outliner : [];
  const textures = Array.isArray(value.textures) ? value.textures : [];
  value.elements = elements;
  value.groups = groups;
  value.outliner = outliner;
  value.textures = textures;
  assertOutliner(outliner, "outliner");

  for (const [index, element] of elements.entries()) {
    if (!isRecord(element) || !hasString(element, "uuid")) {
      throw new BBModelError("Every element must have a string UUID.", `elements[${index}]`);
    }
    if (!hasString(element, "type")) element.type = "cube";
  }

  for (const [index, group] of groups.entries()) {
    if (!isRecord(group) || !hasString(group, "uuid")) {
      throw new BBModelError("Every group must have a string UUID.", `groups[${index}]`);
    }
    if (!hasString(group, "name")) group.name = `group_${index}`;
  }

  for (const [index, texture] of textures.entries()) {
    if (!isRecord(texture)) {
      throw new BBModelError("Every texture entry must be an object.", `textures[${index}]`);
    }
    if (!hasString(texture, "uuid")) texture.uuid = `texture_${index}`;
    if (!hasString(texture, "name")) texture.name = `texture_${index}`;
    if (texture.layers !== undefined && !Array.isArray(texture.layers)) texture.layers = [];
  }

  if (value.texture_groups !== undefined && !Array.isArray(value.texture_groups)) value.texture_groups = [];
  if (value.animation_controllers !== undefined && !Array.isArray(value.animation_controllers)) {
    value.animation_controllers = [];
  }
  if (value.display !== undefined && !isRecord(value.display)) value.display = {};
  normalizeAnimations(value);
}

export function parseBBModelDocument(input: string | ArrayBuffer | unknown): BBModelDocument {
  let parsed: unknown = input;
  try {
    if (typeof input === "string") parsed = JSON.parse(input);
    if (input instanceof ArrayBuffer) parsed = JSON.parse(new TextDecoder().decode(input));
  } catch (cause: unknown) {
    throw new BBModelError("The .bbmodel file is not valid JSON.", undefined, { cause });
  }

  assertDocument(parsed);
  return parsed;
}

export function compareFormatVersion(version: string, target: string): number {
  const left = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = target.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
