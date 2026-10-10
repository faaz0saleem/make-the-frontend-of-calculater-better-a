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
- [x] Unit tests (loop, sim determinism, generator reachability, shop, save, daily, platform/ads): 76 passing
- [x] Playwright e2e against production build in nested-path iframe: 11 passing
- [x] Screenshot matrix (10 CrazyGames sizes + phone portrait/landscape, 9 screens each) with layout audit: 0 findings
- [~] Low/high quality: matrix at Low; High exercised by media capture and the per-preset measurement only
- [x] 20-minute endless soak: scripted 20-min sim soak (unit) + real-time browser soak (`scripts/perf.mjs soak`)
- [x] Bundle/file budget script, upload ZIP
- [x] Cover images (1920×1080, 800×1200, 800×800) + preview videos (16:9, 2:3), rendered in-engine
- [x] Docs: README, DECISIONS, LEVEL_DESIGN, ECONOMY, CRAZYGAMES_COMPLIANCE, QA_REPORT, ASSET_LICENSES, SUBMISSION, media/README
- [x] Low-preset triangle reduction (low-detail scenery geometry)

## Owner / portal actions (cannot be done from this repository)
- [ ] Re-read CrazyGames docs S1–S17 in full (only search summaries were reachable here) and re-check CRAZYGAMES_COMPLIANCE.md
- [ ] Upload `release/wobble-haul-basic.zip`, enable Progress Save (Data module), declare orientations
- [ ] Portal QA tool: SDK environment, gameplay events, Data module (guest + account), mute setting, app safe area
- [ ] Real-device checks: 4 GB Chromebook, Android, iOS Safari, desktop Safari/Firefox/Edge
- [ ] Human playtest for feel and difficulty; listen to the audio mix
- [ ] Confirm the 2:3 video export size (1080×1620) and cover text in the portal

## Known follow-ups
- Tyre-mark decals (currently dust/sparks only)
- A recorded human run for the preview video would show the wobble better than the scripted driver
