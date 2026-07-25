# three-blockbench

Load Blockbench `.bbmodel` projects as native Three.js textures, skinned meshes, skeletons, and `AnimationClip`s.

`three-blockbench` follows the familiar loader shape of `GLTFLoader`: give it a URL, add the returned scene, and play its clips with `AnimationMixer`. It also keeps the Blockbench UUID maps and project metadata available when a game or editor needs more than rendered geometry.

## Install

```sh
npm install three three-blockbench
```

`three` is a peer dependency. The package ships ESM JavaScript and TypeScript declarations.

## Quick start

```ts
import * as THREE from "three";
import { BBModelLoader } from "three-blockbench";

const loader = new BBModelLoader();
const model = await loader.loadAsync("/models/desert_dog.bbmodel");

scene.add(model.scene);

const mixer = model.createMixer();
model.createAction(mixer, "animation.idle").play();

const clock = new THREE.Clock();
function render() {
  requestAnimationFrame(render);
  const delta = clock.getDelta();
  mixer.update(delta);
  model.update(delta); // Advances animated texture atlases.
  renderer.render(scene, camera);
}
render();
```

Call `model.dispose()` when the instance is no longer needed.

## What the loader returns

```ts
interface BBModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  skeleton: THREE.Skeleton;
  bones: Map<string, THREE.Bone>;          // Blockbench group UUID → bone
  elementBones: Map<string, THREE.Bone>;   // element UUID → pivot bone
  elements: Map<string, THREE.SkinnedMesh>;
  textures: Map<string, THREE.Texture>;
  materials: THREE.Material[];
  effects: Map<string, BBModelEffect[]>;
  document: BBModelDocument;
  warnings: BBModelWarning[];
}
```

Each cube or free-form mesh remains individually addressable while sharing the model skeleton. Geometry uses rigid skin weights, matching the strategy Blockbench uses when exporting bone-rigged groups to glTF.

## Format support

| Blockbench data | Three.js result | Notes |
|---|---|---|
| Cubes | `SkinnedMesh` + `BufferGeometry` | Per-face UVs, UV rotation, box UV, mirroring, hidden faces, inflate, stretch, cube rotation/rescale |
| Mesh elements | `SkinnedMesh` + `BufferGeometry` | Triangles, quads, n-gon fans, flat/smooth normals, per-vertex UVs |
| Groups/outliner | `Bone` hierarchy + `Skeleton` | Multiple roots, absolute Blockbench pivots, element pivot bones |
| Textures | Three.js `Texture` and materials | Embedded data URLs, relative/absolute URLs, pixel filtering, texture layers, render sides/modes |
| Animated textures | UV offset/repeat updates | Loop, backwards, back-and-forth, and custom frame order |
| Transform animation | `AnimationClip` tracks | Position, scale, quaternion rotation; linear, step, Catmull-Rom, and Bézier sampling |
| Animation details | Clip metadata | Once/loop/hold, discontinuous keys, global rotation, v5 compatibility conversion |
| Effect animators | `model.effects` | Sound, particle, and timeline events stay engine-agnostic for your event system |
| Controllers/display | `model.document` | Typed source data is preserved; controller/Molang execution belongs to the host game runtime |

Unknown editor/plugin element types generate a typed warning in normal mode and an error in strict mode. They are never silently converted into unrelated geometry.

## Loader options

```ts
const loader = new BBModelLoader(undefined, {
  unitScale: 1 / 16,
  eulerOrder: "ZYX",
  animationSampleRate: "snapping",
  maxAnimationSampleRate: 120,
  strict: false,
  loadTextures: true,
});
```

- `unitScale` controls how many Three.js units represent one Blockbench pixel.
- `animationSampleRate` can be a fixed samples-per-second value or `"snapping"` for each clip's authored timeline rate.
- `expressionEvaluator` resolves Molang keyframe values using application state. Without one, non-numeric expressions evaluate to `0` with a warning.
- `textureFactory` integrates a custom image pipeline, CDN, credentials, or server-side decoder.
- `materialFactory` replaces the built-in standard/basic material mapping.
- `loadTextures: false` produces white placeholder textures for server-side geometry and animation inspection.
- `strict: true` turns missing references and unsupported elements into exceptions.

All options are typed; the implementation contains no `as any` escape hatches.

## Parsing in-memory projects

```ts
const response = await fetch("/model.bbmodel");
const source = await response.text();

const model = await new BBModelLoader().parseAsync(source, "/model-assets/");
```

The second argument is the base URL for linked textures. `parseAsync` also accepts an `ArrayBuffer` or a validated `BBModelDocument`.

## Animation effects

Three.js tracks transforms, but sound/particle/timeline keys are events rather than object properties. They are grouped by clip name:

```ts
for (const effect of model.effects.get("animation.attack") ?? []) {
  console.log(effect.time, effect.channel, effect.keyframe.data_points);
}
```

Use those records with your audio, particle, or scripting system. The raw animation controllers and variable placeholders remain available through `model.document` for engines that run Molang state machines.

## Example and docs

```sh
npm install
npm run dev
```

The example loads [`examples/models/desert_dog.bbmodel`](./examples/models/desert_dog.bbmodel), exposes all 23 clips, and includes a rig overlay. The same project is used by the automated integration and browser capture tests.

- [Browser example](./examples/index.html)
- [Loader guide](./examples/docs.html)
- [Animation notes](./docs/animations.md)
- [Architecture](./docs/architecture.md)
- [Contributing](./CONTRIBUTING.md)

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run build:example
```

The visual smoke test is reproducible with `scripts/capture_example.py`; it requires Python Playwright, Chromium, and FFmpeg. It captures desktop/mobile screenshots, a rig view, and a GIF sampling all 23 authored clips into `artifacts/`.

## License

[MIT](./LICENSE)
