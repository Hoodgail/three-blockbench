# Architecture

The loader is a staged pipeline that mirrors Blockbench's project codec:

1. `validation.ts` validates the JSON boundary and applies legacy top-level defaults.
2. `textures.ts` resolves embedded or linked assets and normalizes Three.js sampling settings.
3. `BBModelParser` builds the group outliner as bones, adds an element pivot bone for every renderable element, and creates the shared skeleton.
4. `geometry/cube.ts` and `geometry/mesh.ts` create element-local geometry and UVs.
5. Each geometry is transformed into its bind-pose model coordinates, assigned a rigid skin weight, and bound to the shared skeleton.
6. `animation/tracks.ts` samples authored interpolation and emits native vector/quaternion tracks.
7. `BBModel` exposes the scene plus UUID maps, metadata, effect events, convenience action creation, and disposal.

## Why element pivot bones exist

Blockbench can animate an element directly as well as animate its parent group. A pivot bone per element preserves that possibility without special per-frame object code. Cubes and mesh elements therefore use the same transform path, and static cube rotation/rescale becomes part of the bind pose.

## Why nonlinear keyframes are sampled

A Three.js keyframe track selects one interpolation mode for the whole track. Blockbench selects interpolation per segment and supports Bézier handles with independent time coordinates. Sampling at the authored snapping rate preserves mixed interpolation, discontinuities, and expression output while still producing ordinary `AnimationClip`s.

## Coordinate space

Both systems are right-handed and Y-up. Blockbench coordinates are pixels; the default scale maps 16 pixels to one Three.js unit. Group origins are world-space pivots in the file, so each bone position is the difference between its origin and its parent's origin.
