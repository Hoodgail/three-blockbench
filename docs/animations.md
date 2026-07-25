# Animation behavior

## Transform tracks

Position values are Blockbench pixel offsets added to a target's rest position. Scale values multiply the rest scale. Rotation values are degree offsets added to the rest Euler angles and emitted as quaternion tracks for robust mixer blending.

The loader samples linear, step, Catmull-Rom, and cubic Bézier segments. Exact authored key times are always included. A discontinuous key adds a second sample immediately after its authored time so pre/post values remain distinct.

## Loop modes

Use `model.createAction(mixer, clip)` to apply Blockbench's loop metadata:

- `loop` becomes `THREE.LoopRepeat`.
- `once` becomes one `THREE.LoopOnce` repetition.
- `hold` becomes `LoopOnce` with `clampWhenFinished`.

Direct `mixer.clipAction(clip)` remains available when the application wants different playback behavior.

## Molang values

Numeric strings are parsed without configuration. Other expressions need `expressionEvaluator` because queries and variables belong to the host game's state. The evaluator receives animation, animator, channel, axis, and current sample time.

## Effects and controllers

Sound, particle, and timeline keys are exposed in `model.effects`. They are ordered by time and retain all data points. Animation controller documents, transitions, variable placeholders, and scripts are preserved on `model.document`; the loader does not assume a specific Molang runtime or audio/particle engine.
