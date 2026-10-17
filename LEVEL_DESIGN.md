# LEVEL DESIGN — Overloaded

_Generated from `src/data/levels.ts` and `src/data/chunks.ts` by `npx vitest run -c vitest.tools.config.ts leveldoc`. Do not edit by hand._

## Principles

- Every level is a hand-ordered sequence of authored road chunks (shared library) plus a level-specific cargo pool, speed ramp and objectives.
- Every run (campaign, Long Haul, Daily) opens with cargo dead ahead (`start_load`: the pool's sturdiest item; the tutorial uses a fixed crate), so the stack starts building about a second after the start with no input needed.
- Completion = reaching the depot. Three independent optional medals: **Delivery** (cargo value delivered ≥ target), **Route** (a route/skill objective), **Care** (cargo preservation).
- Delivery targets are 55% of the value of the best 8 non-rare pickups on offer (enforced ≤ 62% by tests).
- Levels 1–4 teach steering, stacking, wobble recovery, shedding under clearance, forks and delivering. Each later level adds one new decision or set piece; each world finale combines that world's mechanics.
- Every level is validated (unit test) to have a crash-free route for all five trucks across its speed range, and the scripted driver completes all 30 with the starter truck.

## World 1: Sunlit Harbor

| # | Level | New decision / set piece | Speed (m/s) | Length | Time @avg | Medals: Delivery / Route / Care |
|---|---|---|---|---|---|---|
| 1 | **First Delivery** (`h1`) | Steer, grab cargo, keep the stack upright, and deliver it to the depot. | 12.5→14 | 406 m | 31 s | ≥30 / Grab 20 road coins / Lose at most 2 items |
| 2 | **Corner Bakery** (`h2`) | Cakes are worth more but hate bumps. Ease into the corners. | 13.5→15 | 1162 m | 82 s | ≥60 / Deliver 2 cakes / Deliver 2 fragile items undamaged |
| 3 | **Mind the Awnings** (`h3`) | Striped awnings hang low. Check the clearance signs and shed if you must. | 14→15.5 | 1090 m | 74 s | ≥65 / Squeeze under 2 beams with < 35 cm to spare / Lose at most 2 items |
| 4 | **Fork in the Wharf** (`h4`) | Choose your route: the left lane pays more but is cluttered. | 14→16 | 1230 m | 82 s | ≥60 / Take the risky route at 2 forks / Deliver 80% of collected value |
| 5 | **Crate Expectations** (`h5`) | Solid barriers appear. Graze past them for near-miss bonuses. | 14.5→16 | 1134 m | 74 s | ≥50 / Pull off 3 near misses / Lose at most 2 items |
| 6 | **Swinging Cranes** (`h6`) | Harbor cranes swing their hooks at stack height. Time your pass. | 14.5→16 | 1182 m | 78 s | ≥65 / Carry 6 items at once / Lose at most 3 items |
| 7 | **Dockside Dash** (`h7`) | No railings by the water. Hug the edge for coins, but not too hard. | 15→16.5 | 1182 m | 75 s | ≥70 / Grab 50 road coins / Deliver 75% of collected value |
| 8 | **Rainy Pier** (`h8`) · wet | Wet boards and puddles. Smooth steering keeps the scrapes away. | 14.5→16 | 1202 m | 79 s | ≥60 / Finish without scraping a wall / Deliver 2 fragile items undamaged |
| 9 | **Drawbridge Run** (`h9`) | The drawbridge ramps launch you. Land straight to keep your load. | 15→17 | 1172 m | 73 s | ≥45 / Land 2 ramp jumps / Lose at most 2 items |
| 10 | **The Lighthouse Gala** (`h10`) | Finale: cakes for the gala through cranes, awnings and the old pier. | 15.5→17.5 | 1296 m | 79 s | ≥65 / Take the risky route at a fork / Deliver 3 fragile items undamaged |

## World 2: Canyon Express

| # | Level | New decision / set piece | Speed (m/s) | Length | Time @avg | Medals: Delivery / Route / Care |
|---|---|---|---|---|---|---|
| 1 | **Dusty Welcome** (`c1`) · windy | Canyon gusts push tall, light cargo. Lean into the wind. | 15→16.5 | 1192 m | 76 s | ≥90 / Deliver 2 TVs / Lose at most 2 items |
| 2 | **Tumbleweed Turns** (`c2`) | Switchbacks with open cliff edges. Steer early, steer gently. | 15→17 | 1278 m | 80 s | ≥95 / Grab 45 road coins / Deliver 80% of collected value |
| 3 | **Ramp It Up** (`c3`) | Ramps and crests. Keep the truck straight in the air. | 15.5→17.5 | 1148 m | 70 s | ≥85 / Land 3 ramp jumps / Lose at most 2 items |
| 4 | **Washboard Road** (`c4`) | Rippled road rattles fragile TVs. Every bump counts. | 15.5→17 | 1010 m | 62 s | ≥85 / Finish without shedding cargo / Deliver 2 fragile items undamaged |
| 5 | **Cliffside Shortcut** (`c5`) | A risky cliff jump on the left, a windy safe road on the right. | 16→17.5 | 1204 m | 72 s | ≥105 / Fly the cliff shortcut / Lose at most 2 items |
| 6 | **Windy Mesa** (`c6`) · windy | Strong crosswinds over a narrow bridge. Lower stacks feel safer. | 16→17.5 | 1082 m | 65 s | ≥95 / Carry 6 items at once / Deliver 75% of collected value |
| 7 | **Canyon Chasm** (`c7`) | The road just ends. Hit the ramp at speed and fly the gap. | 16.5→18 | 1200 m | 70 s | ≥95 / Land 4 ramp jumps / Lose at most 3 items |
| 8 | **Jukebox Hero** (`c8`) | Heavy, valuable jukeboxes. Build a steady base before stacking high. | 16.5→18 | 1192 m | 69 s | ≥130 / Deliver 2 jukeboxes / Deliver 80% of collected value |
| 9 | **Switchback Summit** (`c9`) | Climbing switchbacks with barriers at the apex. | 17→18.5 | 1320 m | 74 s | ≥95 / Pull off 4 near misses / Lose at most 2 items |
| 10 | **Canyon Express Finale** (`c10`) · windy | Finale: wind, chasms, cliff shortcuts and switchbacks in one haul. | 17→19 | 1350 m | 75 s | ≥115 / Fly the cliff shortcut 2 times / Deliver 2 fragile items undamaged |

## World 3: Midnight Market

| # | Level | New decision / set piece | Speed (m/s) | Length | Time @avg | Medals: Delivery / Route / Care |
|---|---|---|---|---|---|---|
| 1 | **Lantern Lane** (`m1`) | Moving gates and low underpasses in the glow of the night market. | 16→17.5 | 1136 m | 68 s | ≥95 / Grab 45 road coins / Lose at most 2 items |
| 2 | **Market Shuffle** (`m2`) | Stalls block the lanes and gates slide shut. Read the gaps. | 16.5→18 | 1140 m | 66 s | ≥145 / Pull off 4 near misses / Deliver 80% of collected value |
| 3 | **Underpass Maze** (`m3`) | Tunnels with fixed ceilings. Keep your stack under the line. | 16.5→18 | 1094 m | 63 s | ≥220 / Squeeze under 3 beams with < 35 cm to spare / Lose at most 2 items |
| 4 | **Rooftop Express** (`m4`) | Drive up onto the rooftops to skip the low street tunnels. | 17→18.5 | 1192 m | 67 s | ≥140 / Drive the rooftop route 2 times / Deliver 2 fragile items undamaged |
| 5 | **Neon Puddles** (`m5`) · wet | Rain-slick streets. Puddles steal your grip mid-turn. | 16.5→18 | 1134 m | 66 s | ≥130 / Finish without scraping a wall / Deliver 80% of collected value |
| 6 | **Fishy Business** (`m6`) | Fish tanks slosh on every bump. Gill, Bill and Phil are watching. | 17→18.5 | 1084 m | 61 s | ≥150 / Deliver 2 fish tanks / Deliver 2 fragile items undamaged |
| 7 | **Piano Movers** (`m7`) | Pianos and fridges: heavy bases make tall stacks possible. | 17→18.5 | 1122 m | 63 s | ≥185 / Carry 5 items at once / Lose at most 1 item |
| 8 | **Night Shift** (`m8`) | Rooftops, sliding gates and carts. Pick your line and commit. | 17.5→19.5 | 1194 m | 65 s | ≥185 / Land 3 ramp jumps / Deliver 75% of collected value |
| 9 | **Wedding Rush** (`m9`) | Seven-tier wedding cakes through the underpasses. No pressure. | 17→19 | 1108 m | 62 s | ≥200 / Deliver 2 wedding cakes / Deliver 3 fragile items undamaged |
| 10 | **Grand Market Finale** (`m10`) · wet | Finale: every trick of the market on one rain-slick night. | 17.5→20 | 1246 m | 66 s | ≥215 / Drive the rooftop route 2 times / Deliver 75% of collected value |


## Per-level route detail

### 1. First Delivery

- **Route:** 7 chunks — tutorial: first cargo (no input needed), tutorial: steering, tutorial: wobble & recovery, tutorial: shedding under a 2.9 m beam, tutorial: delivery.
- **Cargo pool:** Cardboard Parcel, Fish Crate, Potted Fern.
- **Objectives:** deliver ≥ 30; Grab 20 road coins; Lose at most 2 items.

### 2. Corner Bakery

- **Route:** 18 chunks — gentle curve, S-bend, tight curve.
- **Cargo pool:** Layer Cake, Cardboard Parcel, Fish Crate, Potted Fern.
- **Objectives:** deliver ≥ 60; Deliver 2 cakes; Deliver 2 fragile items undamaged.

### 3. Mind the Awnings

- **Route:** 18 chunks — low striped awning, gentle curve, split clearance (low left / high right), S-bend.
- **Cargo pool:** Cardboard Parcel, Squishy Armchair, Fish Crate, Striped Buoy.
- **Objectives:** deliver ≥ 65; Squeeze under 2 beams with < 35 cm to spare; Lose at most 2 items.

### 4. Fork in the Wharf

- **Route:** 17 chunks — risky/safe fork, gentle curve, cone slalom, S-bend.
- **Cargo pool:** Fish Crate, Cardboard Parcel, Striped Buoy, Layer Cake, Potted Fern.
- **Objectives:** deliver ≥ 60; Take the risky route at 2 forks; Deliver 80% of collected value.

### 5. Crate Expectations

- **Route:** 19 chunks — single barrier, crate wall, cone slalom, gentle curve, double barrier weave, thread-the-needle gap.
- **Cargo pool:** Fish Crate, Cardboard Parcel, Squishy Armchair, Striped Buoy.
- **Objectives:** deliver ≥ 50; Pull off 3 near misses; Lose at most 2 items.

### 6. Swinging Cranes

- **Route:** 18 chunks — swinging crane containers, gentle curve, unrailed dock edge, S-bend.
- **Cargo pool:** Fish Crate, Cardboard Parcel, Striped Buoy, Squishy Armchair, Potted Fern.
- **Objectives:** deliver ≥ 65; Carry 6 items at once; Lose at most 3 items.

### 7. Dockside Dash

- **Route:** 18 chunks — unrailed dock edge, narrow bridge with drops, parked carts, gentle curve.
- **Cargo pool:** Fish Crate, Striped Buoy, Cardboard Parcel, Layer Cake, Squishy Armchair.
- **Objectives:** deliver ≥ 70; Grab 50 road coins; Deliver 75% of collected value.

### 8. Rainy Pier

- **Route:** 18 chunks — puddles, S-bend, speed bumps, gentle curve, parked carts.
- **Cargo pool:** Layer Cake, Potted Fern, Cardboard Parcel, Fish Crate.
- **Objectives:** deliver ≥ 60; Finish without scraping a wall; Deliver 2 fragile items undamaged.

### 9. Drawbridge Run

- **Route:** 18 chunks — narrow bridge with drops, centre ramp jump, swinging crane containers, double barrier weave.
- **Cargo pool:** Fish Crate, Cardboard Parcel, Squishy Armchair, Striped Buoy, Potted Fern.
- **Objectives:** deliver ≥ 45; Land 2 ramp jumps; Lose at most 2 items.

### 10. The Lighthouse Gala

- **Route:** 19 chunks — swinging crane containers, fork with a low-beam cargo lane, narrow bridge with drops, split clearance (low left / high right), unrailed dock edge, centre ramp jump, double barrier weave.
- **Cargo pool:** Layer Cake, Squishy Armchair, Potted Fern, Fish Crate, Golden Garden Gnome.
- **Objectives:** deliver ≥ 65; Take the risky route at a fork; Deliver 3 fragile items undamaged.

### 11. Dusty Welcome

- **Route:** 18 chunks — gentle curve, crosswind zone, S-bend, hill crest (light cargo).
- **Cargo pool:** Cactus in a Pot, Boxy Television, Root Beer Barrel, Watermelon Crate.
- **Objectives:** deliver ≥ 90; Deliver 2 TVs; Lose at most 2 items.

### 12. Tumbleweed Turns

- **Route:** 17 chunks — cliff switchback, cone slalom, gentle curve, S-bend.
- **Cargo pool:** Root Beer Barrel, Cactus in a Pot, Watermelon Crate, Washing Machine, Boxy Television.
- **Objectives:** deliver ≥ 95; Grab 45 road coins; Deliver 80% of collected value.

### 13. Ramp It Up

- **Route:** 17 chunks — centre ramp jump, hill crest (light cargo), S-bend.
- **Cargo pool:** Root Beer Barrel, Watermelon Crate, Cactus in a Pot, Washing Machine.
- **Objectives:** deliver ≥ 85; Land 3 ramp jumps; Lose at most 2 items.

### 14. Washboard Road

- **Route:** 17 chunks — washboard bumps + gusts, speed bumps, gentle curve.
- **Cargo pool:** Boxy Television, Watermelon Crate, Root Beer Barrel, Cactus in a Pot.
- **Objectives:** deliver ≥ 85; Finish without shedding cargo; Deliver 2 fragile items undamaged.

### 15. Cliffside Shortcut

- **Route:** 17 chunks — cliffside shortcut jump, gentle curve, crosswind zone, S-bend.
- **Cargo pool:** Washing Machine, Root Beer Barrel, Cactus in a Pot, Watermelon Crate, Retro Jukebox.
- **Objectives:** deliver ≥ 105; Fly the cliff shortcut; Lose at most 2 items.

### 16. Windy Mesa

- **Route:** 17 chunks — crosswind zone, narrow bridge with drops, washboard bumps + gusts.
- **Cargo pool:** Cactus in a Pot, Boxy Television, Root Beer Barrel, Watermelon Crate, Washing Machine.
- **Objectives:** deliver ≥ 95; Carry 6 items at once; Deliver 75% of collected value.

### 17. Canyon Chasm

- **Route:** 17 chunks — full-width chasm jump, cliff switchback, centre ramp jump.
- **Cargo pool:** Root Beer Barrel, Washing Machine, Watermelon Crate, Cactus in a Pot.
- **Objectives:** deliver ≥ 95; Land 4 ramp jumps; Lose at most 3 items.

### 18. Jukebox Hero

- **Route:** 18 chunks — tight curve, S-bend, crosswind zone, hill crest (light cargo).
- **Cargo pool:** Retro Jukebox, Root Beer Barrel, Washing Machine, Boxy Television.
- **Objectives:** deliver ≥ 130; Deliver 2 jukeboxes; Deliver 80% of collected value.

### 19. Switchback Summit

- **Route:** 18 chunks — cliff switchback, single barrier, hill crest (light cargo), double barrier weave, crosswind zone, thread-the-needle gap.
- **Cargo pool:** Washing Machine, Boxy Television, Root Beer Barrel, Cactus in a Pot, Watermelon Crate.
- **Objectives:** deliver ≥ 95; Pull off 4 near misses; Lose at most 2 items.

### 20. Canyon Express Finale

- **Route:** 18 chunks — crosswind zone, cliffside shortcut jump, cliff switchback, full-width chasm jump, washboard bumps + gusts, narrow bridge with drops.
- **Cargo pool:** Boxy Television, Retro Jukebox, Washing Machine, Cactus in a Pot, Watermelon Crate, Golden Garden Gnome.
- **Objectives:** deliver ≥ 115; Fly the cliff shortcut 2 times; Deliver 2 fragile items undamaged.

### 21. Lantern Lane

- **Route:** 18 chunks — sliding gate, fixed-ceiling tunnel, gentle curve.
- **Cargo pool:** Paper Lantern Bundle, Neon OPEN Sign, Mint Fridge.
- **Objectives:** deliver ≥ 95; Grab 45 road coins; Lose at most 2 items.

### 22. Market Shuffle

- **Route:** 18 chunks — market stalls, sliding gate, parked carts.
- **Cargo pool:** Neon OPEN Sign, Paper Lantern Bundle, Mint Fridge, Fish Tank.
- **Objectives:** deliver ≥ 145; Pull off 4 near misses; Deliver 80% of collected value.

### 23. Underpass Maze

- **Route:** 18 chunks — fixed-ceiling tunnel, split clearance (low left / high right), low striped awning.
- **Cargo pool:** Mint Fridge, Neon OPEN Sign, Paper Lantern Bundle, Upright Piano.
- **Objectives:** deliver ≥ 220; Squeeze under 3 beams with < 35 cm to spare; Lose at most 2 items.

### 24. Rooftop Express

- **Route:** 17 chunks — rooftop route vs low tunnels, sliding gate, fixed-ceiling tunnel.
- **Cargo pool:** Neon OPEN Sign, Fish Tank, Paper Lantern Bundle, Mint Fridge.
- **Objectives:** deliver ≥ 140; Drive the rooftop route 2 times; Deliver 2 fragile items undamaged.

### 25. Neon Puddles

- **Route:** 18 chunks — puddles, market stalls, S-bend, sliding gate.
- **Cargo pool:** Neon OPEN Sign, Paper Lantern Bundle, Mint Fridge.
- **Objectives:** deliver ≥ 130; Finish without scraping a wall; Deliver 80% of collected value.

### 26. Fishy Business

- **Route:** 18 chunks — speed bumps, sliding gate, fixed-ceiling tunnel, market stalls.
- **Cargo pool:** Fish Tank, Paper Lantern Bundle, Mint Fridge, Neon OPEN Sign.
- **Objectives:** deliver ≥ 150; Deliver 2 fish tanks; Deliver 2 fragile items undamaged.

### 27. Piano Movers

- **Route:** 18 chunks — tight curve, fixed-ceiling tunnel, S-bend, split clearance (low left / high right).
- **Cargo pool:** Upright Piano, Mint Fridge, Neon OPEN Sign, Paper Lantern Bundle.
- **Objectives:** deliver ≥ 185; Carry 5 items at once; Lose at most 1 item.

### 28. Night Shift

- **Route:** 17 chunks — sliding gate, rooftop route vs low tunnels, parked carts, centre ramp jump, market stalls.
- **Cargo pool:** Neon OPEN Sign, Mint Fridge, Fish Tank, Paper Lantern Bundle, Upright Piano.
- **Objectives:** deliver ≥ 185; Land 3 ramp jumps; Deliver 75% of collected value.

### 29. Wedding Rush

- **Route:** 18 chunks — fixed-ceiling tunnel, gentle curve, split clearance (low left / high right), sliding gate, speed bumps.
- **Cargo pool:** Wedding Cake, Paper Lantern Bundle, Neon OPEN Sign, Mint Fridge.
- **Objectives:** deliver ≥ 200; Deliver 2 wedding cakes; Deliver 3 fragile items undamaged.

### 30. Grand Market Finale

- **Route:** 18 chunks — sliding gate, rooftop route vs low tunnels, fixed-ceiling tunnel, market stalls, puddles, split clearance (low left / high right).
- **Cargo pool:** Upright Piano, Wedding Cake, Fish Tank, Neon OPEN Sign, Mint Fridge, Golden Garden Gnome.
- **Objectives:** deliver ≥ 215; Drive the rooftop route 2 times; Deliver 75% of collected value.

## Difficulty progression

- Harbor (1–10): 12.5–17.5 m/s. Introduces soft hazards → hard barriers (5) → hooks (6) → drop edges (7) → wet grip (8) → ramps (9). Finale: hooks + low-beam fork + bridge + ramps with fragile cakes.
- Canyon (11–20): 15–19 m/s. Wind (11), switchbacks with cliff edges (12), jumps (13), washboard bumps with fragile TVs (14), cliff shortcut (15), strong crosswind bridge (16), chasms (17), heavy jukeboxes (18), apex barriers (19). Finale combines wind, chasms, shortcuts, switchbacks.
- Midnight Market (21–30): 16–20 m/s. Moving gates + tunnels (21), stalls (22), fixed ceilings (23), rooftop routes (24), rain (25), fish tanks (26), heavy pianos (27), mixed rooftop/gates (28), wedding cakes (29). Finale: everything on a wet night.

## Long Haul chunk library and envelope

Explicit envelope: speed 15 → 24 m/s over 4200 m (hard cap), obstacle difficulty 0 → 1 over 3600 m, wind scale up to ×1.4, rain sections from difficulty 0.45, world rotates every 2 depots. Depots every 700–950 m.

| Chunk | Worlds | Difficulty window | Weight | Tags |
|---|---|---|---|---|
| `cargo_line`  | 1, 2, 3 | 0–0.7 | 3 | cargo, breather |
| `cargo_trio`  | 1, 2, 3 | 0–1 | 3 | cargo, breather |
| `coin_weave`  | 1, 2, 3 | 0–1 | 2 | coins, breather |
| `gentle_curve` (gentle curve) | 1, 2, 3 | 0–0.8 | 3 | curve, cargo |
| `tight_curve` (tight curve) | 1, 2, 3 | 0.25–1 | 2 | curve, cargo |
| `s_bend` (S-bend) | 1, 2, 3 | 0.1–1 | 3 | curve |
| `hill_crest` (hill crest (light cargo)) | 1, 2, 3 | 0.1–1 | 2 | hill |
| `cone_slalom` (cone slalom) | 1, 2, 3 | 0–0.8 | 3 | hazard, soft |
| `crate_wall` (crate wall) | 1, 2, 3 | 0.1–1 | 2 | hazard, soft, cargo |
| `bump_run` (speed bumps) | 1, 2, 3 | 0.1–1 | 2 | bump |
| `puddle_lane` (puddles) | 1, 2, 3 | 0.15–1 | 2 | puddle |
| `barrier_single` (single barrier) | 1, 2, 3 | 0–0.8 | 3 | hazard, hard |
| `barrier_double` (double barrier weave) | 1, 2, 3 | 0.25–1 | 3 | hazard, hard |
| `needle` (thread-the-needle gap) | 1, 2, 3 | 0.35–1 | 2 | hazard, hard, cargo |
| `parked_carts` (parked carts) | 1, 3 | 0.15–1 | 2 | hazard, hard |
| `overhead_beam` (low striped awning) | 1, 2, 3 | 0.1–1 | 2 | overhead |
| `overhead_split` (split clearance (low left / high right)) | 1, 2, 3 | 0.25–1 | 2 | overhead |
| `ramp_center` (centre ramp jump) | 1, 2, 3 | 0.1–1 | 2 | ramp |
| `chasm_jump` (full-width chasm jump) | 2 | 0.3–1 | 1.5 | ramp, gap |
| `hook_swing` (swinging crane containers) | 1 | 0.15–1 | 2.5 | hook |
| `dock_edge` (unrailed dock edge) | 1 | 0.15–1 | 2 | edge, cargo |
| `narrow_bridge` (narrow bridge with drops) | 1, 2 | 0.2–1 | 2 | bridge, edge |
| `gust_zone` (crosswind zone) | 2 | 0.15–1 | 2.5 | wind |
| `switchback` (cliff switchback) | 2 | 0.3–1 | 2 | curve, edge |
| `washboard` (washboard bumps + gusts) | 2 | 0.2–1 | 1.5 | bump, wind |
| `moving_gate` (sliding gate) | 3 | 0.2–1 | 2.5 | moving, hard |
| `underpass` (fixed-ceiling tunnel) | 3 | 0.2–1 | 2 | overhead |
| `market_stalls` (market stalls) | 3 | 0.15–1 | 2 | hazard, hard, puddle |
| `fork_coins` (risky/safe fork) | 1, 2, 3 | 0.1–1 | 2 | fork |
| `fork_overhead` (fork with a low-beam cargo lane) | 1, 2, 3 | 0.25–1 | 2 | fork, overhead |
| `fork_cliff_jump` (cliffside shortcut jump) | 2 | 0.3–1 | 1.5 | fork, ramp, gap |
| `fork_rooftop` (rooftop route vs low tunnels) | 3 | 0.3–1 | 1.5 | fork, ramp, overhead |

Scheduled-only chunks: `start`, `start_load`, `finish`, `tut_cargo`, `tut_steer`, `tut_wobble`, `tut_shed`, `tut_deliver`, `depot_fork`.

Generation rules: weighted random pick inside the difficulty window; a chunk used in the last 2 picks is excluded and one used in the last 6 is down-weighted ×0.3; same leading tag as the previous chunk ×0.5; after two hazard chunks in a row breathers are boosted ×3. Each candidate is appended and validated by the reachability DP from the previous frontier (widest/slowest effective lateral speed at max speed, ramp flights at min and max speed, landing zones, current load clearance up to 4.8 m); failures are rolled back, up to 8 candidates, then a guaranteed breather.
