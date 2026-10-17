import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CARGO } from '../../src/data/cargo';
import { CHUNKS, CHUNK_BY_ID } from '../../src/data/chunks';
import { LEVELS, WORLD_NAMES, careLabel, routeLabel } from '../../src/data/levels';
import { ENDLESS_ENVELOPE } from '../../src/modes/endless';
import { buildLevel } from '../../src/modes/campaign';

const SET_PIECES: Record<string, string> = {
  hook_swing: 'swinging crane containers', dock_edge: 'unrailed dock edge', narrow_bridge: 'narrow bridge with drops', overhead_beam: 'low striped awning',
  overhead_split: 'split clearance (low left / high right)', fork_coins: 'risky/safe fork', fork_overhead: 'fork with a low-beam cargo lane', ramp_center: 'centre ramp jump',
  gust_zone: 'crosswind zone', switchback: 'cliff switchback', washboard: 'washboard bumps + gusts', chasm_jump: 'full-width chasm jump', fork_cliff_jump: 'cliffside shortcut jump',
  moving_gate: 'sliding gate', underpass: 'fixed-ceiling tunnel', market_stalls: 'market stalls', fork_rooftop: 'rooftop route vs low tunnels', parked_carts: 'parked carts',
  barrier_double: 'double barrier weave', needle: 'thread-the-needle gap', crate_wall: 'crate wall', puddle_lane: 'puddles', bump_run: 'speed bumps', tight_curve: 'tight curve',
  hill_crest: 'hill crest (light cargo)', cone_slalom: 'cone slalom', barrier_single: 'single barrier', s_bend: 'S-bend', gentle_curve: 'gentle curve',
  tut_steer: 'tutorial: steering', tut_cargo: 'tutorial: first cargo (no input needed)', tut_wobble: 'tutorial: wobble & recovery', tut_shed: 'tutorial: shedding under a 2.9 m beam', tut_deliver: 'tutorial: delivery',
};

test('write LEVEL_DESIGN.md', () => {
  const L: string[] = [];
  L.push('# LEVEL DESIGN — Overloaded', '', '_Generated from `src/data/levels.ts` and `src/data/chunks.ts` by `npx vitest run -c vitest.tools.config.ts leveldoc`. Do not edit by hand._', '');
  L.push('## Principles', '',
    '- Every level is a hand-ordered sequence of authored road chunks (shared library) plus a level-specific cargo pool, speed ramp and objectives.',
    '- Every run (campaign, Long Haul, Daily) opens with cargo dead ahead (`start_load`: the pool\'s sturdiest item; the tutorial uses a fixed crate), so the stack starts building about a second after the start with no input needed.',
    '- Completion = reaching the depot. Three independent optional medals: **Delivery** (cargo value delivered ≥ target), **Route** (a route/skill objective), **Care** (cargo preservation).',
    '- Delivery targets are 55% of the value of the best 8 non-rare pickups on offer (enforced ≤ 62% by tests).',
    '- Levels 1–4 teach steering, stacking, wobble recovery, shedding under clearance, forks and delivering. Each later level adds one new decision or set piece; each world finale combines that world\'s mechanics.',
    '- Every level is validated (unit test) to have a crash-free route for all five trucks across its speed range, and the scripted driver completes all 30 with the starter truck.', '');
  let lastWorld = 0;
  for (const l of LEVELS) {
    if (l.world !== lastWorld) {
      lastWorld = l.world;
      L.push(`## World ${l.world}: ${WORLD_NAMES[l.world]}`, '');
      L.push('| # | Level | New decision / set piece | Speed (m/s) | Length | Time @avg | Medals: Delivery / Route / Care |', '|---|---|---|---|---|---|---|');
    }
    const b = buildLevel(l);
    const avg = (l.speed[0] + l.speed[1]) / 2;
    const idx = l.num - (l.world - 1) * 10;
    L.push(`| ${idx} | **${l.name}** (\`${l.id}\`)${l.wind ? ' · windy' : ''}${l.wet ? ' · wet' : ''} | ${l.intro} | ${l.speed[0]}→${l.speed[1]} | ${Math.round(b.finishS!)} m | ${Math.round(b.finishS! / avg)} s | ≥${l.objectives.target} / ${routeLabel(l.objectives.route)} / ${careLabel(l.objectives.care)} |`);
    if (idx === 10) L.push('');
  }
  L.push('', '## Per-level route detail', '');
  for (const l of LEVELS) {
    const pieces = [...new Set(l.seq.map((r) => r.replace('~', '')).filter((id) => SET_PIECES[id] && !['cargo_line', 'cargo_trio', 'coin_weave'].includes(id)).map((id) => SET_PIECES[id]))];
    const cargo = [...new Set(l.cargo)].map((c) => CARGO[c].name).join(', ');
    L.push(`### ${l.num}. ${l.name}`, '', `- **Route:** ${buildLevel(l).chunks.length} chunks — ${pieces.join(', ')}.`, `- **Cargo pool:** ${cargo}.`, `- **Objectives:** deliver ≥ ${l.objectives.target}; ${routeLabel(l.objectives.route)}; ${careLabel(l.objectives.care)}.`, '');
  }
  L.push('## Difficulty progression', '',
    '- Harbor (1–10): 12.5–17.5 m/s. Introduces soft hazards → hard barriers (5) → hooks (6) → drop edges (7) → wet grip (8) → ramps (9). Finale: hooks + low-beam fork + bridge + ramps with fragile cakes.',
    '- Canyon (11–20): 15–19 m/s. Wind (11), switchbacks with cliff edges (12), jumps (13), washboard bumps with fragile TVs (14), cliff shortcut (15), strong crosswind bridge (16), chasms (17), heavy jukeboxes (18), apex barriers (19). Finale combines wind, chasms, shortcuts, switchbacks.',
    '- Midnight Market (21–30): 16–20 m/s. Moving gates + tunnels (21), stalls (22), fixed ceilings (23), rooftop routes (24), rain (25), fish tanks (26), heavy pianos (27), mixed rooftop/gates (28), wedding cakes (29). Finale: everything on a wet night.', '');
  L.push('## Long Haul chunk library and envelope', '',
    `Explicit envelope: speed ${ENDLESS_ENVELOPE.speedStart} → ${ENDLESS_ENVELOPE.speedMax} m/s over ${ENDLESS_ENVELOPE.speedRampDist} m (hard cap), obstacle difficulty 0 → 1 over ${ENDLESS_ENVELOPE.diffRampDist} m, wind scale up to ×${ENDLESS_ENVELOPE.windMax}, rain sections from difficulty ${ENDLESS_ENVELOPE.rainFrom}, world rotates every ${ENDLESS_ENVELOPE.worldEvery} depots. Depots every 700–950 m.`, '',
    '| Chunk | Worlds | Difficulty window | Weight | Tags |', '|---|---|---|---|---|');
  for (const c of CHUNKS.filter((c) => !c.scheduledOnly)) L.push(`| \`${c.id}\` ${SET_PIECES[c.id] ? `(${SET_PIECES[c.id]})` : ''} | ${c.worlds.join(', ')} | ${c.diff[0]}–${c.diff[1]} | ${c.weight} | ${c.tags.join(', ')} |`);
  L.push('', `Scheduled-only chunks: ${CHUNKS.filter((c) => c.scheduledOnly).map((c) => `\`${c.id}\``).join(', ')}.`, '');
  L.push('Generation rules: weighted random pick inside the difficulty window; a chunk used in the last 2 picks is excluded and one used in the last 6 is down-weighted ×0.3; same leading tag as the previous chunk ×0.5; after two hazard chunks in a row breathers are boosted ×3. Each candidate is appended and validated by the reachability DP from the previous frontier (widest/slowest effective lateral speed at max speed, ramp flights at min and max speed, landing zones, current load clearance up to 4.8 m); failures are rolled back, up to 8 candidates, then a guaranteed breather.');
  void CHUNK_BY_ID;
  writeFileSync('LEVEL_DESIGN.md', L.join('\n') + '\n');
});
