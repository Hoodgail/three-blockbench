import {
  AdditiveBlending,
  DoubleSide,
  FrontSide,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector2,
  type Texture,
} from "three";
import type { ResolvedBBModelLoaderOptions } from "./options.js";
import { resolveTexture, resolveTextureData, type BBLoadedTextures } from "./textures.js";
import type {
  BBCubeFace,
  BBElementBase,
  BBMeshFace,
  BBModelDocument,
  BBTextureData,
  BBTextureGroup,
  BBTextureReference,
} from "./types.js";

const MARKER_COLORS = [
  0x9b5de5, 0xf15bb5, 0xf94144, 0xf3722c, 0xf9c74f,
  0x90be6d, 0x43aa8b, 0x00bbf9, 0x577590, 0xc0c0c0,
] as const;

export interface BBMaterialRequest {
  element: BBElementBase;
  face: BBCubeFace | BBMeshFace;
  textureReference: BBTextureReference | undefined;
  tint: number;
}

export class BBMaterialRegistry {
  public readonly materials: Material[] = [];
  private readonly indices = new Map<string, number>();

  public constructor(
    private readonly document: BBModelDocument,
    private readonly textures: BBLoadedTextures,
    private readonly options: ResolvedBBModelLoaderOptions,
  ) {}

  public get(request: BBMaterialRequest): number {
    const textureData = resolveTextureData(this.document, request.textureReference);
    const texture = resolveTexture(this.document, this.textures, request.textureReference);
    const textureGroup = this.getTextureGroup(textureData);
    const shade = request.element.shade !== false;
    const colorIndex = Math.abs(request.element.color ?? 0) % MARKER_COLORS.length;
    const color = texture === null ? (MARKER_COLORS[colorIndex] ?? 0xffffff) : 0xffffff;
    const lightEmission = typeof request.element.light_emission === "number" ? request.element.light_emission : 0;
    const key = [
      textureData?.uuid ?? "blank",
      shade ? "shade" : "flat",
      textureData?.render_mode ?? "default",
      textureData?.render_sides ?? "auto",
      textureGroup?.uuid ?? "no-group",
      typeof request.face.material_name === "string" ? request.face.material_name : "no-instance",
      color.toString(16),
      request.tint,
      lightEmission,
    ].join("|");
    const existing = this.indices.get(key);
    if (existing !== undefined) return existing;

    const material = this.options.materialFactory?.({
      element: request.element,
      face: request.face,
      texture,
      textureData,
      textureGroup,
      textureReference: request.textureReference,
      shade,
      color,
      tint: request.tint,
      lightEmission,
    }) ?? this.createDefault(texture, textureData, textureGroup, shade, color, lightEmission);
    material.name = textureData?.name ?? `Blockbench color ${colorIndex}`;
    material.userData.blockbenchTexture = textureData;
    const index = this.materials.length;
    this.materials.push(material);
    this.indices.set(key, index);
    return index;
  }

  private createDefault(
    texture: Texture | null,
    textureData: BBTextureData | null,
    textureGroup: BBTextureGroup | null,
    shade: boolean,
    color: number,
    lightEmission: number,
  ): Material {
    const renderMode = textureData?.render_mode;
    const renderSides = textureData?.render_sides;
    const side = renderSides === "double" ? DoubleSide : FrontSide;
    if (!shade || renderMode === "additive") {
      const material = new MeshBasicMaterial({
        color,
        map: texture,
        side,
        transparent: texture !== null,
        alphaTest: renderMode === "additive" ? 0 : 0.01,
        depthWrite: renderMode !== "additive",
      });
      if (renderMode === "additive") material.blending = AdditiveBlending;
      return material;
    }
    const groupTextures = textureGroup === null
      ? []
      : this.document.textures.filter((candidate) => candidate.group === textureGroup.uuid);
    const normalData = groupTextures.find((candidate) => candidate.pbr_channel === "normal");
    const heightData = groupTextures.find((candidate) => candidate.pbr_channel === "height");
    const normalMap = normalData === undefined ? null : (this.textures.byUUID.get(normalData.uuid) ?? null);
    const bumpMap = normalMap === null && heightData !== undefined
      ? (this.textures.byUUID.get(heightData.uuid) ?? null)
      : null;
    const mer = textureGroup?.material_config?.mer_value ?? [0, 0, 255];
    const uniformEmissive = (mer[1] ?? 0) / 255;
    const emissive = renderMode === "emissive" || lightEmission > 0 || uniformEmissive > 0 ? 0xffffff : 0x000000;
    const emissiveIntensity = renderMode === "emissive" ? 1 : Math.max(lightEmission / 15, uniformEmissive);
    const material = new MeshStandardMaterial({
      color,
      map: texture,
      side,
      transparent: texture !== null,
      alphaTest: 0.01,
      normalMap,
      bumpMap,
      bumpScale: bumpMap === null ? 0 : 0.4,
      roughness: textureGroup?.is_material === true ? (mer[2] ?? 255) / 255 : 0.9,
      metalness: textureGroup?.is_material === true ? (mer[0] ?? 0) / 255 : 0,
      emissive,
      emissiveMap: renderMode === "emissive" ? texture : null,
      emissiveIntensity,
    });
    if (normalMap !== null && this.document.meta.model_format.includes("bedrock")) {
      material.normalScale = new Vector2(1, -1);
    }
    return material;
  }

  private getTextureGroup(texture: BBTextureData | null): BBTextureGroup | null {
    if (texture?.group === undefined || texture.group.length === 0) return null;
    return this.document.texture_groups?.find((group) => group.uuid === texture.group && group.is_material === true) ?? null;
  }
}
