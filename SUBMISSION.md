# SUBMISSION COPY — Overloaded

Prepared for the CrazyGames developer portal. The owner must review it, choose final tags in the portal's own taxonomy, and submit. Nothing has been submitted from this repository.

## Copy-paste for the portal form (plain text)

Every claim below is checked against the game's data files (5 trucks in `src/data/vehicles.ts`, 14 paints + 7 extras in `src/data/cosmetics.ts`, 19 cargo types in `src/data/cargo.ts`, 30 levels in `src/data/levels.ts`).

### Description
```
Stack it high. Drive it home. Try not to drop the piano.

Overloaded is a 3D arcade delivery game about one gloriously bad idea: what if you just stacked everything on one tiny truck?

Your truck drives forward on its own - you steer. Grab parcels, cakes, fridges, pianos, fish tanks and a rare Golden Gnome, and every pickup piles onto a tower that leans, sways and wobbles with every turn. More cargo means more coins at the depot, but also a taller, heavier stack that is harder to keep upright.

Ease through corners to settle the wobble, dodge barriers and carts, ride the wind gusts, duck under low awnings and tunnels, and time your run past swinging crane containers. Too tall to fit? Shed the top item to save the rest - a well-timed sacrifice even earns a bonus.

- Delivery Tour: 30 hand-built deliveries across Sunlit Harbor, Canyon Express and Midnight Market, each with three medals to earn.
- Long Haul: an endless road. Bank your cargo at a depot to keep it safe, or keep driving for a bigger multiplier.
- Daily Contract: a new route, truck and weather every day.
- Garage: 5 trucks that really handle differently, 14 paint jobs, 7 fun extras and handling upgrades.
- 19 kinds of cargo to collect in your album, plus achievements and optional contracts.
- Original music for every world and punchy, comic sound effects.

Quick to learn, hard to master: your first delivery takes about 30 seconds, and keeping a ten-item tower alive through a night-market rush is another story. No timers, no energy, no paywalls - every coin is earned on the road.
```

### Controls
```
Steer: A / D or Left / Right arrow keys, or click and drag left/right with the mouse
Shed the top item: Space (or click the SHED button)
Pause: P (or the pause button)

Mobile: drag left/right anywhere on the screen to steer, tap SHED to drop the top item, tap the pause button to pause.
```

## Title
Overloaded

## Short description (≈160 characters)
Steer a tiny truck with a ridiculously tall stack of cargo through harbours, canyons and neon markets. Grab more, wobble more, deliver it all!

## Full description
Overloaded is a 3D arcade delivery runner about one simple, terrible idea: what if you just stacked everything?

Your little truck drives itself. Your job is to steer around barriers, pick up parcels, cakes, fridges, pianos and fish tanks, and keep the whole wobbling tower upright all the way to the depot. Every item you grab is worth more coins, and every item also makes your load taller, heavier and harder to control. Corners make the stack lean, gusts push light cargo sideways, low awnings and tunnels knock off anything too tall, and swinging crane containers punish bad timing. When things get dicey, steer smoothly to settle the wobble, or shed the top item to save the rest.

- Delivery Tour: 30 handcrafted deliveries across Sunlit Harbor, Canyon Express and Midnight Market, each with three optional medals.
- Long Haul: an endless road. Bank your cargo at a depot to keep it safe, or carry it on for a bigger multiplier. Crash, and you lose only what you didn't bank.
- Daily Contract: one shared route, truck and weather each day (UTC). Retry as often as you like.
- Garage: five trucks with real differences (a walled box van, a nimble three-wheeler, a two-column flatbed, a monster 4×4), 14 paint jobs, 7 fun extras, and upgrades for suspension, grip and cargo supports.
- A cargo album full of silly descriptions, achievements and optional contracts.

No timers, no energy, no paywalls. Every coin is earned by driving.

## Controls
| Action | Keyboard | Mouse | Touch |
|---|---|---|---|
| Steer | A / D or ← / → | Click and drag left/right on the road | Drag left/right anywhere |
| Shed the top item | Space | Click the SHED button | Tap SHED |
| Pause | P | Click the pause button | Tap the pause button |

Escape is not used. On AZERTY keyboards the physical A/D keys (labelled Q/D) work, and so do the arrow keys.

## Supported devices & orientation
- Desktop: tested in Chromium (Chrome engine) only. Edge, Firefox and Safari must be checked by the owner before claiming support (see QA_REPORT.md). Landscape.
- Mobile/tablet: touch controls; works in landscape and portrait. Declare **both** orientations in the portal (portrait gets a wider camera FOV and a stacked layout). The game does not force an orientation lock.
- Performance presets: Auto / Low / Medium / High, plus a resolution scale. Low keeps the art direction and drops shadows, bloom and scenery density.

## Suggested tags / categories (pick from the portal's list)
Driving, Arcade, 3D, Casual, Runner, Truck, Balance, Physics, Stacking, Delivery, Single player, Mobile friendly.

## Content rating notes
Cartoon vehicles and household cargo. No violence beyond toy-like crashes (cargo tumbles, the truck tips over), no blood, no text chat, no user-generated content, no gambling or loot boxes. Intended to fit PEGI 7/12 guidance; the owner confirms the final rating questionnaire in the portal.

## Platform settings for the submission form
- **Progress Save / Data module: ON.** Required: the game saves through the CrazyGames Data module.
- Launch stage: Basic Launch build (`release/overloaded-basic.zip`). Full Launch requires CrazyGames selection.
- Multiplayer: none. In-game purchases (real money): none.
- External links: none in the game.
- Sitelock: not used.

## Required notices
- Font: Fredoka (SIL Open Font License 1.1). The license ships in `licenses/` inside the bundle.
- three.js (MIT). The license ships in `licenses/`.
- All other art and audio are original and procedurally generated.
- The game stores progress only through the CrazyGames Data module, or local storage when self-hosted. It collects no personal data and contains no analytics or tracking.

## Media
See `media/README.md` for covers (1920×1080, 800×1200, 800×800) and preview videos (16:9 and 2:3). The covers in `media/` are rendered by the game itself and are ready to upload.

If you replace a cover with AI-generated or hand-made art:
- keep it faithful to how the game actually looks (red pickup, tall cargo tower, pastel harbour town, low-poly toy style), with the title as the only text;
- export at exactly 1920×1080, 800×1200 and 800×800;
- record its origin in `ASSET_LICENSES.md` (tool, date, who made it) and check the tool's terms for commercial use.
