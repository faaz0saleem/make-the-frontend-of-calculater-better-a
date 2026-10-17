import { Rng } from '../core/rng';
import { CHUNK_BY_ID } from '../data/chunks';
import { type CareObjective, type LevelDef, type RouteObjective } from '../data/levels';
import { placeChunk, type PlacedChunk } from '../sim/builder';
import type { RunStats } from '../sim/run';
import { Track } from '../sim/track';
import { baseCargo, cargoPicker } from './cargoPick';

export interface BuiltRoute {
  track: Track;
  finishS: number | null;
  chunks: PlacedChunk[];
}

/** Deterministically builds a campaign level's track (same layout every attempt). */
export function buildLevel(level: LevelDef): BuiltRoute {
  const track = new Track(level.world);
  const rng = new Rng('level:' + level.id);
  const pick = cargoPicker(level.cargo, level.cargo.includes('gnome') ? 0.06 : 0);
  // Opening chunk: the level's sturdiest cargo dead ahead, so the stack starts building at once.
  // Its picker ignores the rng, so the rest of the level keeps exactly the same random layout.
  const base = baseCargo(level.cargo);
  const pickBase = () => base;
  const ownStart = CHUNK_BY_ID[level.seq[0]?.replace('~', '')]?.tags.includes('start');
  const seq = [...(ownStart ? [] : ['start_load']), ...level.seq, 'finish'];
  const chunks: PlacedChunk[] = [];
  let finishS = 0;
  seq.forEach((ref, i) => {
    const mirror = ref.startsWith('~');
    const id = mirror ? ref.slice(1) : ref;
    const t = CHUNK_BY_ID[id];
    if (!t) throw new Error(`Unknown chunk ${id} in level ${level.id}`);
    const opener = i === 0 && t.tags.includes('start');
    const placed = placeChunk(track, t, { mirror, world: level.world, chunk: i, rng, pickCargo: opener ? pickBase : pick, windScale: level.wind ?? 1, coinScale: 0.6 });
    chunks.push(placed);
    if (id === 'finish') finishS = placed.s0 + 2;
  });
  return { track, finishS, chunks };
}

export function levelSpeedAt(level: LevelDef, finishS: number): (d: number) => number {
  const [a, b] = level.speed;
  return (d) => a + (b - a) * Math.max(0, Math.min(1, d / Math.max(1, finishS)));
}

export interface MedalResult {
  delivery: boolean;
  route: boolean;
  care: boolean;
  deliveredValue: number;
  routeValue: number;
  routeNeed: number;
  careValue: number;
  careNeed: number;
}

export function deliveredValueOf(stats: RunStats): number {
  return stats.delivered.reduce((a, d) => a + d.value, 0);
}

export function routeProgress(r: RouteObjective, s: RunStats): { value: number; need: number; ok: boolean } {
  switch (r.kind) {
    case 'gate': { const v = s.gates[r.tag] ?? 0; return { value: v, need: r.n, ok: v >= r.n }; }
    case 'coins': return { value: s.coins, need: r.n, ok: s.coins >= r.n };
    case 'noShed': return { value: s.sheds, need: 0, ok: s.sheds === 0 };
    case 'nearMiss': return { value: s.nearMisses, need: r.n, ok: s.nearMisses >= r.n };
    case 'closeShave': return { value: s.closeShaves, need: r.n, ok: s.closeShaves >= r.n };
    case 'jumps': return { value: s.landings, need: r.n, ok: s.landings >= r.n };
    case 'deliverType': {
      const v = s.delivered.filter((d) => d.cargo === r.cargo).length;
      return { value: v, need: r.n, ok: v >= r.n };
    }
    case 'stack': return { value: s.maxItems, need: r.n, ok: s.maxItems >= r.n };
    case 'noScrape': return { value: s.scrapes, need: 0, ok: s.scrapes === 0 };
  }
}

export function careProgress(c: CareObjective, s: RunStats): { value: number; need: number; ok: boolean } {
  switch (c.kind) {
    case 'lostMax': {
      const lost = s.spilled + s.sheds;
      return { value: lost, need: c.n, ok: lost <= c.n };
    }
    case 'intactPct': {
      const pct = s.collectedValue > 0 ? Math.round((deliveredValueOf(s) / s.collectedValue) * 100) : 0;
      return { value: pct, need: c.pct, ok: s.collectedValue > 0 && pct >= c.pct };
    }
    case 'fragileIntact': return { value: s.fragileIntact, need: c.n, ok: s.fragileIntact >= c.n };
  }
}

/** Medals only count on a completed delivery. */
export function evaluateMedals(level: LevelDef, stats: RunStats, finished: boolean): MedalResult {
  const value = deliveredValueOf(stats);
  const r = routeProgress(level.objectives.route, stats);
  const c = careProgress(level.objectives.care, stats);
  return {
    delivery: finished && value >= level.objectives.target,
    route: finished && r.ok,
    care: finished && c.ok,
    deliveredValue: value,
    routeValue: r.value,
    routeNeed: r.need,
    careValue: c.value,
    careNeed: c.need,
  };
}

export { CHUNK_BY_ID };
