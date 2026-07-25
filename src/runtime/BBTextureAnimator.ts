import type { Texture } from "three";
import type { BBTextureData } from "../types.js";

interface AnimatedTexture {
  texture: Texture;
  data: BBTextureData;
  frames: number[];
  elapsed: number;
  cursor: number;
}

function frameSequence(data: BBTextureData, frameCount: number): number[] {
  const forward = Array.from({ length: frameCount }, (_, index) => index);
  if (data.frame_order_type === "backwards") return forward.reverse();
  if (data.frame_order_type === "back_and_forth" && frameCount > 2) {
    return [...forward, ...forward.slice(1, -1).reverse()];
  }
  if (data.frame_order_type === "custom" && data.frame_order !== undefined) {
    const custom = data.frame_order
      .split(/[\s,]+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < frameCount);
    if (custom.length > 0) return custom;
  }
  return forward;
}

export class BBTextureAnimator {
  private readonly animated: AnimatedTexture[] = [];

  public constructor(textures: ReadonlyMap<string, Texture>, textureData: readonly BBTextureData[]) {
    for (const data of textureData) {
      const texture = textures.get(data.uuid);
      const uvHeight = data.uv_height ?? data.width ?? data.height;
      const frameCount = uvHeight === undefined || data.height === undefined
        ? 1
        : Math.max(1, Math.floor(data.height / uvHeight));
      if (texture === undefined || frameCount <= 1) continue;
      texture.repeat.y = 1 / frameCount;
      const entry: AnimatedTexture = {
        texture,
        data,
        frames: frameSequence(data, frameCount),
        elapsed: 0,
        cursor: 0,
      };
      this.animated.push(entry);
      this.applyFrame(entry, frameCount);
    }
  }

  public get count(): number {
    return this.animated.length;
  }

  public update(deltaSeconds: number): void {
    for (const entry of this.animated) {
      const framesPerSecond = Math.max(0.01, entry.data.fps ?? (20 / Math.max(1, entry.data.frame_time ?? 1)));
      const frameDuration = 1 / framesPerSecond;
      entry.elapsed += Math.max(0, deltaSeconds);
      let changed = false;
      while (entry.elapsed >= frameDuration) {
        entry.elapsed -= frameDuration;
        entry.cursor = (entry.cursor + 1) % entry.frames.length;
        changed = true;
      }
      if (changed) {
        const frameCount = Math.round(1 / entry.texture.repeat.y);
        this.applyFrame(entry, frameCount);
      }
    }
  }

  private applyFrame(entry: AnimatedTexture, frameCount: number): void {
    const frame = entry.frames[entry.cursor] ?? 0;
    entry.texture.offset.y = 1 - (frame + 1) / frameCount;
    entry.texture.updateMatrix();
  }
}
