import type { CargoShape } from '../data/cargo';
import type { ChunkTemplate, ItemSpec } from '../data/chunks';
import type { Rng } from '../core/rng';
import type { Track } from './track';
import type { Feature, WorldId } from './types';

export interface PlaceOptions {
  mirror: boolean;
  world: WorldId;
  chunk: number;
  rng: Rng;
  pickCargo: (rng: Rng) => CargoShape;
  /** 0..1 scales optional coin trails (e.g. Low difficulty envelope gets all coins). */
  coinScale?: number;
  /** Lateral wind scale for gust items (weather modifiers). */
  windScale?: number;
}

export interface PlacedChunk {
  serial: number;
  id: string;
  s0: number;
  s1: number;
  mirror: boolean;
  world: WorldId;
  features: Feature[];
}

/** Appends a chunk template onto the track at its current end. */
export function placeChunk(track: Track, t: ChunkTemplate, o: PlaceOptions): PlacedChunk {
  const s0 = track.endS;
  const m = o.mirror ? -1 : 1;
  for (const seg of t.segs) {
    track.appendSegment(
      {
        len: seg.len,
        k0: (seg.k ?? 0) * m,
        k1: (seg.k1 ?? seg.k ?? 0) * m,
        w0: seg.w,
        w1: seg.w1 ?? seg.w,
        rise: seg.rise,
        left: o.mirror ? seg.right : seg.left,
        right: o.mirror ? seg.left : seg.right,
      },
      o.world,
      o.chunk,
    );
  }
  const features: Feature[] = [];
  for (const it of t.items) {
    for (const f of expandItem(it, s0, m, o)) features.push(track.addFeature(f));
  }
  return { serial: o.chunk, id: t.id, s0, s1: track.endS, mirror: o.mirror, world: o.world, features };
}

function expandItem(it: ItemSpec, s0: number, m: number, o: PlaceOptions): Omit<Feature, 'id'>[] {
  const x = (it.x ?? 0) * m;
  if (it.k === 'coins') {
    const n = Math.max(1, Math.round((it.n ?? 6) * (o.coinScale ?? 1)));
    const ds = it.ds ?? 3;
    const x1 = (it.x1 ?? it.x ?? 0) * m;
    const out: Omit<Feature, 'id'>[] = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      // Smooth S-shaped lateral interpolation so trails read as gentle lane changes.
      const st = t * t * (3 - 2 * t);
      out.push({ kind: 'coin', s: s0 + it.s + i * ds, len: 0.6, x: x + (x1 - x) * st, hw: 0.35, h: 0.6, chunk: o.chunk });
    }
    return out;
  }
  const base: Omit<Feature, 'id'> = {
    kind: it.k,
    s: s0 + it.s,
    len: it.len ?? defaultLen(it.k),
    x,
    hw: it.hw ?? defaultHw(it.k),
    h: it.h ?? defaultH(it.k),
    chunk: o.chunk,
  };
  if (it.h2 !== undefined) base.h2 = it.h2;
  if (it.amp !== undefined) base.amp = it.amp * m;
  if (it.freq !== undefined) base.freq = it.freq;
  if (it.phase !== undefined) base.phase = it.phase;
  if (it.dir !== undefined) base.dir = it.dir * m;
  if (it.strength !== undefined) base.strength = it.strength * (it.k === 'gust' ? o.windScale ?? 1 : 1);
  if (it.label !== undefined) base.label = it.label;
  if (it.tag !== undefined) base.tag = it.tag;
  base.variant = it.variant ?? Math.floor(o.rng.next() * 4);
  if (it.k === 'pickup') base.cargo = it.cargo && it.cargo !== 'auto' ? it.cargo : o.pickCargo(o.rng);
  return [base];
}

export function defaultLen(k: string): number {
  switch (k) {
    case 'cone': return 0.6;
    case 'crate': return 1.2;
    case 'barrier': return 0.8;
    case 'cart': return 2.6;
    case 'movingBarrier': return 0.8;
    case 'overhead': return 0.8;
    case 'hook': return 1.0;
    case 'puddle': return 8;
    case 'bump': return 0.6;
    case 'ramp': return 7;
    case 'platform': return 30;
    case 'gap': return 10;
    case 'gust': return 40;
    case 'pickup': return 1.0;
    case 'depot': return 26;
    case 'gate': return 0.5;
    case 'sign': return 0.5;
    case 'wall': return 20;
    default: return 1;
  }
}

export function defaultHw(k: string): number {
  switch (k) {
    case 'cone': return 0.3;
    case 'crate': return 0.7;
    case 'barrier': return 1.4;
    case 'cart': return 1.0;
    case 'movingBarrier': return 1.2;
    case 'overhead': return 6;
    case 'hook': return 0.45;
    case 'puddle': return 1.6;
    case 'bump': return 4.5;
    case 'ramp': return 1.6;
    case 'platform': return 3;
    case 'gap': return 6;
    case 'gust': return 9;
    case 'pickup': return 0.5;
    case 'depot': return 3;
    case 'gate': return 1.5;
    case 'sign': return 0.4;
    case 'wall': return 0.8;
    default: return 0.5;
  }
}

export function defaultH(k: string): number {
  switch (k) {
    case 'cone': return 0.7;
    case 'crate': return 1.0;
    case 'barrier': return 1.1;
    case 'cart': return 1.6;
    case 'movingBarrier': return 1.1;
    case 'overhead': return 3.6;
    case 'hook': return 2.6;
    case 'ramp': return 1.3;
    case 'platform': return 2.2;
    case 'wall': return 1.0;
    default: return 0;
  }
}
