import {
  Bone,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  type LoadingManager,
  type Object3D,
} from "three";
import { buildAnimationClips } from "./animation/tracks.js";
import { BBModel } from "./BBModel.js";
import { BBModelError, type BBModelWarning } from "./errors.js";
import { buildCubeGeometry, cubeRescale } from "./geometry/cube.js";
import { buildMeshGeometry } from "./geometry/mesh.js";
import type { BBElementGeometry, ResolveUVSize } from "./geometry/types.js";
import { BBMaterialRegistry } from "./materials.js";
import type { ResolvedBBModelLoaderOptions } from "./options.js";
import { loadBBModelTextures, resolveTextureData } from "./textures.js";
import {
  isCubeElement,
  isMeshElement,
  type BBCubeElement,
  type BBElementBase,
  type BBGroup,
  type BBModelDocument,
  type BBOutlinerNode,
} from "./types.js";
import { compareFormatVersion } from "./validation.js";

interface Hierarchy {
  bones: Map<string, Bone>;
  elementBones: Map<string, Bone>;
  targets: Map<string, Object3D>;
  elementExport: Map<string, boolean>;
  elementVisible: Map<string, boolean>;
  elementTexture: Map<string, string>;
  allBones: Bone[];
}

export class BBModelParser {
  public constructor(
    private readonly manager: LoadingManager,
    private readonly options: ResolvedBBModelLoaderOptions,
  ) {}

  public async parse(document: BBModelDocument, basePath: string): Promise<BBModel> {
    const warnings: BBModelWarning[] = [];
    if (compareFormatVersion(document.meta.format_version, "5.0") > 0) {
      warnings.push({
        code: "NEWER_FORMAT",
        message: `This project uses bbmodel ${document.meta.format_version}; the newest validated format is 5.0.`,
        path: "meta.format_version",
      });
    }

    const loadedTextures = await loadBBModelTextures(
      document,
      basePath,
      this.manager,
      this.options,
      warnings,
    );
    const scene = new Group();
    scene.name = typeof document.name === "string" ? document.name : "BlockbenchModel";
    scene.userData.blockbenchModel = document;
    const hierarchy = this.buildHierarchy(document, scene, warnings);
    scene.updateMatrixWorld(true);
    const skeleton = new Skeleton(hierarchy.allBones);
    skeleton.calculateInverses();

    const materials = new BBMaterialRegistry(document, loadedTextures, this.options);
    const elements = new Map<string, SkinnedMesh>();
    const boneIndices = new Map(hierarchy.allBones.map((bone, index) => [bone, index]));
    const resolveUVSize: ResolveUVSize = (reference) => {
      const texture = resolveTextureData(document, reference);
      return [
        texture?.uv_width ?? document.resolution.width,
        texture?.uv_height ?? document.resolution.height,
      ];
    };

    for (const element of document.elements) {
      if (element.export === false || hierarchy.elementExport.get(element.uuid) === false) continue;
      const elementBone = hierarchy.elementBones.get(element.uuid);
      if (elementBone === undefined) continue;
      const groupTexture = hierarchy.elementTexture.get(element.uuid);
      const effectiveTexture = (reference: Parameters<ResolveUVSize>[0]) =>
        (reference === false || reference === undefined) && groupTexture !== undefined ? groupTexture : reference;
      const elementUVSize: ResolveUVSize = (reference) => resolveUVSize(effectiveTexture(reference));
      let built: BBElementGeometry | null = null;
      if (isCubeElement(element)) {
        const cube = this.compatibleCube(document, element);
        built = buildCubeGeometry(cube, this.options.unitScale, elementUVSize);
      } else if (isMeshElement(element)) {
        built = buildMeshGeometry(element, this.options.unitScale, elementUVSize);
      } else {
        this.warn(warnings, {
          code: "UNSUPPORTED_ELEMENT",
          message: `Element “${element.name ?? element.uuid}” has unsupported type “${element.type}”.`,
          path: `elements.${element.uuid}`,
        });
      }
      if (built === null) continue;

      built.faces.forEach((face, faceIndex) => {
        const textureReference = effectiveTexture(face.texture);
        const materialIndex = materials.get({
          element,
          face: face.source,
          textureReference,
          tint: face.tint,
        });
        const group = built.geometry.groups[faceIndex];
        if (group !== undefined) group.materialIndex = materialIndex;
        if (textureReference !== false && textureReference !== null && resolveTextureData(document, textureReference) === null) {
          this.warn(warnings, {
            code: "MISSING_TEXTURE",
            message: `Element “${element.name ?? element.uuid}” references a missing texture.`,
            path: `elements.${element.uuid}`,
          });
        }
      });

      built.geometry.applyMatrix4(elementBone.matrixWorld);
      const vertexCount = built.geometry.getAttribute("position").count;
      const boneIndex = boneIndices.get(elementBone) ?? 0;
      const skinIndices = new Uint16Array(vertexCount * 4);
      const skinWeights = new Float32Array(vertexCount * 4);
      for (let index = 0; index < vertexCount; index += 1) {
        skinIndices[index * 4] = boneIndex;
        skinWeights[index * 4] = 1;
      }
      built.geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndices, 4));
      built.geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));

      const mesh = new SkinnedMesh(built.geometry, materials.materials);
      mesh.name = element.name ?? element.uuid;
      mesh.visible = element.visibility !== false && hierarchy.elementVisible.get(element.uuid) !== false;
      mesh.renderOrder = element.render_order === "behind" ? -1 : element.render_order === "in_front" ? 1 : 0;
      mesh.userData.blockbenchUUID = element.uuid;
      mesh.userData.blockbenchElement = element;
      scene.add(mesh);
      mesh.bind(skeleton, new Matrix4());
      elements.set(element.uuid, mesh);
    }
    for (const mesh of elements.values()) mesh.material = materials.materials;

    const animationResult = buildAnimationClips(document, hierarchy.targets, this.options, warnings);
    scene.animations = animationResult.clips;
    scene.updateMatrixWorld(true);
    return new BBModel({
      document,
      scene,
      animations: animationResult.clips,
      skeleton,
      bones: hierarchy.bones,
      elementBones: hierarchy.elementBones,
      elements,
      textures: loadedTextures.byUUID,
      materials: materials.materials,
      effects: animationResult.effects,
      warnings,
    });
  }

  private buildHierarchy(document: BBModelDocument, scene: Group, warnings: BBModelWarning[]): Hierarchy {
    const groupsByID = new Map(document.groups.map((group) => [group.uuid, group]));
    const bones = new Map<string, Bone>();
    const elementBones = new Map<string, Bone>();
    const targets = new Map<string, Object3D>();
    const elementParents = new Map<string, BBGroup | null>();
    const elementExport = new Map<string, boolean>();
    const elementVisible = new Map<string, boolean>();
    const elementTexture = new Map<string, string>();
    const visitedGroups = new Set<string>();

    for (const group of document.groups) {
      const bone = new Bone();
      bone.name = group.name;
      bone.rotation.order = this.options.eulerOrder;
      bone.visible = group.visibility !== false;
      bone.userData.blockbenchUUID = group.uuid;
      bone.userData.blockbenchGroup = group;
      bones.set(group.uuid, bone);
      targets.set(group.uuid, bone);
    }

    const visit = (
      nodes: BBOutlinerNode[],
      parent: BBGroup | null,
      exported: boolean,
      visible: boolean,
    ): void => {
      for (const node of nodes) {
        if (typeof node === "string") {
          elementParents.set(node, parent);
          elementExport.set(node, exported);
          elementVisible.set(node, visible);
          if (parent?.texture !== undefined && parent.texture.length > 0) elementTexture.set(node, parent.texture);
          continue;
        }
        const group = groupsByID.get(node.uuid);
        const bone = bones.get(node.uuid);
        if (group === undefined || bone === undefined) {
          this.warn(warnings, {
            code: "MISSING_GROUP",
            message: `Outliner references missing group ${node.uuid}.`,
            path: "outliner",
          });
          visit(node.children, parent, exported, visible);
          continue;
        }
        visitedGroups.add(group.uuid);
        this.configureBone(bone, group, parent, document.meta.format_version);
        const parentBone = parent === null ? null : bones.get(parent.uuid);
        (parentBone ?? scene).add(bone);
        visit(
          node.children,
          group,
          exported && group.export !== false,
          visible && group.visibility !== false,
        );
      }
    };
    visit(document.outliner, null, true, true);

    for (const group of document.groups) {
      if (visitedGroups.has(group.uuid)) continue;
      const bone = bones.get(group.uuid);
      if (bone === undefined) continue;
      this.configureBone(bone, group, null, document.meta.format_version);
      scene.add(bone);
    }

    for (const element of document.elements) {
      const parent = elementParents.get(element.uuid) ?? null;
      const parentBone = parent === null ? null : bones.get(parent.uuid);
      const bone = this.createElementBone(element, parent);
      (parentBone ?? scene).add(bone);
      elementBones.set(element.uuid, bone);
      targets.set(element.uuid, bone);
      if (!elementExport.has(element.uuid)) elementExport.set(element.uuid, true);
      if (!elementVisible.has(element.uuid)) elementVisible.set(element.uuid, true);
    }
    scene.updateMatrixWorld(true);
    return {
      bones,
      elementBones,
      targets,
      elementExport,
      elementVisible,
      elementTexture,
      allBones: [...bones.values(), ...elementBones.values()],
    };
  }

  private configureBone(bone: Bone, group: BBGroup, parent: BBGroup | null, formatVersion: string): void {
    const origin = group.origin ?? [0, 0, 0];
    const parentOrigin = parent?.origin ?? [0, 0, 0];
    bone.position.set(
      (origin[0] - parentOrigin[0]) * this.options.unitScale,
      (origin[1] - parentOrigin[1]) * this.options.unitScale,
      (origin[2] - parentOrigin[2]) * this.options.unitScale,
    );
    const rotation = group.rotation ?? [0, 0, 0];
    const z = compareFormatVersion(formatVersion, "3.2") < 0 ? -rotation[2] : rotation[2];
    bone.rotation.set(
      rotation[0] * Math.PI / 180,
      rotation[1] * Math.PI / 180,
      z * Math.PI / 180,
      this.options.eulerOrder,
    );
  }

  private createElementBone(element: BBElementBase, parent: BBGroup | null): Bone {
    const bone = new Bone();
    bone.name = `${element.name ?? element.uuid}__pivot`;
    bone.rotation.order = this.options.eulerOrder;
    bone.userData.blockbenchUUID = element.uuid;
    bone.userData.blockbenchElement = element;
    const origin = element.origin ?? [0, 0, 0];
    const parentOrigin = parent?.origin ?? [0, 0, 0];
    bone.position.set(
      (origin[0] - parentOrigin[0]) * this.options.unitScale,
      (origin[1] - parentOrigin[1]) * this.options.unitScale,
      (origin[2] - parentOrigin[2]) * this.options.unitScale,
    );
    const rotation = element.rotation ?? [0, 0, 0];
    bone.rotation.set(
      rotation[0] * Math.PI / 180,
      rotation[1] * Math.PI / 180,
      rotation[2] * Math.PI / 180,
      this.options.eulerOrder,
    );
    if (isCubeElement(element)) bone.scale.fromArray(cubeRescale(element));
    return bone;
  }

  private compatibleCube(document: BBModelDocument, cube: BBCubeElement): BBCubeElement {
    if (
      compareFormatVersion(document.meta.format_version, "4.5") < 0 &&
      document.meta.box_uv === true &&
      cube.shade === false
    ) {
      return { ...cube, mirror_uv: true };
    }
    return cube;
  }

  private warn(warnings: BBModelWarning[], warning: BBModelWarning): void {
    if (this.options.strict) throw new BBModelError(warning.message, warning.path);
    warnings.push(warning);
  }
}
