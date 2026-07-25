import { readFile } from "node:fs/promises";
import { Box3, MeshStandardMaterial, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";
import { BBModelLoader, createBBDisplayGroup, parseBBModelDocument, type BBModelDocument } from "../src/index.js";

function baseDocument(): BBModelDocument {
  return {
    meta: { format_version: "5.0", model_format: "free", box_uv: false },
    resolution: { width: 16, height: 16 },
    textures: [
      {
        uuid: "texture",
        name: "texture.png",
        source: "data:image/png;base64,",
        width: 16,
        height: 16,
      },
    ],
    groups: [
      {
        uuid: "root",
        name: "root",
        origin: [0, 8, 0],
        rotation: [0, 0, 0],
      },
    ],
    elements: [],
    outliner: [{ uuid: "root", children: [] }],
  };
}

describe("BBModelLoader", () => {
  it("normalizes legacy top-level fields without using untyped output", () => {
    const parsed = parseBBModelDocument({
      meta: { format: "4.0", bone_rig: true },
      resolution: { width: 16, height: 16 },
      cubes: [],
    });
    expect(parsed.meta.format_version).toBe("4.0");
    expect(parsed.meta.model_format).toBe("bedrock_old");
    expect(parsed.elements).toEqual([]);
    expect(parsed.groups).toEqual([]);
  });

  it("builds cube faces, numeric texture references, hierarchy, and skin weights", async () => {
    const document = baseDocument();
    document.elements.push({
      type: "cube",
      uuid: "cube",
      name: "cube",
      from: [-2, 6, -2],
      to: [2, 10, 2],
      origin: [0, 8, 0],
      inflate: 1,
      stretch: [1, 2, 1],
      faces: {
        east: { uv: [0, 0, 4, 4], texture: 0 },
        west: { uv: [0, 0, 4, 4], texture: 0 },
        up: { uv: [0, 0, 4, 4], texture: 0 },
        down: { uv: [0, 0, 4, 4], texture: 0 },
        south: { uv: [0, 0, 4, 4], texture: 0 },
        north: { uv: [0, 0, 4, 4], texture: null },
      },
    });
    const root = document.outliner[0];
    if (root !== undefined && typeof root !== "string") root.children.push("cube");

    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(document);
    const mesh = model.elements.get("cube");
    expect(mesh).toBeDefined();
    expect(mesh?.geometry.groups).toHaveLength(5);
    expect(mesh?.geometry.getAttribute("skinIndex").count).toBe(24);
    expect(mesh?.geometry.getAttribute("uv").count).toBe(24);
    expect(model.bones.get("root")?.position.y).toBeCloseTo(0.5);
    expect(model.materials).toHaveLength(1);
    expect(model.warnings).toEqual([]);
    model.dispose();
  });

  it("triangulates free-form meshes and preserves per-face UVs", async () => {
    const document = baseDocument();
    document.elements.push({
      type: "mesh",
      uuid: "mesh",
      name: "mesh",
      origin: [0, 8, 0],
      shading: "smooth",
      vertices: {
        a: [-2, 0, -2],
        b: [2, 0, -2],
        c: [2, 0, 2],
        d: [-2, 0, 2],
      },
      faces: {
        face: {
          vertices: ["a", "b", "c", "d"],
          uv: { a: [0, 0], b: [4, 0], c: [4, 4], d: [0, 4] },
          texture: "texture",
        },
      },
    });
    const root = document.outliner[0];
    if (root !== undefined && typeof root !== "string") root.children.push("mesh");

    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(document);
    const geometry = model.elements.get("mesh")?.geometry;
    expect(geometry?.getIndex()?.count).toBe(6);
    expect(geometry?.getAttribute("position").count).toBe(4);
    expect(geometry?.getAttribute("normal").count).toBe(4);
    expect(geometry?.groups).toHaveLength(1);
    model.dispose();
  });

  it("creates mixer-ready position, scale, and quaternion tracks", async () => {
    const document = baseDocument();
    document.animations = [
      {
        uuid: "animation",
        name: "animation.test",
        length: 1,
        loop: "loop",
        snapping: 20,
        animators: {
          root: {
            name: "root",
            type: "bone",
            keyframes: [
              { uuid: "p0", channel: "position", time: 0, interpolation: "linear", data_points: [{ x: 0, y: 0, z: 0 }] },
              { uuid: "p1", channel: "position", time: 1, interpolation: "linear", data_points: [{ x: 4, y: 0, z: 0 }] },
              { uuid: "r0", channel: "rotation", time: 0, interpolation: "catmullrom", data_points: [{ x: 0, y: 0, z: 0 }] },
              { uuid: "r1", channel: "rotation", time: 1, interpolation: "catmullrom", data_points: [{ x: 0, y: 90, z: 0 }] },
              { uuid: "s0", channel: "scale", time: 0, interpolation: "step", data_points: [{ x: 1, y: 1, z: 1 }] },
              { uuid: "s1", channel: "scale", time: 1, interpolation: "step", data_points: [{ x: 2, y: 2, z: 2 }] },
            ],
          },
        },
      },
    ];

    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(document);
    const clip = model.animations[0];
    expect(clip?.tracks.some((track) => track instanceof QuaternionKeyframeTrack)).toBe(true);
    expect(clip?.tracks.filter((track) => track instanceof VectorKeyframeTrack)).toHaveLength(2);
    const mixer = model.createMixer();
    model.createAction(mixer, "animation.test").play();
    mixer.update(0.5);
    expect(model.bones.get("root")?.position.x).toBeCloseTo(0.125, 4);
    expect(model.bones.get("root")?.quaternion.y).not.toBe(0);
    model.dispose();
  });

  it("applies pre-5.0 animation axis compatibility", async () => {
    const document = baseDocument();
    document.meta.format_version = "4.9";
    document.animations = [
      {
        uuid: "legacy",
        name: "legacy",
        length: 1,
        animators: {
          root: {
            name: "root",
            type: "bone",
            keyframes: [
              { uuid: "a", channel: "position", time: 0, data_points: [{ x: 1, y: 0, z: 0 }] },
              { uuid: "b", channel: "position", time: 1, data_points: [{ x: 1, y: 0, z: 0 }] },
            ],
          },
        },
      },
    ];
    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(document);
    const track = model.animations[0]?.tracks.find((candidate) => candidate.name.endsWith(".position"));
    expect(track?.values[0]).toBeCloseTo(-1 / 16);
    model.dispose();
  });

  it("evaluates Molang hooks at every sampled time and supports quaternion interpolation", async () => {
    const document = baseDocument();
    document.animations = [
      {
        uuid: "expressions",
        name: "expressions",
        length: 1,
        snapping: 4,
        animators: {
          root: {
            name: "root",
            type: "bone",
            quaternion_interpolation: true,
            keyframes: [
              { uuid: "p0", channel: "position", time: 0, data_points: [{ x: "query.anim_time", y: 0, z: 0 }] },
              { uuid: "p1", channel: "position", time: 1, data_points: [{ x: "query.anim_time", y: 0, z: 0 }] },
              { uuid: "r0", channel: "rotation", time: 0, data_points: [{ x: 0, y: 0, z: 0 }] },
              { uuid: "r1", channel: "rotation", time: 1, data_points: [{ x: 0, y: 270, z: 0 }] },
            ],
          },
        },
      },
    ];
    const model = await new BBModelLoader(undefined, {
      loadTextures: false,
      expressionEvaluator: (_expression, context) => context.time * 16,
    }).parseAsync(document);
    const position = model.animations[0]?.tracks.find(
      (track): track is VectorKeyframeTrack => track instanceof VectorKeyframeTrack && track.name.endsWith(".position"),
    );
    const rotation = model.animations[0]?.tracks.find(
      (track): track is QuaternionKeyframeTrack => track instanceof QuaternionKeyframeTrack,
    );
    if (position === undefined || rotation === undefined) throw new Error("Expected transform tracks.");
    const positionIndex = Array.from(position.times).findIndex((time) => Math.abs(time - 0.5) < 1e-6);
    const rotationIndex = Array.from(rotation.times).findIndex((time) => Math.abs(time - 0.5) < 1e-6);
    expect(position.values[positionIndex * 3]).toBeCloseTo(0.5);
    expect(rotation.values[rotationIndex * 4 + 1]).toBeLessThan(0);
    expect(model.warnings).toEqual([]);
    model.dispose();
  });

  it("inherits group visibility and per-group texture references", async () => {
    const document = baseDocument();
    const rootGroup = document.groups[0];
    if (rootGroup === undefined) throw new Error("Expected root group.");
    rootGroup.visibility = false;
    rootGroup.texture = "texture";
    document.elements.push({
      type: "cube",
      uuid: "group-textured-cube",
      name: "group textured cube",
      from: [0, 0, 0],
      to: [1, 1, 1],
      origin: [0, 0, 0],
      faces: { north: { uv: [0, 0, 1, 1], texture: false } },
    });
    const root = document.outliner[0];
    if (root !== undefined && typeof root !== "string") root.children.push("group-textured-cube");
    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(document);
    expect(model.elements.get("group-textured-cube")?.visible).toBe(false);
    expect(model.materials[0]?.userData.blockbenchTexture).toBe(rootGroup.texture === "texture" ? document.textures[0] : null);
    model.dispose();
  });

  it("maps PBR texture groups onto standard material inputs", async () => {
    const document = baseDocument();
    const colorTexture = document.textures[0];
    if (colorTexture === undefined) throw new Error("Expected a color texture.");
    colorTexture.group = "material-group";
    colorTexture.pbr_channel = "color";
    document.textures.push({
      uuid: "normal",
      name: "normal.png",
      group: "material-group",
      pbr_channel: "normal",
      width: 16,
      height: 16,
    });
    document.texture_groups = [{
      uuid: "material-group",
      name: "material",
      is_material: true,
      material_config: { mer_value: [128, 64, 192] },
    }];
    document.elements.push({
      type: "cube",
      uuid: "pbr-cube",
      from: [0, 0, 0],
      to: [1, 1, 1],
      faces: { north: { uv: [0, 0, 1, 1], texture: "texture" } },
    });
    const root = document.outliner[0];
    if (root !== undefined && typeof root !== "string") root.children.push("pbr-cube");
    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(document);
    const material = model.materials.find((candidate) => candidate.userData.blockbenchTexture === colorTexture);
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    if (!(material instanceof MeshStandardMaterial)) throw new Error("Expected a standard material.");
    expect(material.normalMap).toBe(model.textures.get("normal"));
    expect(material.metalness).toBeCloseTo(128 / 255);
    expect(material.emissiveIntensity).toBeCloseTo(64 / 255);
    expect(material.roughness).toBeCloseTo(192 / 255);
    model.dispose();
  });

  it("rejects malformed outliner and animation structures at the JSON boundary", () => {
    expect(() => parseBBModelDocument({
      meta: { format_version: "5.0", model_format: "free" },
      resolution: { width: 16, height: 16 },
      outliner: [{ uuid: "root" }],
    })).toThrow(/Outliner entries/);
    expect(() => parseBBModelDocument({
      meta: { format_version: "5.0", model_format: "free" },
      resolution: { width: 16, height: 16 },
      animations: "invalid",
    })).toThrow(/animations must be an array/);
  });

  it("translates Java display slots into reusable Three.js transforms", () => {
    const document = baseDocument();
    document.display = {
      gui: {
        translation: [8, 16, -8],
        rotation: [0, 90, 0],
        scale: [2, 2, 2],
      },
    };
    const display = createBBDisplayGroup(document, "gui");
    expect(display?.position.toArray()).toEqual([0.5, 1, -0.5]);
    expect(display?.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(display?.scale.toArray()).toEqual([2, 2, 2]);
    expect(createBBDisplayGroup(document, "ground")).toBeNull();
  });

  it("loads and animates the supplied desert dog integration model", async () => {
    const source = await readFile(new URL("../examples/models/desert_dog.bbmodel", import.meta.url), "utf8");
    const model = await new BBModelLoader(undefined, { loadTextures: false }).parseAsync(source);
    expect(model.elements.size).toBe(99);
    expect(model.bones.size).toBe(27);
    expect(model.skeleton.bones).toHaveLength(126);
    expect(model.textures.size).toBe(1);
    expect(model.animations).toHaveLength(23);
    expect(model.animations.reduce((sum, clip) => sum + clip.tracks.length, 0)).toBe(648);
    expect(model.warnings).toEqual([]);

    const mixer = model.createMixer();
    const before = model.bones.get("e5d6c52a-37cb-8a1b-f753-0240d236fe87")?.quaternion.clone();
    model.createAction(mixer, "animation.walk_forward").play();
    mixer.update(0.5);
    const after = model.bones.get("e5d6c52a-37cb-8a1b-f753-0240d236fe87")?.quaternion;
    if (before === undefined || after === undefined) throw new Error("Expected the body bone.");
    expect(before.angleTo(after)).toBeGreaterThan(0.001);

    const bounds = new Box3().setFromObject(model.scene);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(1.5);
    model.dispose();
  });
});
