import {
  AnimationClip,
  Euler,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import type { BBModelWarning } from "../errors.js";
import type { ResolvedBBModelLoaderOptions } from "../options.js";
import type {
  BBAnimation,
  BBAnimator,
  BBEffectChannel,
  BBKeyframe,
  BBModelDocument,
  BBTransformChannel,
} from "../types.js";
import { createSampleContext, sampleQuaternionRotation, sampleTransformChannel } from "./interpolation.js";

export interface BBModelEffect {
  animation: BBAnimation;
  animator: BBAnimator;
  keyframe: BBKeyframe;
  channel: BBEffectChannel | string;
  time: number;
}

export interface BBAnimationBuildResult {
  clips: AnimationClip[];
  effects: Map<string, BBModelEffect[]>;
}

const TRANSFORM_CHANNELS: readonly BBTransformChannel[] = ["position", "rotation", "scale"];

function sampleRate(animation: BBAnimation, options: ResolvedBBModelLoaderOptions): number {
  const requested = options.animationSampleRate === "snapping"
    ? (animation.snapping ?? 20)
    : options.animationSampleRate;
  return Math.max(1, Math.min(options.maxAnimationSampleRate, requested));
}

function sampleTimes(animation: BBAnimation, keyframes: BBKeyframe[], options: ResolvedBBModelLoaderOptions): number[] {
  const values = new Set<number>([0, Math.max(0, animation.length)]);
  const interval = 1 / sampleRate(animation, options);
  for (let time = 0; time < animation.length; time += interval) values.add(Number(time.toFixed(6)));
  keyframes.forEach((keyframe) => {
    values.add(Math.max(0, Math.min(animation.length, keyframe.time)));
    if (keyframe.data_points.length > 1 && keyframe.time < animation.length) {
      values.add(Math.min(animation.length, keyframe.time + Math.min(0.004, interval / 4)));
    }
  });
  return [...values].sort((left, right) => left - right);
}

function targetID(target: Object3D | null): string | null {
  const value = target?.userData.blockbenchUUID;
  return typeof value === "string" ? value : null;
}

export function buildAnimationClips(
  document: BBModelDocument,
  targets: ReadonlyMap<string, Object3D>,
  options: ResolvedBBModelLoaderOptions,
  warnings: BBModelWarning[],
): BBAnimationBuildResult {
  const clips: AnimationClip[] = [];
  const effects = new Map<string, BBModelEffect[]>();
  const warnedExpressions = new Set<string>();

  for (const animation of document.animations ?? []) {
    const tracks: Array<VectorKeyframeTrack | QuaternionKeyframeTrack> = [];
    const clipEffects: BBModelEffect[] = [];
    const animators = new Map(Object.entries(animation.animators));
    const worldQuaternionCache = new Map<string, Quaternion>();

    const rotationAt = (id: string, time: number): Quaternion => {
      const cacheKey = `${id}:${time}`;
      const cached = worldQuaternionCache.get(cacheKey);
      if (cached !== undefined) return cached.clone();
      const target = targets.get(id);
      if (target === undefined) return new Quaternion();
      const animator = animators.get(id);
      const keyframes = animator?.keyframes?.filter((keyframe) => keyframe.channel === "rotation") ?? [];
      let local = target.quaternion.clone();
      if (animator !== undefined && keyframes.length > 0) {
        const context = createSampleContext(
          animation,
          id,
          animator,
          "rotation",
          document.meta.format_version,
          options,
          warnings,
          warnedExpressions,
        );
        if (animator.quaternion_interpolation === true) {
          local = sampleQuaternionRotation(keyframes, time, target.rotation, context);
        } else {
          const value = sampleTransformChannel(keyframes, time, context);
          local = new Quaternion().setFromEuler(new Euler(
            target.rotation.x + value[0] * Math.PI / 180,
            target.rotation.y + value[1] * Math.PI / 180,
            target.rotation.z + value[2] * Math.PI / 180,
            options.eulerOrder,
          ));
        }
      }
      const parentID = targetID(target.parent);
      const parentWorld = parentID === null ? new Quaternion() : rotationAt(parentID, time);
      if (animator?.rotation_global === true) local.premultiply(parentWorld.clone().invert());
      const world = parentWorld.multiply(local);
      worldQuaternionCache.set(cacheKey, world.clone());
      return world;
    };

    for (const [animatorID, animator] of animators) {
      if (animator.type === "effect" || animatorID === "effects") {
        for (const keyframe of animator.keyframes ?? []) {
          clipEffects.push({ animation, animator, keyframe, channel: keyframe.channel, time: keyframe.time });
        }
        continue;
      }

      const target = targets.get(animatorID);
      if (target === undefined) {
        warnings.push({
          code: "MISSING_GROUP",
          message: `Animation “${animation.name}” targets missing UUID ${animatorID}.`,
        });
        continue;
      }

      for (const channel of TRANSFORM_CHANNELS) {
        const keyframes = (animator.keyframes ?? []).filter((keyframe) => keyframe.channel === channel);
        if (keyframes.length === 0) continue;
        const times = sampleTimes(animation, keyframes, options);
        const context = createSampleContext(
          animation,
          animatorID,
          animator,
          channel,
          document.meta.format_version,
          options,
          warnings,
          warnedExpressions,
        );

        if (channel === "rotation") {
          const values: number[] = [];
          for (const time of times) {
            const parentID = targetID(target.parent);
            const parentWorld = parentID === null ? new Quaternion() : rotationAt(parentID, time);
            const world = rotationAt(animatorID, time);
            const local = parentWorld.invert().multiply(world).normalize();
            values.push(local.x, local.y, local.z, local.w);
          }
          tracks.push(new QuaternionKeyframeTrack(`${target.uuid}.quaternion`, times, values).optimize());
          continue;
        }

        const values: number[] = [];
        for (const time of times) {
          const value = sampleTransformChannel(keyframes, time, context);
          if (channel === "position") {
            values.push(
              target.position.x + value[0] * options.unitScale,
              target.position.y + value[1] * options.unitScale,
              target.position.z + value[2] * options.unitScale,
            );
          } else {
            values.push(
              target.scale.x * (value[0] || 0.00001),
              target.scale.y * (value[1] || 0.00001),
              target.scale.z * (value[2] || 0.00001),
            );
          }
        }
        tracks.push(new VectorKeyframeTrack(`${target.uuid}.${channel}`, times, values).optimize());
      }
    }

    const clip = new AnimationClip(animation.name, animation.length, tracks);
    clip.userData.blockbenchAnimation = animation;
    clips.push(clip);
    effects.set(animation.name, clipEffects.sort((left, right) => left.time - right.time));
  }

  return { clips, effects };
}
