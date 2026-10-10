import type { CargoShape } from '../data/cargo';

export type EdgeKind = 'wall' | 'curb' | 'drop';
export type WorldId = 1 | 2 | 3;

export type FeatureKind =
  | 'cone' | 'crate' | 'barrier' | 'cart' | 'movingBarrier' | 'wall'
  | 'overhead' | 'hook'
  | 'puddle' | 'bump' | 'ramp' | 'platform' | 'gap' | 'gust'
  | 'coin' | 'pickup' | 'depot' | 'gate' | 'sign';

/** Ground hazards that end the run on a solid (non-glancing) hit. */
export const HARD_KINDS: ReadonlySet<FeatureKind> = new Set(['barrier', 'cart', 'movingBarrier', 'wall']);
/** Hazards that only spill / wobble. */
export const SOFT_KINDS: ReadonlySet<FeatureKind> = new Set(['cone', 'crate']);

export interface Feature {
  id: number;
  kind: FeatureKind;
  s: number; // start along track
  len: number; // extent along track
  x: number; // lateral centre (m, +right)
  hw: number; // half width
  h: number; // height of top (ground hazards) / bottom clearance (overhead, hook band bottom)
  h2?: number; // hook band top
  amp?: number; // moving amplitude (m)
  freq?: number; // rad/s
  phase?: number;
  dir?: number; // gust direction (+1 right / -1 left)
  strength?: number;
  cargo?: CargoShape;
  label?: string;
  tag?: string;
  variant?: number;
  chunk?: number; // chunk serial that owns it (endless recycling)
  // runtime state
  hit?: boolean;
  collected?: boolean;
  passed?: boolean;
  nearMin?: number;
  touched?: boolean;
}

export interface Segment {
  s0: number;
  len: number;
  k0: number;
  k1: number;
  w0: number;
  w1: number;
  e0: number;
  e1: number;
  left: EdgeKind;
  right: EdgeKind;
  world: WorldId;
  chunk: number;
  // Cached world-space centreline samples every SAMPLE_STEP meters (relative to track origin)
  px: Float64Array;
  pz: Float64Array;
  hd: Float64Array;
}

export interface Pose {
  x: number;
  z: number;
  heading: number;
  elev: number;
  halfWidth: number;
  curvature: number;
  vcurv: number; // vertical curvature (1/m)
  left: EdgeKind;
  right: EdgeKind;
  world: WorldId;
}
