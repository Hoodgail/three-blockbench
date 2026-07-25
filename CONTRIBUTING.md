# Contributing to three-blockbench

Thanks for helping make Blockbench projects reliable outside the editor.

## Before opening a change

1. Search existing issues and discussions.
2. For a format bug, attach the smallest `.bbmodel` that reproduces it. Remove unrelated textures or private project data first.
3. State the Blockbench version and `meta.format_version` that created the file.
4. Explain what Blockbench displays and what Three.js currently displays.

Fixtures contributed to the repository must have a license that permits redistribution. Add the license and author next to the model.

## Development setup

```sh
git clone https://github.com/Hoodgail/three-blockbench.git
cd three-blockbench
npm install
npm run typecheck
npm test
```

Run `npm run dev` for the desert-dog workbench. The local `blockbench/` clone and `research/` notes are ignored intentionally; they are reference material, not package inputs.

## Pull request checklist

- Add or update a focused fixture/test for behavior changes.
- Keep public types strict. Do not introduce `as any`, `@ts-ignore`, or an untyped JSON boundary.
- Preserve Blockbench UUIDs in `userData.blockbenchUUID` and public maps.
- Verify geometry changes with a screenshot from at least two camera angles.
- Verify animation changes at multiple times, including the first/last frame and loop boundary.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run build:example`.
- Update the README/support table if capability or behavior changes.

## Design principles

- Match Blockbench semantics before inventing a convenience behavior.
- Warn on recoverable missing data; throw only in strict mode or when a document cannot be interpreted safely.
- Keep engine-specific systems at typed extension boundaries. Molang state, audio, and particles differ between games.
- Prefer native Three.js objects and tracks so existing render, mixer, inspection, and disposal workflows continue to work.
- Optimize measured hot paths. Format correctness and debuggability come first.

## Reporting security issues

Do not open a public issue for a vulnerability. Use GitHub's private security advisory flow for the repository.
