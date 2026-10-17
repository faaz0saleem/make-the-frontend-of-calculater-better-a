import type { CargoShape } from './cargo';
import type { WorldId } from '../sim/types';

export type RouteObjective =
  | { kind: 'gate'; tag: string; n: number }
  | { kind: 'coins'; n: number }
  | { kind: 'noShed' }
  | { kind: 'nearMiss'; n: number }
  | { kind: 'closeShave'; n: number }
  | { kind: 'jumps'; n: number }
  | { kind: 'deliverType'; cargo: CargoShape; n: number }
  | { kind: 'stack'; n: number }
  | { kind: 'noScrape' };

export type CareObjective =
  | { kind: 'lostMax'; n: number }
  | { kind: 'intactPct'; pct: number }
  | { kind: 'fragileIntact'; n: number };

export interface LevelDef {
  id: string;
  world: WorldId;
  num: number; // 1..30
  name: string;
  /** The level's new decision or set piece, shown on the briefing card. */
  intro: string;
  speed: [number, number];
  cargo: CargoShape[];
  /** Chunk ids; a leading "~" mirrors the chunk. The 'start_load' opener (unless the first chunk is
   * itself tagged 'start') and 'finish' are added automatically. */
  seq: string[];
  wind?: number;
  wet?: boolean;
  tutorial?: boolean;
  objectives: { target: number; route: RouteObjective; care: CareObjective };
}

const L = (d: Omit<LevelDef, 'world' | 'num'> & { world: WorldId }, num: number): LevelDef => ({ ...d, num });

const RAW: Omit<LevelDef, 'num'>[] = [
  // ======================================================= WORLD 1 — SUNLIT HARBOR
  {
    id: 'h1', world: 1, name: 'First Delivery', tutorial: true,
    intro: 'Steer, grab cargo, keep the stack upright, and deliver it to the depot.',
    speed: [12.5, 14], cargo: ['parcel', 'crate', 'parcel', 'plant'],
    seq: ['tut_cargo', 'tut_steer', 'tut_wobble', 'tut_shed', 'cargo_trio', 'tut_deliver'],
    objectives: { target: 30, route: { kind: 'coins', n: 20 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'h2', world: 1, name: 'Corner Bakery',
    intro: 'Cakes are worth more but hate bumps. Ease into the corners.',
    speed: [13.5, 15], cargo: ['cake', 'parcel', 'cake', 'crate', 'plant'],
    seq: ['cargo_line', 'gentle_curve', 'cargo_trio', '~gentle_curve', 's_bend', 'coin_weave', 'cargo_line', 'tight_curve', 'cargo_trio', '~s_bend', 'cargo_line', 'gentle_curve', 'cargo_trio', '~tight_curve', 'cargo_line', 'coin_weave'],
    objectives: { target: 60, route: { kind: 'deliverType', cargo: 'cake', n: 2 }, care: { kind: 'fragileIntact', n: 2 } },
  },
  {
    id: 'h3', world: 1, name: 'Mind the Awnings',
    intro: 'Striped awnings hang low. Check the clearance signs and shed if you must.',
    speed: [14, 15.5], cargo: ['parcel', 'armchair', 'crate', 'buoy', 'parcel'],
    seq: ['cargo_trio', 'overhead_beam', 'cargo_line', 'gentle_curve', 'overhead_split', 'cargo_trio', 'coin_weave', '~overhead_split', 'cargo_line', 'overhead_beam', 's_bend', 'cargo_trio', 'cargo_line', '~overhead_beam', 'cargo_trio', 'overhead_beam'],
    objectives: { target: 65, route: { kind: 'closeShave', n: 2 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'h4', world: 1, name: 'Fork in the Wharf',
    intro: 'Choose your route: the left lane pays more but is cluttered.',
    speed: [14, 16], cargo: ['crate', 'parcel', 'buoy', 'cake', 'plant'],
    seq: ['cargo_line', 'fork_coins', 'gentle_curve', 'cargo_trio', 'cone_slalom', '~fork_coins', 'cargo_line', 's_bend', 'coin_weave', 'fork_coins', 'cargo_trio', '~fork_coins', 'cargo_line', 'coin_weave', 'gentle_curve'],
    objectives: { target: 60, route: { kind: 'gate', tag: 'left', n: 2 }, care: { kind: 'intactPct', pct: 80 } },
  },
  {
    id: 'h5', world: 1, name: 'Crate Expectations',
    intro: 'Solid barriers appear. Graze past them for near-miss bonuses.',
    speed: [14.5, 16], cargo: ['crate', 'parcel', 'armchair', 'crate', 'buoy'],
    seq: ['cargo_trio', 'barrier_single', 'cargo_line', 'crate_wall', 'cone_slalom', '~barrier_single', 'gentle_curve', 'barrier_double', 'cargo_trio', 'needle', 'coin_weave', '~crate_wall', 'cargo_line', 'needle', 'cargo_trio', '~barrier_double', 'barrier_single'],
    objectives: { target: 50, route: { kind: 'nearMiss', n: 3 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'h6', world: 1, name: 'Swinging Cranes',
    intro: 'Harbor cranes swing their hooks at stack height. Time your pass.',
    speed: [14.5, 16], cargo: ['crate', 'parcel', 'buoy', 'armchair', 'plant'],
    seq: ['cargo_trio', 'cargo_line', 'hook_swing', 'gentle_curve', 'cargo_trio', 'dock_edge', '~hook_swing', 'cargo_line', 's_bend', 'hook_swing', 'cargo_trio', '~hook_swing', 'cargo_line', '~dock_edge', 'cargo_trio', 'coin_weave'],
    objectives: { target: 65, route: { kind: 'stack', n: 6 }, care: { kind: 'lostMax', n: 3 } },
  },
  {
    id: 'h7', world: 1, name: 'Dockside Dash',
    intro: 'No railings by the water. Hug the edge for coins, but not too hard.',
    speed: [15, 16.5], cargo: ['crate', 'buoy', 'parcel', 'cake', 'armchair'],
    seq: ['cargo_line', 'dock_edge', 'cargo_trio', 'narrow_bridge', 'parked_carts', '~dock_edge', 'coin_weave', 'gentle_curve', 'cargo_trio', 'narrow_bridge', 'dock_edge', '~parked_carts', 'cargo_trio', '~narrow_bridge', 'coin_weave', 'cargo_line'],
    objectives: { target: 70, route: { kind: 'coins', n: 50 }, care: { kind: 'intactPct', pct: 75 } },
  },
  {
    id: 'h8', world: 1, name: 'Rainy Pier', wet: true,
    intro: 'Wet boards and puddles. Smooth steering keeps the scrapes away.',
    speed: [14.5, 16], cargo: ['cake', 'plant', 'parcel', 'cake', 'crate'],
    seq: ['cargo_trio', 'puddle_lane', 's_bend', 'cargo_line', 'bump_run', '~puddle_lane', 'gentle_curve', 'cargo_trio', 'parked_carts', 'puddle_lane', 'cargo_line', '~bump_run', 'cargo_trio', '~puddle_lane', 'gentle_curve', '~s_bend'],
    objectives: { target: 60, route: { kind: 'noScrape' }, care: { kind: 'fragileIntact', n: 2 } },
  },
  {
    id: 'h9', world: 1, name: 'Drawbridge Run',
    intro: 'The drawbridge ramps launch you. Land straight to keep your load.',
    speed: [15, 17], cargo: ['crate', 'parcel', 'armchair', 'buoy', 'plant'],
    seq: ['cargo_trio', 'narrow_bridge', 'ramp_center', 'cargo_line', 'hook_swing', 'cargo_trio', 'ramp_center', '~narrow_bridge', 'coin_weave', 'barrier_double', 'cargo_line', 'cargo_trio', '~hook_swing', '~ramp_center', 'cargo_line', 'ramp_center'],
    objectives: { target: 45, route: { kind: 'jumps', n: 2 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'h10', world: 1, name: 'The Lighthouse Gala',
    intro: 'Finale: cakes for the gala through cranes, awnings and the old pier.',
    speed: [15.5, 17.5], cargo: ['cake', 'armchair', 'cake', 'plant', 'crate', 'gnome'],
    seq: ['cargo_trio', 'hook_swing', 'fork_overhead', 'cargo_line', 'narrow_bridge', 'overhead_split', 'cargo_trio', 'dock_edge', '~hook_swing', 'ramp_center', 'cargo_line', '~fork_overhead', 'barrier_double', '~overhead_split', 'cargo_line', '~narrow_bridge', 'cargo_trio'],
    objectives: { target: 65, route: { kind: 'gate', tag: 'left', n: 1 }, care: { kind: 'fragileIntact', n: 3 } },
  },
  // ======================================================= WORLD 2 — CANYON EXPRESS
  {
    id: 'c1', world: 2, name: 'Dusty Welcome', wind: 0.7,
    intro: 'Canyon gusts push tall, light cargo. Lean into the wind.',
    speed: [15, 16.5], cargo: ['cactus', 'tv', 'barrel', 'tv', 'melons'],
    seq: ['cargo_trio', 'gentle_curve', 'gust_zone', 'cargo_line', 's_bend', 'cargo_trio', '~gust_zone', 'coin_weave', 'cargo_line', 'gentle_curve', 'cargo_trio', '~gust_zone', 'cargo_line', '~gentle_curve', 'cargo_trio', 'hill_crest'],
    objectives: { target: 90, route: { kind: 'deliverType', cargo: 'tv', n: 2 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'c2', world: 2, name: 'Tumbleweed Turns',
    intro: 'Switchbacks with open cliff edges. Steer early, steer gently.',
    speed: [15, 17], cargo: ['barrel', 'cactus', 'melons', 'washer', 'tv'],
    seq: ['cargo_line', 'switchback', 'cargo_trio', 'coin_weave', '~switchback', 'cargo_line', 'cone_slalom', 'cargo_trio', 'switchback', 'gentle_curve', '~switchback', 'cargo_trio', '~s_bend', 'coin_weave', 'cargo_line'],
    objectives: { target: 95, route: { kind: 'coins', n: 45 }, care: { kind: 'intactPct', pct: 80 } },
  },
  {
    id: 'c3', world: 2, name: 'Ramp It Up',
    intro: 'Ramps and crests. Keep the truck straight in the air.',
    speed: [15.5, 17.5], cargo: ['barrel', 'melons', 'cactus', 'washer'],
    seq: ['cargo_trio', 'ramp_center', 'hill_crest', 'cargo_line', 'ramp_center', 'cargo_trio', '~s_bend', 'hill_crest', 'ramp_center', 'cargo_line', '~ramp_center', 'cargo_trio', 'hill_crest', 'cargo_line', 'coin_weave'],
    objectives: { target: 85, route: { kind: 'jumps', n: 3 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'c4', world: 2, name: 'Washboard Road',
    intro: 'Rippled road rattles fragile TVs. Every bump counts.',
    speed: [15.5, 17], cargo: ['tv', 'melons', 'tv', 'barrel', 'cactus'],
    seq: ['cargo_trio', 'washboard', 'cargo_line', 'bump_run', 'gentle_curve', 'cargo_trio', '~washboard', 'coin_weave', 'cargo_line', 'bump_run', '~washboard', 'cargo_line', '~gentle_curve', 'cargo_trio', 'cargo_trio'],
    objectives: { target: 85, route: { kind: 'noShed' }, care: { kind: 'fragileIntact', n: 2 } },
  },
  {
    id: 'c5', world: 2, name: 'Cliffside Shortcut',
    intro: 'A risky cliff jump on the left, a windy safe road on the right.',
    speed: [16, 17.5], cargo: ['washer', 'barrel', 'cactus', 'melons', 'jukebox'],
    seq: ['cargo_trio', 'cargo_line', 'fork_cliff_jump', 'gentle_curve', 'cargo_trio', 'gust_zone', 'coin_weave', '~fork_cliff_jump', 'cargo_line', 's_bend', 'fork_cliff_jump', 'cargo_line', '~gust_zone', 'cargo_trio', 'cargo_trio'],
    objectives: { target: 105, route: { kind: 'gate', tag: 'shortcut', n: 1 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'c6', world: 2, name: 'Windy Mesa', wind: 1.15,
    intro: 'Strong crosswinds over a narrow bridge. Lower stacks feel safer.',
    speed: [16, 17.5], cargo: ['cactus', 'tv', 'barrel', 'melons', 'washer'],
    seq: ['cargo_trio', 'gust_zone', 'narrow_bridge', 'cargo_line', '~gust_zone', 'cargo_trio', 'washboard', 'narrow_bridge', 'coin_weave', 'gust_zone', '~narrow_bridge', 'cargo_line', '~washboard', 'cargo_trio', 'cargo_trio'],
    objectives: { target: 95, route: { kind: 'stack', n: 6 }, care: { kind: 'intactPct', pct: 75 } },
  },
  {
    id: 'c7', world: 2, name: 'Canyon Chasm',
    intro: 'The road just ends. Hit the ramp at speed and fly the gap.',
    speed: [16.5, 18], cargo: ['barrel', 'washer', 'melons', 'cactus'],
    seq: ['cargo_trio', 'chasm_jump', 'cargo_line', 'switchback', 'cargo_trio', 'chasm_jump', 'coin_weave', 'ramp_center', 'cargo_line', 'chasm_jump', '~switchback', 'cargo_line', 'chasm_jump', 'coin_weave', 'cargo_trio'],
    objectives: { target: 95, route: { kind: 'jumps', n: 4 }, care: { kind: 'lostMax', n: 3 } },
  },
  {
    id: 'c8', world: 2, name: 'Jukebox Hero',
    intro: 'Heavy, valuable jukeboxes. Build a steady base before stacking high.',
    speed: [16.5, 18], cargo: ['jukebox', 'barrel', 'jukebox', 'washer', 'tv'],
    seq: ['cargo_line', 'cargo_trio', 'tight_curve', 's_bend', 'cargo_trio', '~tight_curve', 'gust_zone', 'cargo_line', 'hill_crest', 'cargo_trio', '~s_bend', 'cargo_line', 'tight_curve', 'cargo_trio', '~gust_zone', 'coin_weave'],
    objectives: { target: 130, route: { kind: 'deliverType', cargo: 'jukebox', n: 2 }, care: { kind: 'intactPct', pct: 80 } },
  },
  {
    id: 'c9', world: 2, name: 'Switchback Summit',
    intro: 'Climbing switchbacks with barriers at the apex.',
    speed: [17, 18.5], cargo: ['washer', 'tv', 'barrel', 'cactus', 'melons'],
    seq: ['cargo_trio', 'switchback', 'barrier_single', 'hill_crest', '~switchback', 'cargo_line', 'barrier_double', 'gust_zone', 'cargo_trio', 'switchback', 'needle', '~barrier_single', 'cargo_trio', '~switchback', 'coin_weave', 'cargo_line'],
    objectives: { target: 95, route: { kind: 'nearMiss', n: 4 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'c10', world: 2, name: 'Canyon Express Finale', wind: 1.0,
    intro: 'Finale: wind, chasms, cliff shortcuts and switchbacks in one haul.',
    speed: [17, 19], cargo: ['tv', 'jukebox', 'washer', 'cactus', 'melons', 'gnome'],
    seq: ['cargo_trio', 'gust_zone', 'fork_cliff_jump', 'cargo_line', 'switchback', 'chasm_jump', 'cargo_trio', 'washboard', '~fork_cliff_jump', 'narrow_bridge', 'cargo_line', 'chasm_jump', '~gust_zone', 'cargo_line', '~switchback', 'cargo_trio'],
    objectives: { target: 115, route: { kind: 'gate', tag: 'shortcut', n: 2 }, care: { kind: 'fragileIntact', n: 2 } },
  },
  // ======================================================= WORLD 3 — MIDNIGHT MARKET
  {
    id: 'm1', world: 3, name: 'Lantern Lane',
    intro: 'Moving gates and low underpasses in the glow of the night market.',
    speed: [16, 17.5], cargo: ['lantern', 'neon', 'lantern', 'fridge'],
    seq: ['cargo_trio', 'moving_gate', 'cargo_line', 'underpass', 'coin_weave', 'cargo_trio', '~moving_gate', 'gentle_curve', 'cargo_line', 'underpass', '~underpass', 'cargo_line', 'moving_gate', 'coin_weave', 'cargo_trio', 'cargo_trio'],
    objectives: { target: 95, route: { kind: 'coins', n: 45 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'm2', world: 3, name: 'Market Shuffle',
    intro: 'Stalls block the lanes and gates slide shut. Read the gaps.',
    speed: [16.5, 18], cargo: ['neon', 'lantern', 'fridge', 'fishtank'],
    seq: ['cargo_trio', 'market_stalls', 'moving_gate', 'cargo_line', '~market_stalls', 'cargo_trio', 'parked_carts', 'moving_gate', 'coin_weave', 'market_stalls', '~moving_gate', 'cargo_trio', '~parked_carts', 'cargo_line', 'coin_weave', 'cargo_line'],
    objectives: { target: 145, route: { kind: 'nearMiss', n: 4 }, care: { kind: 'intactPct', pct: 80 } },
  },
  {
    id: 'm3', world: 3, name: 'Underpass Maze',
    intro: 'Tunnels with fixed ceilings. Keep your stack under the line.',
    speed: [16.5, 18], cargo: ['fridge', 'neon', 'lantern', 'piano'],
    seq: ['cargo_trio', 'underpass', 'cargo_line', 'overhead_split', 'underpass', 'cargo_trio', '~overhead_split', 'coin_weave', 'underpass', 'cargo_line', 'overhead_beam', '~underpass', 'cargo_line', 'overhead_split', 'cargo_trio', 'cargo_trio'],
    objectives: { target: 220, route: { kind: 'closeShave', n: 3 }, care: { kind: 'lostMax', n: 2 } },
  },
  {
    id: 'm4', world: 3, name: 'Rooftop Express',
    intro: 'Drive up onto the rooftops to skip the low street tunnels.',
    speed: [17, 18.5], cargo: ['neon', 'fishtank', 'lantern', 'fridge'],
    seq: ['cargo_trio', 'cargo_line', 'fork_rooftop', 'moving_gate', 'cargo_trio', '~fork_rooftop', 'coin_weave', 'cargo_line', 'underpass', 'fork_rooftop', '~moving_gate', 'cargo_line', '~underpass', 'cargo_trio', 'cargo_trio'],
    objectives: { target: 140, route: { kind: 'gate', tag: 'rooftop', n: 2 }, care: { kind: 'fragileIntact', n: 2 } },
  },
  {
    id: 'm5', world: 3, name: 'Neon Puddles', wet: true,
    intro: 'Rain-slick streets. Puddles steal your grip mid-turn.',
    speed: [16.5, 18], cargo: ['neon', 'lantern', 'fridge', 'neon'],
    seq: ['cargo_trio', 'puddle_lane', 'market_stalls', 'cargo_line', 's_bend', '~puddle_lane', 'cargo_trio', 'moving_gate', 'puddle_lane', 'coin_weave', '~market_stalls', 'cargo_trio', '~puddle_lane', 'cargo_line', 'coin_weave', 'cargo_line'],
    objectives: { target: 130, route: { kind: 'noScrape' }, care: { kind: 'intactPct', pct: 80 } },
  },
  {
    id: 'm6', world: 3, name: 'Fishy Business',
    intro: 'Fish tanks slosh on every bump. Gill, Bill and Phil are watching.',
    speed: [17, 18.5], cargo: ['fishtank', 'lantern', 'fishtank', 'fridge', 'neon'],
    seq: ['cargo_trio', 'bump_run', 'cargo_line', 'moving_gate', 'cargo_trio', 'underpass', 'bump_run', 'coin_weave', 'cargo_line', '~market_stalls', '~bump_run', 'cargo_trio', '~moving_gate', 'cargo_line', 'coin_weave', 'cargo_trio'],
    objectives: { target: 150, route: { kind: 'deliverType', cargo: 'fishtank', n: 2 }, care: { kind: 'fragileIntact', n: 2 } },
  },
  {
    id: 'm7', world: 3, name: 'Piano Movers',
    intro: 'Pianos and fridges: heavy bases make tall stacks possible.',
    speed: [17, 18.5], cargo: ['piano', 'fridge', 'neon', 'lantern'],
    seq: ['cargo_trio', 'cargo_line', 'tight_curve', 'underpass', 'cargo_trio', '~tight_curve', 's_bend', 'cargo_line', 'overhead_split', 'cargo_trio', 'cargo_line', '~underpass', 'tight_curve', 'cargo_trio', 'coin_weave', 'coin_weave'],
    objectives: { target: 185, route: { kind: 'stack', n: 5 }, care: { kind: 'lostMax', n: 1 } },
  },
  {
    id: 'm8', world: 3, name: 'Night Shift',
    intro: 'Rooftops, sliding gates and carts. Pick your line and commit.',
    speed: [17.5, 19.5], cargo: ['neon', 'fridge', 'fishtank', 'lantern', 'piano'],
    seq: ['cargo_trio', 'moving_gate', 'fork_rooftop', 'parked_carts', 'cargo_line', '~moving_gate', 'ramp_center', 'cargo_trio', 'market_stalls', 'fork_rooftop', '~parked_carts', 'cargo_trio', '~moving_gate', 'coin_weave', 'cargo_line'],
    objectives: { target: 185, route: { kind: 'jumps', n: 3 }, care: { kind: 'intactPct', pct: 75 } },
  },
  {
    id: 'm9', world: 3, name: 'Wedding Rush',
    intro: 'Seven-tier wedding cakes through the underpasses. No pressure.',
    speed: [17, 19], cargo: ['weddingcake', 'lantern', 'weddingcake', 'neon', 'fridge'],
    seq: ['cargo_trio', 'cargo_line', 'underpass', 'gentle_curve', 'cargo_trio', 'overhead_split', 'moving_gate', 'cargo_line', '~underpass', 'cargo_trio', '~overhead_split', 'cargo_trio', 'bump_run', 'cargo_line', '~moving_gate', 'coin_weave'],
    objectives: { target: 200, route: { kind: 'deliverType', cargo: 'weddingcake', n: 2 }, care: { kind: 'fragileIntact', n: 3 } },
  },
  {
    id: 'm10', world: 3, name: 'Grand Market Finale', wet: true,
    intro: 'Finale: every trick of the market on one rain-slick night.',
    speed: [17.5, 20], cargo: ['piano', 'weddingcake', 'fishtank', 'neon', 'fridge', 'gnome'],
    seq: ['cargo_trio', 'moving_gate', 'fork_rooftop', 'underpass', 'cargo_line', 'market_stalls', 'puddle_lane', 'cargo_trio', '~fork_rooftop', 'overhead_split', 'moving_gate', 'cargo_line', '~market_stalls', 'cargo_trio', '~underpass', 'cargo_trio'],
    objectives: { target: 215, route: { kind: 'gate', tag: 'rooftop', n: 2 }, care: { kind: 'intactPct', pct: 75 } },
  },
];

export const LEVELS: LevelDef[] = RAW.map((r, i) => L(r, i + 1));
export const LEVEL_BY_ID: Record<string, LevelDef> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const WORLD_NAMES: Record<WorldId, string> = { 1: 'Sunlit Harbor', 2: 'Canyon Express', 3: 'Midnight Market' };

export function routeLabel(r: RouteObjective): string {
  switch (r.kind) {
    case 'gate':
      if (r.tag === 'left') return r.n === 1 ? 'Take the risky route at a fork' : `Take the risky route at ${r.n} forks`;
      if (r.tag === 'shortcut') return r.n === 1 ? 'Fly the cliff shortcut' : `Fly the cliff shortcut ${r.n} times`;
      if (r.tag === 'rooftop') return r.n === 1 ? 'Drive the rooftop route' : `Drive the rooftop route ${r.n} times`;
      return `Pass ${r.n} ${r.tag} gates`;
    case 'coins': return `Grab ${r.n} road coins`;
    case 'noShed': return 'Finish without shedding cargo';
    case 'nearMiss': return `Pull off ${r.n} near misses`;
    case 'closeShave': return `Squeeze under ${r.n} beams with < 35 cm to spare`;
    case 'jumps': return `Land ${r.n} ramp jumps`;
    case 'deliverType': return `Deliver ${r.n} ${cargoPlural(r.cargo)}`;
    case 'stack': return `Carry ${r.n} items at once`;
    case 'noScrape': return 'Finish without scraping a wall';
  }
}

export function careLabel(c: CareObjective): string {
  switch (c.kind) {
    case 'lostMax': return c.n === 0 ? 'Lose no cargo' : `Lose at most ${c.n} item${c.n === 1 ? '' : 's'}`;
    case 'intactPct': return `Deliver ${c.pct}% of collected value`;
    case 'fragileIntact': return `Deliver ${c.n} fragile items undamaged`;
  }
}

function cargoPlural(c: CargoShape): string {
  const map: Partial<Record<CargoShape, string>> = {
    cake: 'cakes', tv: 'TVs', jukebox: 'jukeboxes', fishtank: 'fish tanks', weddingcake: 'wedding cakes',
    crate: 'fish crates', plant: 'ferns', washer: 'washing machines', barrel: 'barrels', lantern: 'lantern bundles',
    neon: 'neon signs', fridge: 'fridges', piano: 'pianos', melons: 'melon crates', cactus: 'cacti', parcel: 'parcels',
  };
  return map[c] ?? c;
}
