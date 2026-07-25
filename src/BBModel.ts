import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import type { BBModelEffect } from "./animation/tracks.js";
import type { BBModelWarning } from "./errors.js";
import { BBTextureAnimator } from "./runtime/BBTextureAnimator.js";
import type { BBAnimation, BBModelDocument } from "./types.js";

export interface BBModelInit {
  document: BBModelDocument;
  scene: Group;
  animations: AnimationClip[];
  skeleton: Skeleton;
  bones: Map<string, Bone>;
  elementBones: Map<string, Bone>;
  elements: Map<string, SkinnedMesh>;
  textures: Map<string, Texture>;
  materials: Material[];
  effects: Map<string, BBModelEffect[]>;
  warnings: BBModelWarning[];
}

export class BBModel {
  public readonly document: BBModelDocument;
  public readonly scene: Group;
  public readonly animations: AnimationClip[];
  public readonly skeleton: Skeleton;
  public readonly bones: Map<string, Bone>;
  public readonly elementBones: Map<string, Bone>;
  public readonly elements: Map<string, SkinnedMesh>;
  public readonly textures: Map<string, Texture>;
  public readonly materials: Material[];
  public readonly effects: Map<string, BBModelEffect[]>;
  public readonly warnings: BBModelWarning[];
  public readonly textureAnimator: BBTextureAnimator;

  public constructor(init: BBModelInit) {
    this.document = init.document;
    this.scene = init.scene;
    this.animations = init.animations;
    this.skeleton = init.skeleton;
    this.bones = init.bones;
    this.elementBones = init.elementBones;
    this.elements = init.elements;
    this.textures = init.textures;
    this.materials = init.materials;
    this.effects = init.effects;
    this.warnings = init.warnings;
    this.textureAnimator = new BBTextureAnimator(this.textures, this.document.textures);
  }

  public createMixer(): AnimationMixer {
    return new AnimationMixer(this.scene);
  }

  public getAnimation(name: string): AnimationClip | undefined {
    return AnimationClip.findByName(this.animations, name) ?? undefined;
  }

  public createAction(mixer: AnimationMixer, animation: string | AnimationClip): AnimationAction {
    const clip = typeof animation === "string" ? this.getAnimation(animation) : animation;
    if (clip === undefined) throw new Error(`Unknown Blockbench animation: ${String(animation)}`);
    const action = mixer.clipAction(clip);
    const source = clip.userData.blockbenchAnimation;
    const loop = isBBAnimation(source) ? source.loop : "once";
    if (loop === "loop") action.setLoop(LoopRepeat, Infinity);
    else action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = loop === "hold";
    return action;
  }

  public update(deltaSeconds: number): void {
    this.textureAnimator.update(deltaSeconds);
  }

  public dispose(): void {
    for (const element of this.elements.values()) element.geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
  }
}

function isBBAnimation(value: unknown): value is BBAnimation {
  return typeof value === "object" && value !== null && "animators" in value && "length" in value;
}
