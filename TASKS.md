# TASKS — Wobble Haul

Living task list so work can resume across sessions. Status: `[x]` done · `[~]` partial · `[ ]` todo.

## Milestone 1 — Vertical slice
- [x] Project scaffold (TypeScript 7, Vite 8, three 0.186, Vitest 5, Playwright 1.56, pinned + lockfile)
- [x] Core: fixed-step loop with bounded catch-up + interpolation, seeded RNG, pause reasons, state machine
- [x] Data: tuning, 19 cargo items, 5 trucks, 14 paints, 7 accessories, 3×5 upgrades, economy, achievements, contracts
- [x] Simulation: track-space road, truck dynamics, mass-spring cargo stack, collisions, ramps/jumps, gusts, overheads, hooks, depots
- [x] Rendering: procedural trucks/cargo/props, 3 world themes, merged chunk geometry, sky, particles, follow camera
- [x] Tutorial (Harbor 1) behind a single "Tap to drive" gesture
## Milestone 2 — Modes
- [x] 30 authored campaign levels (data/levels.ts) using the chunk library
- [x] Endless generator with weighted picks, history rules, depots, rebasing, reachability validation
- [x] Daily Contract: UTC seed, loaner truck, no upgrades/continues, monotonic one-time bonus
## Milestone 3 — Meta
- [x] Save schema v2 + v1 migration + sanitiser; CrazyGames Data / local / memory adapters
- [x] Atomic transactions (buy/equip/upgrade/tokens), idempotent run settlement, contracts, achievements
- [x] Garage with turntable preview, comparison bars, two-step purchase confirm
- [x] Album with real model thumbnails, Goals screen, Settings (audio, graphics, shake, reduced motion, sensitivity)
- [x] Procedural audio (engine, tyres, wind, SFX, per-world music), combined mute reasons
- [x] Platform adapter (SDK v3 live / standalone / dev-only simulation), ad controller with request ids
## Milestone 4 — Validation & release
- [ ] Unit tests (loop, sim determinism, generator reachability, shop, save, daily, platform/ads)
- [ ] Playwright e2e against production build in nested-path iframe
- [ ] Screenshot matrix (10 sizes) + mobile portrait; low/high quality
- [ ] 20-minute endless soak (objects/memory/listeners/GPU resources)
- [ ] Bundle/file budget script, upload ZIP
- [ ] Cover images (1920×1080, 800×1200, 800×800) + preview videos (16:9, 2:3)
- [ ] Docs: README, DECISIONS, LEVEL_DESIGN, ECONOMY, CRAZYGAMES_COMPLIANCE, QA_REPORT, ASSET_LICENSES, SUBMISSION

## Known follow-ups
- Replace remaining emoji glyphs in UI tags with SVG icons
- Tyre-mark decals (currently dust/sparks only)
