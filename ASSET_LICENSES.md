# ASSET LICENSES & PROVENANCE

Last reviewed: 2026-10-10.

## Shipped in the game bundle

| Asset | Source | License | Where | Notes |
|---|---|---|---|---|
| three.js 0.186.1 | npm `three` (three.js authors) | MIT | `dist/assets/index-*.js` | Notice in `dist/licenses/three.js-MIT.txt` |
| three.js examples addons (RoundedBoxGeometry, BufferGeometryUtils, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) | npm `three/examples/jsm` | MIT | bundled JS | Same license as three.js |
| Fredoka font, weights 400/600/700, latin subset (woff2 + woff fallback) | npm `@fontsource/fredoka` 5.3.0 (The Fredoka Project Authors) | SIL OFL 1.1 | `dist/assets/fredoka-*.woff2/.woff` | License text shipped in `dist/licenses/Fredoka-OFL-1.1.txt`; font not modified or renamed |

## Original, created for this project (no external sources)

| Asset | How it was made | File |
|---|---|---|
| All 3D models: 5 trucks, 7 accessories, 19 cargo items, props, buildings, cliffs, market stalls, cranes, depots, signs | Procedural geometry in code (rounded boxes, cylinders, extrusions merged with vertex colours) | `src/render/models/*`, `src/render/scenery.ts`, `src/render/world.ts` |
| Paint patterns (stripes, dots, checker, flames, two-tone) | Procedural geometry | `src/render/models/truck.ts` |
| Textures: asphalt noise, soft shadow blob, glow dot, sign faces, distant skylines | Drawn at runtime on `<canvas>` | `src/render/materials.ts`, `src/render/models/props.ts`, `src/render/sky.ts` |
| Sky dome gradient, particle shader | GLSL written for this project | `src/render/sky.ts`, `src/render/effects.ts` |
| UI icons (coin, cargo stack, pause, gear, garage, trophy, medal, etc.) | Hand-written inline SVG | `src/ui/icons.ts` |
| Album thumbnails | Rendered at runtime from the game's own cargo models | `src/render/thumbs.ts` |
| Engine loop, tyre squeal, wind, all sound effects | WebAudio synthesis at runtime (oscillators + filtered noise) | `src/audio/audio.ts` |
| Music (three per-world loops) | Procedural step sequencer with original note patterns | `src/audio/audio.ts` |
| Cargo names and descriptions, level names, UI copy | Written for this project | `src/data/*` |
| Cover images and preview videos | Captured from the game itself (see `media/README.md`) | `media/` (not part of the upload bundle) |

No stock assets, no third-party art, no audio samples, no AI-generated images, and nothing taken from Subway Surfers or any other game.

## Development-only tools (not shipped)

TypeScript 7.0.2 (Apache-2.0), Vite 8.3.1 (MIT), Vitest 5.0.3 (MIT), Playwright 1.56.1 (Apache-2.0), @types/three and @types/node (MIT). Exact versions are pinned in `package.json` and `package-lock.json`.
