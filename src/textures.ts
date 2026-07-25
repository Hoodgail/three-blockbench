import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type LoadingManager,
} from "three";
import type { BBModelWarning } from "./errors.js";
import type { ResolvedBBModelLoaderOptions } from "./options.js";
import type { BBModelDocument, BBTextureData, BBTextureLayer, BBTextureReference } from "./types.js";

export interface BBLoadedTextures {
  ordered: Texture[];
  byUUID: Map<string, Texture>;
  dataByUUID: Map<string, BBTextureData>;
}

function placeholderTexture(data: BBTextureData): Texture {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
  texture.name = data.name;
  texture.needsUpdate = true;
  return texture;
}

function resolveAssetURL(data: BBTextureData, basePath: string): string {
  const source = data.source;
  if (source !== undefined && source.length > 0) return source;
  const path = data.relative_path || data.path || "";
  if (/^(?:data:|blob:|https?:|file:|\/)/.test(path)) return path;
  if (basePath.length === 0) return path;
  try {
    return new URL(path, basePath).href;
  } catch {
    return `${basePath.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
  }
}

function configureTexture(texture: Texture, data: BBTextureData): Texture {
  texture.name = data.name;
  texture.flipY = false;
  texture.colorSpace = data.pbr_channel === "normal" || data.pbr_channel === "height" ? NoColorSpace : SRGBColorSpace;
  texture.magFilter = data.frame_interpolate === true ? LinearFilter : NearestFilter;
  texture.minFilter = data.frame_interpolate === true ? LinearFilter : NearestFilter;
  texture.generateMipmaps = false;
  const repeat = data.wrap_mode === "repeat";
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.userData.blockbenchTexture = data;
  texture.needsUpdate = true;
  return texture;
}

function compositeOperation(blendMode: string | undefined): GlobalCompositeOperation {
  switch (blendMode) {
    case "multiply":
    case "screen":
    case "overlay":
    case "darken":
    case "lighten":
    case "color-dodge":
    case "color-burn":
    case "hard-light":
    case "soft-light":
    case "difference":
    case "exclusion":
    case "hue":
    case "saturation":
    case "color":
    case "luminosity":
      return blendMode;
    default:
      return "source-over";
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load texture layer: ${source.slice(0, 80)}`));
    image.src = source;
  });
}

async function composeLayers(data: BBTextureData): Promise<Texture | null> {
  if (typeof document === "undefined" || !Array.isArray(data.layers)) return null;
  const visibleLayers = data.layers.filter(
    (layer): layer is BBTextureLayer & { data_url: string } =>
      layer.visible !== false && typeof layer.data_url === "string",
  );
  if (visibleLayers.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = data.width ?? visibleLayers[0]?.width ?? 16;
  canvas.height = data.height ?? visibleLayers[0]?.height ?? 16;
  const context = canvas.getContext("2d");
  if (context === null) return null;

  for (const layer of visibleLayers) {
    const image = await loadImage(layer.data_url);
    const offset = layer.offset ?? [0, 0];
    const scale = layer.scale ?? [1, 1];
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, (layer.opacity ?? 100) / 100));
    context.globalCompositeOperation = compositeOperation(layer.blend_mode);
    context.translate(offset[0], offset[1]);
    context.scale(scale[0], scale[1]);
    context.drawImage(image, 0, 0);
    context.restore();
  }

  return new CanvasTexture(canvas);
}

async function loadOneTexture(
  data: BBTextureData,
  basePath: string,
  manager: LoadingManager,
  options: ResolvedBBModelLoaderOptions,
): Promise<Texture> {
  if (!options.loadTextures) return configureTexture(placeholderTexture(data), data);
  if (data.layers_enabled === true) {
    const composed = await composeLayers(data);
    if (composed !== null) return configureTexture(composed, data);
  }

  const url = resolveAssetURL(data, basePath);
  if (url.length === 0) return configureTexture(placeholderTexture(data), data);
  if (options.textureFactory !== undefined) {
    return configureTexture(await options.textureFactory({ url, texture: data }), data);
  }
  const loader = new TextureLoader(manager);
  return configureTexture(await loader.loadAsync(url), data);
}

export async function loadBBModelTextures(
  document: BBModelDocument,
  basePath: string,
  manager: LoadingManager,
  options: ResolvedBBModelLoaderOptions,
  warnings: BBModelWarning[],
): Promise<BBLoadedTextures> {
  const ordered: Texture[] = [];
  const byUUID = new Map<string, Texture>();
  const dataByUUID = new Map<string, BBTextureData>();

  await Promise.all(
    document.textures.map(async (data, index) => {
      let texture: Texture;
      try {
        texture = await loadOneTexture(data, basePath, manager, options);
      } catch (cause: unknown) {
        if (options.strict) throw cause;
        texture = configureTexture(placeholderTexture(data), data);
        warnings.push({
          code: "TEXTURE_LOAD_FAILED",
          message: `Texture “${data.name}” could not be loaded; a white placeholder is being used.`,
          path: `textures[${index}]`,
        });
      }
      ordered[index] = texture;
      byUUID.set(data.uuid, texture);
      dataByUUID.set(data.uuid, data);
    }),
  );

  return { ordered, byUUID, dataByUUID };
}

export function resolveTextureData(
  document: BBModelDocument,
  reference: BBTextureReference | undefined,
): BBTextureData | null {
  if (typeof reference === "number") return document.textures[reference] ?? null;
  if (typeof reference === "string") {
    return document.textures.find((texture) => texture.uuid === reference) ?? null;
  }
  if (document.textures.length === 1 && reference !== null) return document.textures[0] ?? null;
  return null;
}

export function resolveTexture(
  document: BBModelDocument,
  loaded: BBLoadedTextures,
  reference: BBTextureReference | undefined,
): Texture | null {
  const data = resolveTextureData(document, reference);
  return data === null ? null : (loaded.byUUID.get(data.uuid) ?? null);
}
