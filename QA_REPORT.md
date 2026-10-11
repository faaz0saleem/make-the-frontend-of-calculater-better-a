# QA REPORT — Wobble Haul

Everything below was run in this repository's cloud container on 2026-10-10. Raw outputs are committed in `qa/` (`e2e-results.json`, `layout-report.json`, `budget.json`, `perf.json`, `screenshots/`). Nothing here was run on a real GPU, a phone, Safari, Firefox, Edge, or the CrazyGames portal; see "Not verified" at the end.

## Test environment
| | |
|---|---|
| OS | Linux 6.18 container, 4 vCPU |
| Node / npm | Node 22.22.0, npm 10 |
| Browser | Chromium 141.0.7390.37 headless (Playwright 1.56.1, browser build 1194) |
| WebGL | ANGLE → SwiftShader (Vulkan, **software rasteriser**, no GPU) |
| Hosting during tests | `scripts/serve-nested.mjs`: production `dist/` served under `/games/wobble-haul/` inside an `<iframe>` of a host page, like a portal |
| Platform adapter during tests | `standalone` (localStorage) because the CrazyGames SDK host is not reachable from this container. The SDK adapter itself is covered by unit tests with a fake SDK |

## Results summary
| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | pass (0 errors) |
| Unit tests | `npm test` | **UNIT_COUNT / UNIT_COUNT pass** (7 files) |
| E2E flows + input | `npm run build && E2E_JSON=qa/e2e-flows-results.json npx playwright test tests/e2e/flows.spec.ts tests/e2e/input.spec.ts` | E2E_RESULT — see `qa/e2e-flows-results.json` |
| Screenshot matrix + layout audit | `npx playwright test tests/e2e/screens.spec.ts` | MATRIX_RESULT |
| Bundle budget | `npm run budget` | all checks pass — see "Bundle" |
| Upload ZIP | `npm run package` | `release/wobble-haul-basic.zip`, `index.html` at the root |
| Boot timing | `node scripts/perf.mjs boot` | 1.3–2.1 s to the interactive menu (local server) |
| Per-preset render cost | `node scripts/perf.mjs fps` | see "Performance" |
| Browser soak | `node scripts/perf.mjs soak 8` | see "Soak" |

## Unit tests (Vitest, `tests/unit`)
| File | Tests | What it proves |
|---|---|---|
| `loop.test.ts` | 7 | Same number of fixed steps at 30/60/144 Hz; bounded catch-up after a stall; no stepping while stopped; interpolation alpha in [0,1); pause reasons only resume when all are cleared; FSM rejects illegal transitions |
| `sim.test.ts` | 19 | Stack at rest stays put; taller stack wobbles more; top item most exposed; wind affects light/tall cargo more; heavy items squash fragile ones; van walls lock the bottom item; flatbed uses two columns; **deterministic and frame-rate independent with scripted input** (30, 60 and 144 Hz frame timing give identical truck and per-item stack state at step 3,500, equal to a direct fixed-step replay); coins/cargo pickup; head-on vs glancing collisions; beams knock exactly the items above clearance; beam below cab = crash; shed; ramp clears a chasm; drop edge = fall; depot banking and multiplier; revive; tall heavy stack in a tight fast corner rolls over |
| `levels.test.ts` | 6 | 30 levels (10 per world) reference real chunks/cargo; every non-tutorial level is 60–90 s at its average speed (measured 61–82 s; the tutorial is 36 s by design); targets ≤ ~60 % of the best 8 items; **a crash-free route exists for every truck across each level's speed range**; the scripted driver completes all 30 levels with the starter truck (zero failures required) |
| `endless.test.ts` | 6 | Speed envelope; **every generated sequence keeps a crash-free route (40 seeds × max difficulty × slowest/widest trucks)**; no immediate repeats, depots on schedule; 30 km drive recycles track and rebases with bounded memory; **scripted 20-minute Long Haul run (simulation only, no renderer) stays bounded (features < 260, segments < 60)**; daily routes deterministic per date |
| `progression.test.ts` | 23 | Purchases never go negative; double-clicks cannot double-charge; upgrades need the expected tier; unknown/unowned items rejected; Spare Tires capped, stale-guarded, never in Daily; cosmetics never change handling; the cheapest first purchase costs 250–450 coins (≈ 2–3 runs at an assumed ~150 coins per run); **run settlement applies once per runId (re-entry and reload safe)**; crash forfeits only unbanked cargo; medals never lost; daily bonus once per UTC date and rejects clock rollback; save round-trip ≪ 1 MB; a fully progressed save (all levels, album, a year of daily scores) < 20 KB; writes above the 900 KB guard are refused and the stored copy kept; v1 → v2 migration; sanitiser; corrupt JSON backed up; **failed initial read never overwrites the stored save**; newer-version save left untouched; account change reloads instead of merging; save failures retried |
| `platform.test.ts` | 16 | Loading/gameplay events de-duplicated; `gameplayStart/Stop` only during real driving; platform mute overrides volume; Data module used as storage; **Basic build never requests ads**; adFinished/adError mapping, duplicate/late callbacks ignored; SDK that throws resolves to an error; pause/mute reasons around ads; no reward on error, overlapping requests rejected; timeout instead of a stuck player; an ad that has started is not cut off by the request timeout, and a playing ad that never reports an end is released by a safety timeout; every ad's end time is recorded for midgame pacing; duplicate reward for the same request id ignored |
| `data.test.ts` | 4 | Catalogue sizes and unique ids; prices/costs valid and rising; cargo values sane; trucks have distinct profiles |

## E2E (Playwright, production build, nested-path iframe)
Flows use the query-gated test hooks (`?qa=1`) to read state, to force a crash or finish through `__wh.game` where a test needs one, and, where a whole level must be driven, to run the scripted driver at an accelerated simulation rate (SwiftShader renders at only a few frames per second). Keyboard and mouse tests use real Playwright input. The touch drag is synthesized `PointerEvent`s in a touch-enabled mobile context; the SHED tap is a real Playwright tap.

| Test | Covers |
|---|---|
| fresh player: one gesture into the tutorial delivery, then menus | First launch shows only a "tap to drive" title; one click starts the tutorial; no `gameplayStart` before that; tutorial completes; start/stop pairs match; reload restores coins |
| campaign: crash, results, retry, then a successful delivery unlocks the next level | Crash → results → retry → success → next level unlocked; no ad offer on the crash screen (Basic build) |
| world unlock and medal replay requirements are shown | World 2 opens after Harbor 10; the briefing shows earned medals and their requirements |
| Long Haul: banking at depots, then a crash forfeits only unbanked cargo | Bank-or-carry rule end to end |
| Daily Contract: completion bonus once, replays still record scores | One-time bonus, replays recorded |
| garage: buy (two-step confirm), equip, upgrade, reload and drive with it | Atomic purchase UI, persistence across reload, equipped truck used in the run; no paint-trial ad button (Basic build) |
| pause safety: hidden tab and focus loss pause, resume needs intent plus countdown | A hidden tab pauses and mutes; window blur pauses; returning opens the pause menu without any extra `gameplayStart`; resuming needs a click plus a countdown |
| SDK unavailable: default URL still boots to a playable title (no blank screen) | No blank screen when the SDK cannot load |
| keyboard steering, Space shed, P pause | ArrowRight and A steer, Space sheds, P pauses |
| mouse drag steers; releasing stops steering | Pointer drag |
| touch › horizontal touch drag steers and the SHED button works | Touch-enabled mobile context (`hasTouch`, `isMobile`) |

## Screenshot matrix (`qa/screenshots/<size>-<screen>.png`)
Sizes: the ten CrazyGames reference sizes 907×510, 1216×684, 1077×606, 821×462, 1366×768, 1920×1080, 1536×864, 1280×720, 800×450, 1080×607, plus phone portrait 390×844 and phone landscape 844×390 (touch, mobile). Screens per size: menu, levels, briefing, HUD (mid-run with cargo), pause, results, garage, garage-upgrades, settings. All captured at the **Low** preset (the most constrained case).

The audit (`tests/e2e/screens.spec.ts`) checks every visible button on every screen for: outside the viewport (unless inside a scroll container), text overflowing the button, touch target smaller than 36 px, overlap with another button (using the part visible through its scroll container), and headings/HUD pills clipped by the viewport. It measures after entry animations have finished.

History: the first full run found 30 issues — settings toggles at 53×31 px (they were measured mid pop-in animation and were also small at 58×34) and garage list rows "overlapping" the Equip button (rows hidden below the list's scroll edge). Toggles were enlarged to 66×40 px and the audit was corrected to wait for animations and to use the visible part of scrolled items. The final run reports 0 findings. Screens were also reviewed by eye at 800×450, 821×462, 907×510 and 390×844.

High-preset rendering is exercised by the cover/video capture (High, 1920×1080 and 1080×1620) and the `fps` measurement; the matrix itself is Low only.

## Bundle (`qa/budget.json`)
See the file for per-file sizes. Initial download (HTML + JS + CSS + fonts) ≈ 0.92 MB (≈ 0.34 MB gzip for the whole bundle), total ≈ 1.0 MB, no source maps, `index.html` at the root, relative asset paths only. CrazyGames limits: 50 MB initial / 20 MB mobile initial / 250 MB total / 1,500 files.

## Performance (`qa/perf.json`)
**Caveat:** SwiftShader is a CPU rasteriser. Its frame rates are 10–100× below a real GPU and must not be read as player FPS. The GPU-independent numbers (draw calls, triangles, GPU resource counts, JS heap) are the useful part.

### Boot
3 cold browser contexts, Low preset, local HTTP server (no network latency, no SDK download):

| Run | Navigation → interactive menu | DOMContentLoaded | Transferred |
|---|---|---|---|
| 1 | 2.07 s | 70 ms | 941 KB |
| 2 | 1.30 s | 86 ms | 941 KB |
| 3 | 1.61 s | 74 ms | 941 KB |

Most of that time is shader compilation and scene setup in the software renderer.

### Per-preset render cost, Long Haul, 1280×720
PERF_TABLE

Low-preset fix made during QA: the first measurement showed ~190k triangles per frame at Low, ~160k of them from rounded-box scenery. World scenery is now built with fewer rounding segments and coarser curves at Low (`withLowDetail` in `src/render/geo.ts`), which cut scenery triangles by about 55 % with no visible change at gameplay distance (checked by screenshot). Trucks and cargo keep full detail.

### Soak
SOAK_SECTION

## Media
Covers and preview videos are rendered by the game itself; see `media/README.md` for exactly how and what was staged.

## Known issues / risks
- **Real-device performance is unmeasured.** The Low preset is designed for 4 GB Chromebooks and phones (no shadows, no bloom, 45 % scenery density, pixel ratio capped at 1, low-detail scenery). Auto starts phones and ≤ 2-core / ≤ 2 GB devices on Low and ≤ 4-core / ≤ 4 GB devices on Medium, then steps down one preset after 5 s below 40 FPS while driving. No real device was available to confirm this.
- **Audio was never heard.** The WebAudio graph runs and the mute/volume logic is unit-tested, but the mix (levels, music loop, engine tone) has not been judged by ear.
- **Feel/difficulty tuning is bot-validated, not player-validated.** Reachability and completion are proven by the solver and the scripted driver. Whether the stack physics feels fair and fun needs human playtesting.
- Tyre-mark decals are not implemented (dust and sparks only).
- `qa/e2e-results.json` is overwritten by every Playwright run, so it holds whichever spec ran last.

## Not verified (needs the owner, a real device, or the CrazyGames portal)
- CrazyGames portal QA tool: SDK environment `crazygames`, live `gameplayStart/Stop`, Data module round-trip for a guest and a signed-in account, platform mute setting, CrazyGames app safe area.
- Live SDK script loading (the SDK host is not reachable from this container; the fallback path is tested).
- Edge, Firefox and Safari (desktop and iOS); Android Chrome on a real phone.
- Real-GPU frame rate on desktop and on a 4 GB RAM Chromebook.
- Full Launch ad flows against real ads (only a simulated platform and unit tests).
- A human-played 20-minute session (the 20-minute run was driven by the scripted driver).
