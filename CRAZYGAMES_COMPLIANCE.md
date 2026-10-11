# CRAZYGAMES COMPLIANCE — Wobble Haul

**Date checked:** 2026-10-10 (the brief was researched on 2026-10-11; the clock in this environment reads 2026-10-10).

**How the docs were accessed:** direct requests to `docs.crazygames.com` were refused by this environment's network policy (curl: proxy 403; the fetch tool could not resolve the host). Current requirements were therefore read **through web-search result summaries of the official pages**, not by reading each page in full. Where a summary did not include a detail, the item is marked `not verified` and listed under "Revalidation needed". **Policy revalidation is partially blocked.** The owner (or a session with docs access) must re-read every source page in full before submitting.

**Status legend:** `pass` = implemented and validated locally (evidence given) · `fail` · `not applicable` (reason given) · `not verified` = needs the live portal/QA tool, a real device, or a full read of the page.

**Evidence keys:** U = unit tests (`npm test`, UNIT_COUNT passing) · E = Playwright e2e against the production build in a nested-path iframe (`npx playwright test tests/e2e/flows.spec.ts tests/e2e/input.spec.ts`, 11 passing; results in `qa/e2e-flows-results.json`) · S = screenshot matrix + layout audit (`qa/screenshots`, `qa/layout-report.json`) · B = `npm run budget` (`qa/budget.json`) · C = code reference.

## Sources
| Id | Page | URL |
|---|---|---|
| S1 | Requirements overview | https://docs.crazygames.com/requirements/intro/ |
| S2 | Technical requirements | https://docs.crazygames.com/requirements/technical/ |
| S3 | Gameplay requirements | https://docs.crazygames.com/requirements/gameplay/ |
| S4 | Advertisement requirements | https://docs.crazygames.com/requirements/ads/ |
| S5 | Account integration | https://docs.crazygames.com/requirements/account-integration/ |
| S6 | Game covers & preview videos | https://docs.crazygames.com/requirements/game-covers/ |
| S7 | Quality guidelines (incl. restricted keys) | https://docs.crazygames.com/requirements/quality/ |
| S8 | SDK introduction (HTML5 v3) | https://docs.crazygames.com/sdk/intro/ |
| S9 | SDK Game module (events, settings) | https://docs.crazygames.com/sdk/game/ |
| S10 | SDK Data module | https://docs.crazygames.com/sdk/data/ |
| S11 | SDK Video ads | https://docs.crazygames.com/sdk/video-ads/ |
| S12 | Basic Launch guide | https://docs.crazygames.com/resources/basic-launch-metrics/ |
| S13 | CrazyGames App (safe area) | https://docs.crazygames.com/resources/crazygames-app/ |
| S14 | HTML5 Sitelock (+ FAQ note on app origins) | https://docs.crazygames.com/resources/html5/sitelock/ , https://docs.crazygames.com/faq/ |
| S15 | Multiplayer requirements | not located by search; probably under https://docs.crazygames.com/requirements/ (not verified) |
| S16 | In-game purchases | https://docs.crazygames.com/sdk/in-game-purchases/ |
| S17 | Midgame ad placement guidance | https://docs.crazygames.com/resources/midgame-ads-pacing/ , https://docs.crazygames.com/resources/ad-monetization-guide/ , https://docs.crazygames.com/resources/monetizing-driving/ |

## A. Launch stages (S1, S12)
| Requirement | Applies | Implementation | Evidence | Status |
|---|---|---|---|---|
| Basic Launch needs no SDK; if the SDK is integrated, ads stay disabled and no revenue is shared | Yes | Default build is Basic. SDK v3 is integrated for loading/gameplay events, mute and the Data module. `adsAvailable` is false for stage `basic`, and no ad UI is ever rendered | U `platform.test.ts › Basic Launch build never requests ads`; C `src/platform/crazygames.ts`, `vite.config.ts` | pass |
| If the SDK is integrated in Basic Launch, the gameplay start event is required | Yes | `gameplayStart` fires on real driving | U lifecycle test; E `fresh player…` checks start/stop pairing | pass (local); portal QA not verified |
| Full Launch requires selection based on Basic Launch KPIs, then full integration and review | Yes (future) | `npm run build:full` enables Full code paths only; README states this grants no approval | C README "Release stages" | not verified (owner/portal) |
| Developer terms / portal submission | Yes | No terms accepted and nothing submitted from this repo | — | not verified (owner action) |

## B. Technical (S2)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Initial download ≤ 50 MB | 0.92 MB initial (JS + CSS + woff2) | B | pass |
| Total bundle ≤ 250 MB; ≤ 1,500 files | 0.98 MB, 12 files (incl. license texts) | B | pass |
| Mobile homepage: initial download ≤ 20 MB | 0.92 MB | B | pass |
| Without the SDK the total counts as initial; with the SDK, measurement runs until `gameplayStart` | Both are tiny. First playable content (tutorial behind one click) appears after boot; `gameplayStart` fires only when the truck actually starts driving after the click | B; E `fresh player…` | pass |
| Externally loaded builds: 20 s time-to-gameplay | Not externally loaded (everything is in the ZIP). Measured boot-to-title on a local server: see QA_REPORT | QA_REPORT | not applicable / informational |
| Relative asset references | `base: './'`, budget check `relative_asset_paths` | B; E runs under `/games/wobble-haul/` | pass |
| Works on Chrome and Edge | Developed and tested on Chromium 141 (Playwright 1.56.1, browser build 1194). Edge (Chromium) not run here | E | Chrome pass; Edge not verified |
| Smooth on a 4 GB RAM Chromebook | Low/Auto presets, capped resolution, bounded objects. No real device here | QA_REPORT perf | not verified (device) |
| Safari works (otherwise disabled on Safari) | No WebKit-only APIs; audio unlock on gesture; `webkitAudioContext` fallback. Not run on Safari | — | not verified |
| Keyboard, mouse and touch controls | A/D/arrows, mouse drag, touch drag, SHED/pause buttons | E `input.spec.ts` (3 tests) | pass |
| Desktop playable in landscape | Default layout | S (10 landscape sizes) | pass |
| Mobile orientation configured in submission, no forced lock | No orientation lock; portrait layout and FOV adapt | S 390×844 and 844×390 | pass; portal setting is an owner action |
| Prevent unwanted text selection | `user-select: none` and `-webkit-touch-callout: none` on body; `touch-action: none` on the canvas; `touchmove` prevented only on the play surface | C `src/ui/base.css`, `src/input/input.ts` | pass (local) |
| Restore interrupted (iOS) audio through a user gesture | `AudioContext.resume()` on pointerdown, key input and visibility return; context is created on the first gesture | C `src/audio/audio.ts` `unlock`/`resumeIfNeeded`, `src/game/game.ts` | pass (code); iOS device not verified |
| Consent if additional personal data is collected | None collected: no analytics, no tracking, no cookies | C | not applicable |
| Mobile games work in the CrazyGames app (safe area) | See section J | | |

## C. Gameplay & content (S3, S7)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| English | All UI in English. No translations, so no locale switching; `platform.locale()` is wired for future use | C | pass |
| Gameplay independent of refresh rate | Fixed 120 Hz step, bounded catch-up, interpolation | U `loop.test.ts`; `sim.test.ts › is deterministic and frame-rate independent` (30/60/144 Hz frame timing give identical truck and stack state at step 3,500) | pass |
| Readable at listed iframe sizes (DPR 1): 907×510, 1216×684, 1077×606, 821×462, 1366×768, 1920×1080, 1536×864, 1280×720, 800×450, 1080×607 | Responsive CSS with clamp() typography and short-height breakpoints | S: 9 screens × 10 sizes + 2 phone sizes, automated overlap/clip audit (0 findings) | pass |
| Original content; PEGI 12 compliant | Original procedural art and audio; cartoon crashes only | ASSET_LICENSES.md | pass (owner confirms the rating questionnaire) |
| No custom fullscreen button (platform provides fullscreen) | None | C (search `requestFullscreen`: none) | pass |
| No cross-promotion, app-store links or promotional outbound links | No links at all in the game UI | C (no `<a href>` in `src/ui`) | pass |
| Full Launch: new players enter gameplay directly or with at most one click | Fresh save → title over the live 3D scene → one "Tap to drive" click → driving | E `fresh player…` (state `title` → one click → `driving`/gameplay true) | pass |
| Restricted keys: avoid Escape (closes fullscreen) and browser shortcuts | Pause is P or the on-screen button. Escape is unbound. Key-downs with Ctrl/Cmd/Alt are ignored and never `preventDefault`-ed, so browser shortcuts keep working | C `src/input/input.ts` `key()` | pass (code) |
| Support different keyboard layouts | Physical key codes (`KeyA`/`KeyD`) plus arrows, so AZERTY works | C; E keyboard test | pass |

## D. SDK v3 integration (S8)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Load `https://sdk.crazygames.com/crazygames-sdk-v3.js`, then `await window.CrazyGames.SDK.init()` before using modules | Script injected dynamically with a 9 s timeout (deviation from the static `<script>` example; see DECISIONS #15); `init()` awaited before any module use | C `src/platform/crazygames.ts`, `select.ts` | pass (code); real SDK not loadable here → not verified live |
| No v2 API mixed in | Only the v3 surface is used (`SDK.game.*`, `SDK.data.*`, `SDK.ad.requestAd`, `SDK.user.addAuthListener`) | C | pass |
| Outside CrazyGames domains the environment is `disabled` and calls throw | `environment === 'disabled'` → standalone adapter (local save, no ads). A failed script load → standalone; memory-only when the host looks like CrazyGames | C `src/platform/select.ts` `selectPlatform`; E `SDK unavailable…` proves only that a missing SDK never blank-screens | pass (code) |
| Simulated ads only in explicit dev tests | `DevPlatform` exists only in dev builds (`?platform=dev`, gated by `__DEV_TOOLS__`, false in `vite build`); `npm run budget` checks the production JS contains none of its strings (`no_dev_platform`) | B; C `select.ts`, `vite.config.ts` | pass |

## E. Lifecycle & audio settings (S9)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| `gameplayStart`/`gameplayStop` paired with real play; not during menus, pause, ad waits or results; no duplicates | `GameplayGate` derives the state from FSM `driving` + no pause reason + run in progress. The adapter de-duplicates too. Tab-return, refocus and Spare-Tire revive open the pause/countdown before dropping the old reason, so there is no zero-length start/stop blip | U `platform.test.ts › gameplayStart/Stop follow real driving only`, `de-duplicates`; E `fresh player…` (start/stop counts equal), `pause safety…` (no extra `gameplayStart` on tab return or refocus) | pass |
| `loadingStart`/`loadingStop` bracket real loading | Called right after SDK init, around save load → fonts → renderer/scene setup → first screen (`main.ts`). SDK script loading and `init()` happen before the bracket because the SDK is needed to send it | C `src/main.ts` | pass (code) |
| Honour `game.settings.muteAudio` at init and via the settings listener; platform mute overrides the user setting | Read at boot → mute reason `platform`; the settings listener toggles it (the game object lives for the whole page, so the listener is never removed) | U `reads muteAudio…` (adapter), `platform mute overrides…` (audio reasons); C `src/game/game.ts` `bindLifecycle` (wiring) | pass |
| Combine platform, user, tab and ad mute reasons so ending one doesn't cancel another | `AudioManager` mute is a set of reasons | U | pass |

## F. Saves & accounts (S5, S10)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Data module is the authoritative progress store on CrazyGames (guests and accounts); avoid relying on local saves | `CrazyDataStorage` (key `wobblehaul.save`) when the SDK environment is `crazygames`/`local`. There is no competing localStorage database on the platform | U `uses the Data module as storage`; C `src/progression/storage.ts` | pass (local fake); live not verified |
| Enable "Progress Save" in the submission flow | Documented in README and SUBMISSION.md | — | not verified (owner action) |
| Await init and read existing data before defaults | `ProgressStore.init()` awaits `load()` before the game is built | C `src/main.ts` | pass |
| ≤ 1 MB | New save 0.8 KB; all 30 levels + full album ≈ 3 KB; plus a year of daily scores ≈ 11 KB. Writes above 900 KB are refused and the stored copy is kept | U `stays far below the 1 MB…`, `a fully progressed save is still tiny`, `refuses to write a save above the size guard…` | pass |
| Errors handled honestly; never overwrite account data with defaults | Read failure → memory-only + notice; future-version save → read-only; corrupt → backed up | U `a failed initial read never overwrites…`, `newer build…`, `corrupt JSON…` | pass |
| Schema versions and tested migrations | v2 schema with a v1→v2 migration (v1 is an unreleased legacy layout that keeps the migration path real and tested) and a sanitiser | U `migrates a v1 save…`, `sanitises malformed values…` | pass |
| Account change: reload the right save, never merge currencies | `onAuthChange` → abandon run (unsettled) → `store.reload()` | U `account change reloads…` | pass (logic); live guest→account sync not verified |
| Guest play allowed; no external login or automatic login prompts | No login UI at all | C | pass |
| Full Launch: progress linked to the CrazyGames account (via Data module); username/avatar where applicable | Progress via Data module. The game shows no player identity, so username/avatar display doesn't apply | — | pass / not verified live |

## G. Ads policy (S4)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Only CrazyGames SDK ads | No other ad code | C | pass |
| Basic: no ads or ineffective ad buttons | No ad UI unless `stage === 'full'` and the SDK environment is `crazygames`/`local` | U `Basic Launch build never requests ads`; E `campaign…` (no ad offer on the crash screen) and `garage…` (no paint-trial button); C `crazygames.ts` `adsAvailable` | pass |
| Game runs properly with ads disabled / adblock / no fill | Every ad path resolves to an outcome; errors fall back to normal flow | U `AdController` tests | pass |
| Never interrupt active play, chain ads, or show midgame ads from navigation | Midgame only on Retry/Next at a results screen, ≥ 3 min into the session, never in the same break as a rewarded offer, and never within 3 min of any other ad (including a Garage paint trial) | C `Game.maybeMidgame`; U `records the end time of every ad…` | pass (code); live not verified |
| Rewarded: explicit consent, clear labels, equal-weight no-ad option; not too often | The crash-screen offer appears at most every 3rd crash, only with 0 Spare Tires, never in Daily. Equal-size "No thanks". Paint trial is opt-in in the Garage. Everything is also obtainable with coins | C `src/ui/screens.ts` crashed(), `src/ui/garage.ts` | pass (code); Full build UI not screenshot-audited |
| Reward only on success, never on error; idempotent | `granted` only when `status === 'finished'`; `grantAdReward(requestId)` is single-use | U `never grants…`, `duplicate reward grant…` | pass |
| No levels that require ads | Ads never gate progress; retries are free | — | pass |
| Banner ads | None | — | not applicable |

## H. Ad lifecycle (S11)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Pause when requesting; mute when the ad actually starts (`adStarted`); release on finish/error | Pause reason `ad` on request; mute reason `ad` in `onStarted`; both removed when the SDK reports the end, leaving other reasons intact. Once an ad has started, the request timeout no longer applies (a 3-minute safety net replaces it) | U `pauses while requested, mutes only after…`, `an ad that starts in time is not cut off…`, `a playing ad that never reports an end…` | pass |
| Handle `adsDisabledBasicLaunch`, `unfilled`, `adblock`, `adCooldown`, others | All map to `{status:'error', code}`; no reward; flow continues | U `maps adFinished / adError…` | pass |
| No stranded spinner; prevent overlapping requests; late/duplicate callbacks | 60 s timeout for an ad that never starts; `busy` guard; adapter ignores callbacks after the first resolution; an `adStarted` after that timeout is ignored | U `times out…`, `rejects overlapping…`, `ignores duplicate or late callbacks` | pass |

## I. Placement for this game (S4, S17)
| Item | Implementation | Status |
|---|---|---|
| Optional reward (recovery token / cosmetic trial), also buyable with coins | Spare Tire (140 coins) / paint trial (paints are buyable) | pass (code) |
| Free restart always available; Daily never allows recovery | Retry is free everywhere; `useToken('daily')` is refused and no offer appears in Daily | U `spare tires… never usable in the Daily Contract`; pass |
| Midgame only at genuine round boundaries after initial gameplay; let the SDK enforce frequency (≈1 per 3 min, including rewarded/preroll); no retry loops on rejection | Single request per boundary, no retry | pass (code) |
| Disabled in the default Basic build | Yes | pass |

## J. Mobile app & embedding (S13, S14)
| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Important UI inside safe areas (notches, rounded corners) | All HUD/menu layers pad with `env(safe-area-inset-*)`; `viewport-fit=cover` | C `src/ui/styles.css` | pass (code); app/device not verified |
| `applicationType` hint for app padding | Not used; safe-area CSS applies everywhere (documented recommendation for HTML5) | — | not applicable / not verified |
| Sitelock optional; if used, allow `https://app.crazygames.com` and `capacitor://app.crazygames.com` | No sitelock and no `frame-ancestors` restriction | E runs inside an iframe on another path | pass (not used) |

## K. Excluded categories (S15, S16)
| Category | Applicability | Reason |
|---|---|---|
| Multiplayer, chat, rooms, invites, UGC (S15) | not applicable | Single-player only; no networking beyond the SDK. Re-audit if scope changes |
| In-game purchases / real-money IAP (S16) | not applicable | Shop uses earned coins only; no checkout, payment buttons or premium currency. CrazyGames IAP is a separate approval if ever wanted |

## L. Submission media (S6)
| Requirement | Implementation | Status |
|---|---|---|
| Covers: 1920×1080, 800×1200, 800×800; no borders, store logos/icons, blur or text beyond the title | `media/cover-*.png` rendered from the game with only the title | see `media/README.md` (status there) |
| Preview videos 16:9 and 2:3 (1080p), 15–20 s, ≤ 50 MB, cover as first frame, no audio/black bars/logo transitions/cursor/promo text/fast-forward | `scripts/capture.mjs` steps the real game clock 1/30 s per frame; hard cuts between three gameplay clips; no audio track | see `media/README.md`; confirm export interpretation (portrait = 1080×1620) in the portal |

## Revalidation needed (owner / portal)
1. Re-read S1–S17 in full (docs were only accessible via search summaries here). In particular check: the full gameplay page wording on links/fullscreen, the exact preview-video spec (resolution/fps/codec), the multiplayer page URL, any new SDK v3 method names (`addAuthListener` on v3 user module, `addSettingsChangeListener`), and the current midgame frequency rule.
2. Run the portal's preview/QA tool on the uploaded ZIP: SDK environment, gameplay events, Data module save/load for a guest and a signed-in account, the guest → login sync behaviour, and the mute setting.
3. Real devices: 4 GB Chromebook (Chrome), Safari (macOS + iOS), Edge, an Android mid-range phone, and the CrazyGames iOS/Android app (safe areas, audio resume after interruption).
4. Full Launch only: real ad delivery, cooldown behaviour, and the rewarded/midgame UI on a Full build.
5. Trademark/name clearance for "Wobble Haul" (DECISIONS #1).
