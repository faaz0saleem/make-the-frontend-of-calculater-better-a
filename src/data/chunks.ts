import type { CargoShape } from './cargo';
import type { EdgeKind, FeatureKind, WorldId } from '../sim/types';

/**
 * Authored road chunks. Every chunk enters and exits at the standard half width (4.5 m)
 * so any chunk can follow any other. Lanes sit at x = -3, 0, +3 (positive = right).
 * Templates can be mirrored by the builder (x, curvature and edges flip).
 */
export interface SegSpec {
  len: number;
  k?: number;
  k1?: number;
  w?: number;
  w1?: number;
  rise?: number;
  left?: EdgeKind;
  right?: EdgeKind;
}

export interface ItemSpec {
  k: FeatureKind | 'coins';
  s: number;
  x?: number;
  len?: number;
  hw?: number;
  h?: number;
  h2?: number;
  amp?: number;
  freq?: number;
  phase?: number;
  dir?: number;
  strength?: number;
  cargo?: CargoShape | 'auto';
  label?: string;
  tag?: string;
  variant?: number;
  n?: number;
  ds?: number;
  x1?: number;
}

export interface ChunkTemplate {
  id: string;
  worlds: WorldId[];
  /** Endless difficulty envelope [min, max] in 0..1 where this chunk may appear. */
  diff: [number, number];
  weight: number;
  tags: string[];
  segs: SegSpec[];
  items: ItemSpec[];
  /** Endless only (e.g. depot forks are inserted on a schedule, not drawn randomly). */
  scheduledOnly?: boolean;
}

const ALL: WorldId[] = [1, 2, 3];
const FORK_W = 8.5;
const MED = 1.2;
export const FORK_LANE = (FORK_W + MED) / 2; // 4.85
const FORK_HW = (FORK_W - MED) / 2; // 3.65

const straight = (len: number, left: EdgeKind = 'curb', right: EdgeKind = 'curb'): SegSpec[] => [{ len, left, right }];
const forkSegs = (body: number, left: EdgeKind = 'wall', right: EdgeKind = 'wall'): SegSpec[] => [
  { len: 22, w: 4.5, w1: FORK_W, left, right },
  { len: body, w: FORK_W, left, right },
  { len: 22, w: FORK_W, w1: 4.5, left: 'curb', right: 'curb' },
];
const median = (body: number): ItemSpec => ({ k: 'wall', s: 16, len: body + 12, x: 0, hw: MED, h: 1.0 });

export const CHUNKS: ChunkTemplate[] = [
  // ---------------------------------------------------------------- breathers / cargo
  // Plain lead-in (unit tests and tools build short tracks from it).
  {
    id: 'start', worlds: ALL, diff: [0, 1], weight: 0, tags: ['start'], segs: straight(40), scheduledOnly: true,
    items: [{ k: 'coins', s: 14, x: 0, n: 7, ds: 3 }],
  },
  // Every campaign / Long Haul / Daily run opens with this: a sturdy base item dead ahead, so the
  // truck is carrying cargo about a second after "go" with no input needed (the mode picks which
  // item; the variant is fixed so the opener never shifts the route's random sequence).
  {
    id: 'start_load', worlds: ALL, diff: [0, 1], weight: 0, tags: ['start'], segs: straight(40), scheduledOnly: true,
    items: [
      { k: 'pickup', s: 14, x: 0, cargo: 'auto', variant: 0 },
      { k: 'coins', s: 20, x: 0, n: 6, ds: 3 },
    ],
  },
  {
    id: 'finish', worlds: ALL, diff: [0, 1], weight: 0, tags: ['finish'], segs: straight(90), scheduledOnly: true,
    items: [{ k: 'sign', s: 2, x: 0, label: 'finish', hw: 4.5 }],
  },
  // ---------------------------------------------------------------- tutorial (Harbor 1)
  // One lesson at a time, and the stack is never empty for long: a crate dead ahead at the start
  // (no input needed), then steering is taught by steering into cargo. The cargo is fixed so the
  // stack reaching the 2.9 m beam (Pip Pickup: 0.82 m bed + crate, parcel, parcel, fern = ~3.4 m)
  // needs exactly one shed: dropping the fern brings it to ~2.5 m.
  {
    id: 'tut_cargo', worlds: [1], diff: [0, 0], weight: 0, tags: ['start', 'tutorial'], segs: straight(40), scheduledOnly: true,
    items: [
      { k: 'sign', s: 0, x: 0, label: 'tip:cargo' },
      { k: 'pickup', s: 16, x: 0, cargo: 'crate', variant: 0 },
      { k: 'coins', s: 22, x: 0, n: 6, ds: 3 },
    ],
  },
  {
    id: 'tut_steer', worlds: [1], diff: [0, 0], weight: 0, tags: ['tutorial'], segs: straight(80), scheduledOnly: true,
    items: [
      { k: 'sign', s: 0, x: 0, label: 'tip:steer' },
      { k: 'coins', s: 6, x: 0, x1: 3, n: 10, ds: 2.6 },
      { k: 'pickup', s: 32, x: 3, cargo: 'parcel' },
      { k: 'coins', s: 38, x: 3, x1: -3, n: 12, ds: 2.8 },
      { k: 'pickup', s: 68, x: -3, cargo: 'parcel' },
      { k: 'coins', s: 72, x: -3, x1: 0, n: 6, ds: 2.6 },
    ],
  },
  {
    id: 'tut_wobble', worlds: [1], diff: [0, 0], weight: 0, tags: ['tutorial'],
    segs: [{ len: 20 }, { len: 14, k: 0, k1: 1 / 52 }, { len: 34, k: 1 / 52 }, { len: 14, k: 1 / 52, k1: 0 }, { len: 18 }],
    scheduledOnly: true,
    items: [
      { k: 'pickup', s: 8, x: 0, cargo: 'plant' },
      { k: 'sign', s: 18, x: 0, label: 'tip:wobble' },
      { k: 'coins', s: 24, x: 2.6, n: 10, ds: 4 },
    ],
  },
  {
    id: 'tut_shed', worlds: [1], diff: [0, 0], weight: 0, tags: ['tutorial'], segs: straight(80), scheduledOnly: true,
    items: [
      { k: 'sign', s: 12, x: 0, label: 'tip:shed' },
      { k: 'sign', s: 14, x: -5.2, label: 'clear:2.9' },
      { k: 'overhead', s: 56, x: 0, hw: 4.6, h: 2.9 },
      { k: 'coins', s: 60, x: 0, n: 6, ds: 3 },
    ],
  },
  {
    id: 'tut_deliver', worlds: [1], diff: [0, 0], weight: 0, tags: ['tutorial'], segs: straight(40), scheduledOnly: true,
    items: [
      { k: 'sign', s: 10, x: 0, label: 'tip:deliver' },
      { k: 'coins', s: 4, x: 0, n: 8, ds: 3 },
    ],
  },
  {
    id: 'cargo_line', worlds: ALL, diff: [0, 0.7], weight: 3, tags: ['cargo', 'breather'], segs: straight(50),
    items: [
      { k: 'coins', s: 4, x: 0, x1: 3, n: 8, ds: 3 },
      { k: 'pickup', s: 18, x: 0, cargo: 'auto' },
      { k: 'pickup', s: 36, x: 3, cargo: 'auto' },
    ],
  },
  {
    id: 'cargo_trio', worlds: ALL, diff: [0, 1], weight: 3, tags: ['cargo', 'breather'], segs: straight(64),
    items: [
      { k: 'pickup', s: 12, x: -3, cargo: 'auto' },
      { k: 'pickup', s: 30, x: 0, cargo: 'auto' },
      { k: 'pickup', s: 48, x: 3, cargo: 'auto' },
      { k: 'coins', s: 14, x: -3, x1: 3, n: 12, ds: 3 },
    ],
  },
  {
    id: 'coin_weave', worlds: ALL, diff: [0, 1], weight: 2, tags: ['coins', 'breather'], segs: straight(64),
    items: [
      { k: 'coins', s: 4, x: -3, x1: 3, n: 8, ds: 3 },
      { k: 'coins', s: 32, x: 3, x1: -3, n: 8, ds: 3 },
      { k: 'pickup', s: 58, x: -3, cargo: 'auto' },
    ],
  },
  {
    id: 'gentle_curve', worlds: ALL, diff: [0, 0.8], weight: 3, tags: ['curve', 'cargo'],
    segs: [{ len: 20, k: 0, k1: -1 / 100 }, { len: 40, k: -1 / 100 }, { len: 20, k: -1 / 100, k1: 0 }],
    items: [
      { k: 'coins', s: 10, x: -2.5, n: 14, ds: 4 },
      { k: 'pickup', s: 44, x: 2.5, cargo: 'auto' },
    ],
  },
  {
    id: 'tight_curve', worlds: ALL, diff: [0.25, 1], weight: 2, tags: ['curve', 'cargo'],
    segs: [{ len: 15, k: 0, k1: 1 / 55 }, { len: 40, k: 1 / 55 }, { len: 15, k: 1 / 55, k1: 0 }],
    items: [
      { k: 'sign', s: 0, x: -5.2, label: 'curve-right' },
      { k: 'coins', s: 14, x: 2.6, n: 12, ds: 3.5 },
      { k: 'pickup', s: 36, x: -2.8, cargo: 'auto' },
    ],
  },
  {
    id: 's_bend', worlds: ALL, diff: [0.1, 1], weight: 3, tags: ['curve'],
    segs: [{ len: 15, k: 0, k1: 1 / 70 }, { len: 30, k: 1 / 70 }, { len: 20, k: 1 / 70, k1: -1 / 70 }, { len: 30, k: -1 / 70 }, { len: 15, k: -1 / 70, k1: 0 }],
    items: [
      { k: 'coins', s: 10, x: 2, x1: -2, n: 16, ds: 5 },
      { k: 'pickup', s: 40, x: 2.5, cargo: 'auto' },
      { k: 'pickup', s: 82, x: -2.5, cargo: 'auto' },
    ],
  },
  {
    id: 'hill_crest', worlds: ALL, diff: [0.1, 1], weight: 2, tags: ['hill'],
    segs: [{ len: 45, rise: 3.2 }, { len: 45, rise: -3.2 }],
    items: [
      { k: 'pickup', s: 14, x: 0, cargo: 'auto' },
      { k: 'coins', s: 32, x: 0, n: 10, ds: 2.5 },
      { k: 'pickup', s: 70, x: -3, cargo: 'auto' },
    ],
  },
  // ---------------------------------------------------------------- soft hazards
  {
    id: 'cone_slalom', worlds: ALL, diff: [0, 0.8], weight: 3, tags: ['hazard', 'soft'], segs: straight(80),
    items: [
      { k: 'cone', s: 16, x: -4 }, { k: 'cone', s: 16, x: -3.2 }, { k: 'cone', s: 16, x: -2.4 }, { k: 'cone', s: 16, x: -1.6 },
      { k: 'cone', s: 40, x: 1.6 }, { k: 'cone', s: 40, x: 2.4 }, { k: 'cone', s: 40, x: 3.2 }, { k: 'cone', s: 40, x: 4 },
      { k: 'cone', s: 64, x: -4 }, { k: 'cone', s: 64, x: -3.2 }, { k: 'cone', s: 64, x: -2.4 }, { k: 'cone', s: 64, x: -1.6 },
      { k: 'coins', s: 8, x: 2.5, x1: -2.5, n: 16, ds: 3.5 },
      { k: 'pickup', s: 52, x: -3, cargo: 'auto' },
    ],
  },
  {
    id: 'crate_wall', worlds: ALL, diff: [0.1, 1], weight: 2, tags: ['hazard', 'soft', 'cargo'], segs: straight(60),
    items: [
      { k: 'crate', s: 28, x: 0, hw: 0.75 }, { k: 'crate', s: 28, x: 1.6, hw: 0.75 }, { k: 'crate', s: 28, x: 3.2, hw: 0.75 },
      { k: 'pickup', s: 28, x: -3, cargo: 'auto' },
      { k: 'coins', s: 6, x: -3, n: 6, ds: 3 },
      { k: 'pickup', s: 48, x: 1.5, cargo: 'auto' },
    ],
  },
  {
    id: 'bump_run', worlds: ALL, diff: [0.1, 1], weight: 2, tags: ['bump'], segs: straight(64),
    items: [
      { k: 'sign', s: 0, x: -5.2, label: 'bumps' },
      { k: 'bump', s: 14 }, { k: 'bump', s: 32 }, { k: 'bump', s: 50 },
      { k: 'coins', s: 8, x: 0, n: 16, ds: 3 },
    ],
  },
  {
    id: 'puddle_lane', worlds: ALL, diff: [0.15, 1], weight: 2, tags: ['puddle'], segs: straight(70),
    items: [
      { k: 'puddle', s: 12, x: -2.5, len: 14, hw: 2 },
      { k: 'puddle', s: 40, x: 2.5, len: 14, hw: 2 },
      { k: 'coins', s: 12, x: -2.5, n: 5, ds: 3 },
      { k: 'coins', s: 40, x: 2.5, n: 5, ds: 3 },
      { k: 'pickup', s: 30, x: 0, cargo: 'auto' },
    ],
  },
  // ---------------------------------------------------------------- hard hazards
  {
    id: 'barrier_single', worlds: ALL, diff: [0, 0.8], weight: 3, tags: ['hazard', 'hard'], segs: straight(56),
    items: [
      { k: 'sign', s: 0, x: 5.2, label: 'hazard' },
      { k: 'barrier', s: 28, x: -3 },
      { k: 'pickup', s: 28, x: 1.2, cargo: 'auto' },
      { k: 'coins', s: 6, x: -3, x1: 0.5, n: 7, ds: 3 },
    ],
  },
  {
    id: 'barrier_double', worlds: ALL, diff: [0.25, 1], weight: 3, tags: ['hazard', 'hard'], segs: straight(84),
    items: [
      { k: 'barrier', s: 22, x: -3 }, { k: 'barrier', s: 22, x: 0 },
      { k: 'barrier', s: 64, x: 0 }, { k: 'barrier', s: 64, x: 3 },
      { k: 'coins', s: 26, x: 3, x1: -3, n: 10, ds: 3.5 },
      { k: 'pickup', s: 44, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'needle', worlds: ALL, diff: [0.35, 1], weight: 2, tags: ['hazard', 'hard', 'cargo'], segs: straight(60),
    items: [
      { k: 'barrier', s: 30, x: -3.2 }, { k: 'barrier', s: 30, x: 3.2 },
      { k: 'pickup', s: 42, x: 0, cargo: 'auto' },
      { k: 'coins', s: 10, x: 0, n: 7, ds: 3 },
    ],
  },
  {
    id: 'parked_carts', worlds: [1, 3], diff: [0.15, 1], weight: 2, tags: ['hazard', 'hard'], segs: straight(80),
    items: [
      { k: 'cart', s: 14, x: -3.4 }, { k: 'cart', s: 38, x: 3.4 }, { k: 'cart', s: 62, x: -3.4 },
      { k: 'coins', s: 10, x: 0.5, n: 20, ds: 3.4 },
      { k: 'pickup', s: 50, x: -2.6, cargo: 'auto' },
    ],
  },
  // ---------------------------------------------------------------- height challenges
  {
    id: 'overhead_beam', worlds: ALL, diff: [0.1, 1], weight: 2, tags: ['overhead'], segs: straight(64),
    items: [
      { k: 'sign', s: 2, x: -5.2, label: 'clear:3.9' },
      { k: 'overhead', s: 36, x: 0, hw: 4.6, h: 3.9 },
      { k: 'pickup', s: 12, x: 0, cargo: 'auto' },
      { k: 'pickup', s: 52, x: 3, cargo: 'auto' },
      { k: 'coins', s: 26, x: 0, n: 6, ds: 3 },
    ],
  },
  {
    id: 'overhead_split', worlds: ALL, diff: [0.25, 1], weight: 2, tags: ['overhead'], segs: straight(66),
    items: [
      { k: 'sign', s: 2, x: -5.2, label: 'clear:3.0' },
      { k: 'sign', s: 2, x: 5.2, label: 'clear:4.8' },
      { k: 'overhead', s: 38, x: -2.3, hw: 2.3, h: 3.0 },
      { k: 'overhead', s: 38, x: 2.3, hw: 2.3, h: 4.8 },
      { k: 'coins', s: 20, x: -3, n: 8, ds: 3 },
      { k: 'pickup', s: 54, x: 2.5, cargo: 'auto' },
    ],
  },
  // ---------------------------------------------------------------- jumps
  {
    id: 'ramp_center', worlds: ALL, diff: [0.1, 1], weight: 2, tags: ['ramp'], segs: straight(80),
    items: [
      { k: 'ramp', s: 18, x: 0, hw: 1.7, len: 7, h: 1.2 },
      { k: 'coins', s: 26, x: 0, n: 6, ds: 2.4 },
      { k: 'cone', s: 18, x: -3.4 }, { k: 'cone', s: 18, x: 3.4 },
      { k: 'pickup', s: 64, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'chasm_jump', worlds: [2], diff: [0.3, 1], weight: 1.5, tags: ['ramp', 'gap'],
    segs: [{ len: 23, left: 'wall', right: 'wall' }, { len: 9, left: 'drop', right: 'drop' }, { len: 58, left: 'wall', right: 'wall' }],
    items: [
      { k: 'sign', s: 0, x: -5.2, label: 'jump' },
      { k: 'ramp', s: 12, x: 0, hw: 4.5, len: 8, h: 2.0 },
      { k: 'gap', s: 24, x: 0, hw: 4.6, len: 7 },
      { k: 'coins', s: 24, x: 0, n: 6, ds: 2.6 },
      { k: 'pickup', s: 72, x: 0, cargo: 'auto' },
    ],
  },
  // ---------------------------------------------------------------- world signature hazards
  {
    id: 'hook_swing', worlds: [1], diff: [0.15, 1], weight: 2.5, tags: ['hook'], segs: straight(80),
    items: [
      { k: 'sign', s: 0, x: 5.2, label: 'hook' },
      { k: 'hook', s: 30, x: 0, amp: 3.2, freq: 1.3, phase: 0, h: 3.3, h2: 4.8 },
      { k: 'hook', s: 58, x: 0, amp: 3.2, freq: 1.3, phase: 2.4, h: 3.3, h2: 4.8 },
      { k: 'coins', s: 10, x: -3, x1: 3, n: 14, ds: 4.5 },
      { k: 'pickup', s: 44, x: -2.5, cargo: 'auto' },
    ],
  },
  {
    id: 'dock_edge', worlds: [1], diff: [0.15, 1], weight: 2, tags: ['edge', 'cargo'],
    segs: [{ len: 80, left: 'curb', right: 'drop' }],
    items: [
      { k: 'crate', s: 22, x: -3, hw: 0.8 }, { k: 'crate', s: 50, x: -1, hw: 0.8 },
      { k: 'coins', s: 10, x: 3, n: 14, ds: 4 },
      { k: 'pickup', s: 36, x: 3, cargo: 'auto' },
      { k: 'pickup', s: 64, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'narrow_bridge', worlds: [1, 2], diff: [0.2, 1], weight: 2, tags: ['bridge', 'edge'],
    segs: [
      { len: 18, w: 4.5, w1: 3.0, left: 'curb', right: 'curb' },
      { len: 44, w: 3.0, left: 'drop', right: 'drop' },
      { len: 18, w: 3.0, w1: 4.5, left: 'curb', right: 'curb' },
    ],
    items: [
      { k: 'sign', s: 0, x: -5.2, label: 'narrow' },
      { k: 'coins', s: 20, x: 0, n: 12, ds: 3.5 },
      { k: 'pickup', s: 40, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'gust_zone', worlds: [2], diff: [0.15, 1], weight: 2.5, tags: ['wind'], segs: straight(80, 'wall', 'wall'),
    items: [
      { k: 'sign', s: 0, x: -5.2, label: 'wind' },
      { k: 'gust', s: 14, x: 0, len: 52, dir: 1, strength: 3.2, hw: 9 },
      { k: 'coins', s: 16, x: -2.5, n: 12, ds: 4 },
      { k: 'pickup', s: 40, x: 2.5, cargo: 'auto' },
    ],
  },
  {
    id: 'switchback', worlds: [2], diff: [0.3, 1], weight: 2, tags: ['curve', 'edge'],
    segs: [
      { len: 14, k: 0, k1: 1 / 42, left: 'drop', right: 'wall' },
      { len: 34, k: 1 / 42, left: 'drop', right: 'wall' },
      { len: 14, k: 1 / 42, k1: 0, left: 'drop', right: 'wall' },
      { len: 14, k: 0, k1: -1 / 42, left: 'wall', right: 'drop' },
      { len: 34, k: -1 / 42, left: 'wall', right: 'drop' },
      { len: 14, k: -1 / 42, k1: 0, left: 'wall', right: 'drop' },
    ],
    items: [
      { k: 'sign', s: 0, x: -5.2, label: 'curve-right' },
      { k: 'coins', s: 8, x: 2.6, n: 8, ds: 4 },
      { k: 'coins', s: 66, x: -2.6, n: 8, ds: 4 },
      { k: 'pickup', s: 58, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'washboard', worlds: [2], diff: [0.2, 1], weight: 1.5, tags: ['bump', 'wind'], segs: straight(70, 'wall', 'wall'),
    items: [
      { k: 'bump', s: 12 }, { k: 'bump', s: 24 }, { k: 'bump', s: 36 },
      { k: 'gust', s: 30, x: 0, len: 36, dir: -1, strength: 2.4, hw: 9 },
      { k: 'pickup', s: 52, x: -2.6, cargo: 'auto' },
      { k: 'coins', s: 44, x: 2.6, n: 7, ds: 3 },
    ],
  },
  {
    id: 'moving_gate', worlds: [3], diff: [0.2, 1], weight: 2.5, tags: ['moving', 'hard'], segs: straight(80),
    items: [
      { k: 'sign', s: 0, x: 5.2, label: 'moving' },
      { k: 'movingBarrier', s: 32, x: -1.6, amp: 1.5, freq: 1.4, phase: 0, hw: 1.0 },
      { k: 'coins', s: 26, x: -2.5, n: 5, ds: 2.5 },
      { k: 'pickup', s: 56, x: 3, cargo: 'auto' },
      { k: 'pickup', s: 14, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'underpass', worlds: [3], diff: [0.2, 1], weight: 2, tags: ['overhead'], segs: straight(80),
    items: [
      { k: 'sign', s: 2, x: -5.2, label: 'clear:3.4' },
      { k: 'overhead', s: 30, x: 0, hw: 4.6, h: 3.4, variant: 9, len: 0.8 },
      { k: 'overhead', s: 40, x: 0, hw: 4.6, h: 3.4, variant: 8 },
      { k: 'overhead', s: 50, x: 0, hw: 4.6, h: 3.4, variant: 8 },
      { k: 'puddle', s: 34, x: 0, len: 16, hw: 2.4 },
      { k: 'coins', s: 30, x: -2.5, x1: 2.5, n: 8, ds: 3 },
      { k: 'pickup', s: 68, x: 0, cargo: 'auto' },
    ],
  },
  {
    id: 'market_stalls', worlds: [3], diff: [0.15, 1], weight: 2, tags: ['hazard', 'hard', 'puddle'], segs: straight(76),
    items: [
      { k: 'cart', s: 16, x: 0, hw: 1.1 },
      { k: 'puddle', s: 30, x: -3, len: 12, hw: 1.6 },
      { k: 'cart', s: 50, x: 3.3 },
      { k: 'cart', s: 50, x: -3.3 },
      { k: 'coins', s: 14, x: -3, n: 6, ds: 3 },
      { k: 'pickup', s: 64, x: 0, cargo: 'auto' },
    ],
  },
  // ---------------------------------------------------------------- forks (route choice)
  {
    id: 'fork_coins', worlds: ALL, diff: [0.1, 1], weight: 2, tags: ['fork'], segs: forkSegs(64),
    items: [
      median(64),
      { k: 'sign', s: 6, x: -2.2, label: 'route:risky' },
      { k: 'sign', s: 6, x: 2.2, label: 'route:safe' },
      { k: 'gate', s: 54, x: -FORK_LANE, hw: FORK_HW, tag: 'left' },
      { k: 'gate', s: 54, x: FORK_LANE, hw: FORK_HW, tag: 'right' },
      { k: 'coins', s: 26, x: -FORK_LANE, n: 16, ds: 3.5 },
      { k: 'pickup', s: 36, x: -FORK_LANE - 1.6, cargo: 'auto' },
      { k: 'pickup', s: 60, x: -FORK_LANE + 1.6, cargo: 'auto' },
      { k: 'cone', s: 48, x: -FORK_LANE }, { k: 'cone', s: 48, x: -FORK_LANE - 0.8 }, { k: 'cone', s: 74, x: -FORK_LANE + 0.8 },
      { k: 'pickup', s: 52, x: FORK_LANE, cargo: 'auto' },
    ],
  },
  {
    id: 'fork_overhead', worlds: ALL, diff: [0.25, 1], weight: 2, tags: ['fork', 'overhead'], segs: forkSegs(64),
    items: [
      median(64),
      { k: 'sign', s: 6, x: -2.2, label: 'clear:3.1' },
      { k: 'sign', s: 6, x: 2.2, label: 'route:safe' },
      { k: 'overhead', s: 44, x: -FORK_LANE, hw: FORK_HW, h: 3.1 },
      { k: 'pickup', s: 30, x: -FORK_LANE, cargo: 'auto' },
      { k: 'pickup', s: 58, x: -FORK_LANE, cargo: 'auto' },
      { k: 'coins', s: 26, x: -FORK_LANE, n: 10, ds: 4 },
      { k: 'barrier', s: 40, x: FORK_LANE + 1.8, hw: 1.2 },
      { k: 'gate', s: 54, x: -FORK_LANE, hw: FORK_HW, tag: 'left' },
      { k: 'gate', s: 54, x: FORK_LANE, hw: FORK_HW, tag: 'right' },
    ],
  },
  {
    id: 'fork_cliff_jump', worlds: [2], diff: [0.3, 1], weight: 1.5, tags: ['fork', 'ramp', 'gap'], segs: forkSegs(70),
    items: [
      median(70),
      { k: 'sign', s: 6, x: -2.2, label: 'jump' },
      { k: 'sign', s: 6, x: 2.2, label: 'route:safe' },
      { k: 'ramp', s: 26, x: -FORK_LANE, hw: FORK_HW, len: 8, h: 2.0 },
      { k: 'gap', s: 38, x: -FORK_LANE, hw: FORK_HW + 0.1, len: 7 },
      { k: 'coins', s: 37, x: -FORK_LANE, n: 6, ds: 2.6 },
      { k: 'pickup', s: 72, x: -FORK_LANE, cargo: 'auto' },
      { k: 'gate', s: 70, x: -FORK_LANE, hw: FORK_HW, tag: 'shortcut' },
      { k: 'gust', s: 26, x: FORK_LANE, len: 44, dir: 1, strength: 2.6, hw: FORK_HW },
      { k: 'pickup', s: 50, x: FORK_LANE, cargo: 'auto' },
      { k: 'gate', s: 70, x: FORK_LANE, hw: FORK_HW, tag: 'right' },
    ],
  },
  {
    id: 'fork_rooftop', worlds: [3], diff: [0.3, 1], weight: 1.5, tags: ['fork', 'ramp', 'overhead'], segs: forkSegs(76),
    items: [
      median(76),
      { k: 'sign', s: 6, x: -2.2, label: 'route:roof' },
      { k: 'sign', s: 6, x: 2.2, label: 'clear:3.2' },
      { k: 'ramp', s: 24, x: -FORK_LANE, hw: FORK_HW, len: 9, h: 2.4 },
      { k: 'platform', s: 33, x: -FORK_LANE, hw: FORK_HW, len: 40, h: 2.4 },
      { k: 'coins', s: 36, x: -FORK_LANE, n: 10, ds: 3.5 },
      { k: 'pickup', s: 58, x: -FORK_LANE, cargo: 'auto' },
      { k: 'gate', s: 64, x: -FORK_LANE, hw: FORK_HW, tag: 'rooftop' },
      { k: 'overhead', s: 40, x: FORK_LANE, hw: FORK_HW, h: 3.2, variant: 9 },
      { k: 'overhead', s: 52, x: FORK_LANE, hw: FORK_HW, h: 3.2, variant: 8 },
      { k: 'pickup', s: 30, x: FORK_LANE, cargo: 'auto' },
      { k: 'pickup', s: 66, x: FORK_LANE, cargo: 'auto' },
      { k: 'gate', s: 64, x: FORK_LANE, hw: FORK_HW, tag: 'right' },
    ],
  },
  {
    id: 'depot_fork', worlds: ALL, diff: [0, 1], weight: 0, tags: ['fork', 'depot'], segs: forkSegs(60), scheduledOnly: true,
    items: [
      median(60),
      { k: 'sign', s: 4, x: 2.2, label: 'depot:bank' },
      { k: 'sign', s: 4, x: -2.2, label: 'depot:carry' },
      { k: 'depot', s: 30, x: FORK_LANE, hw: FORK_HW, len: 26 },
      { k: 'coins', s: 26, x: -FORK_LANE, n: 12, ds: 3.5 },
    ],
  },
];

export const CHUNK_BY_ID: Record<string, ChunkTemplate> = Object.fromEntries(CHUNKS.map((c) => [c.id, c]));
export const chunkLength = (t: ChunkTemplate): number => t.segs.reduce((a, s) => a + s.len, 0);
