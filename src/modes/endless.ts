import { clamp, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { CHUNKS, CHUNK_BY_ID, type ChunkTemplate, chunkLength } from '../data/chunks';
import { ECONOMY } from '../data/economy';
import type { EffectiveHandling } from '../data/upgrades';
import { placeChunk, type PlacedChunk } from '../sim/builder';
import { Track } from '../sim/track';
import type { WorldId } from '../sim/types';
import { WORLD_CARGO, cargoPicker } from './cargoPick';
import { reachVehicleFrom, validateRange } from './reach';

/** Explicit maximum difficulty envelope for Long Haul. */
export const ENDLESS_ENVELOPE = {
  speedStart: 15,
  speedMax: 24, // hard cap (m/s)
  speedRampDist: 4200, // m to reach max speed
  diffRampDist: 3600, // m to reach max obstacle difficulty
  windMax: 1.4,
  rainFrom: 0.45, // difficulty from which rain sections may appear
  worldEvery: 2, // depots between world changes
  aheadDist: 320,
  behindDist: 90,
  rebaseAt: 3000,
  rebaseBy: 2000,
  maxCandidates: 8,
} as const;

export interface EndlessOptions {
  seed: number;
  handling: EffectiveHandling;
  startWorld: WorldId;
  /** Fixed world (daily) instead of rotating. */
  fixedWorld?: boolean;
  /** Route ends after this distance (daily); undefined = endless. */
  finishDist?: number;
  windBoost?: number;
  rainy?: boolean;
  /** Returns the current stack top height (m above road) for the load-clearance guarantee. */
  loadHeight?: () => number;
}

export class EndlessRoute {
  readonly track: Track;
  readonly rng: Rng;
  private serial = 0;
  private history: string[] = [];
  private nextDepotDist: number;
  private depotsPlaced = 0;
  world: WorldId;
  private frontier: Uint8Array | undefined;
  private validatedTo = 0;
  finishS: number | null = null;
  placed: PlacedChunk[] = [];
  rainRanges: [number, number][] = [];
  rejected = 0;
  fallbacks = 0;
  private finished = false;

  constructor(private opt: EndlessOptions) {
    this.rng = new Rng(opt.seed);
    this.world = opt.startWorld;
    this.track = new Track(opt.startWorld);
    this.nextDepotDist = this.rng.range(ECONOMY.endlessDepotEvery[0] * 0.6, ECONOMY.endlessDepotEvery[0] * 0.8);
    this.place(CHUNK_BY_ID.start, false);
    this.validatedTo = Math.max(0, this.track.endS - 12);
    this.ensure(ENDLESS_ENVELOPE.aheadDist);
  }

  difficultyAt(dist: number): number {
    return clamp(dist / ENDLESS_ENVELOPE.diffRampDist, 0, 1);
  }

  speedAt = (dist: number): number => {
    const e = ENDLESS_ENVELOPE;
    return e.speedStart + (e.speedMax - e.speedStart) * smoothstep(dist / e.speedRampDist);
  };

  isRainAt(s: number): boolean {
    for (const [a, b] of this.rainRanges) if (s >= a && s <= b) return true;
    return !!this.opt.rainy;
  }

  /** Generate until the track extends to `s` (track space). */
  ensure(s: number): void {
    let guard = 0;
    while (this.track.endS < s && !this.finished && guard++ < 50) this.appendNext();
  }

  private absEnd(): number {
    return this.track.endS + this.track.sOffset;
  }

  private appendNext(): void {
    const dist = this.absEnd();
    if (this.opt.finishDist !== undefined && dist >= this.opt.finishDist) {
      const p = this.place(CHUNK_BY_ID.finish, false);
      this.finishS = p.s0 + 2;
      this.finished = true;
      return;
    }
    if (dist >= this.nextDepotDist) {
      this.depotsPlaced++;
      this.place(CHUNK_BY_ID.depot_fork, false);
      this.nextDepotDist = dist + this.rng.range(ECONOMY.endlessDepotEvery[0], ECONOMY.endlessDepotEvery[1]);
      this.advanceValidation();
      if (!this.opt.fixedWorld && this.depotsPlaced % ENDLESS_ENVELOPE.worldEvery === 0) {
        this.world = ((this.world % 3) + 1) as WorldId;
      }
      return;
    }
    const d = this.difficultyAt(dist);
    const pool = CHUNKS.filter((c) => !c.scheduledOnly && c.weight > 0 && c.worlds.includes(this.world) && d >= c.diff[0] - 1e-6 && d <= c.diff[1] + 1e-6);
    const tried = new Set<string>();
    for (let attempt = 0; attempt < ENDLESS_ENVELOPE.maxCandidates; attempt++) {
      const cands = pool.filter((c) => !tried.has(c.id));
      if (cands.length === 0) break;
      const t = this.rng.weighted(cands, (c) => this.weightFor(c, d));
      tried.add(t.id);
      const snap = this.track.snapshot();
      const placedCount = this.placed.length;
      const rainBefore = this.rainRanges.length;
      const serialBefore = this.serial;
      this.place(t, t.segs.length > 0 && this.rng.chance(0.5), d);
      if (this.advanceValidation()) return;
      // Reject: roll back and try another candidate.
      this.rejected++;
      this.track.restore(snap);
      this.placed.length = placedCount;
      this.rainRanges.length = rainBefore;
      this.serial = serialBefore;
    }
    // Fallback: a guaranteed-passable breather (validated from the same frontier).
    this.fallbacks++;
    this.place(CHUNK_BY_ID.cargo_line, false, d);
    this.advanceValidation(true);
  }

  private weightFor(c: ChunkTemplate, d: number): number {
    let w = c.weight;
    const last = this.history.slice(-6);
    if (last.slice(-2).includes(c.id)) return 0;
    if (last.includes(c.id)) w *= 0.3;
    const prev = this.history[this.history.length - 1];
    const prevT = prev ? CHUNK_BY_ID[prev] : undefined;
    if (prevT && prevT.tags[0] === c.tags[0]) w *= 0.5;
    // Breathers become rarer as difficulty climbs but never vanish; after two hazards in a row, favour one.
    const hazardsInRow = this.history.slice(-2).filter((id) => CHUNK_BY_ID[id]?.tags.some((t) => t === 'hazard' || t === 'hard' || t === 'moving')).length;
    if (c.tags.includes('breather')) w *= hazardsInRow >= 2 ? 3 : 1.4 - 0.8 * d;
    else w *= 0.6 + 0.8 * d;
    return w;
  }

  private place(t: ChunkTemplate, mirror: boolean, d = 0): PlacedChunk {
    const windScale = 1 + (ENDLESS_ENVELOPE.windMax - 1) * d + (this.opt.windBoost ?? 0);
    const pick = cargoPicker(WORLD_CARGO[this.world], 0.025);
    const p = placeChunk(this.track, t, { mirror, world: this.world, chunk: this.serial++, rng: this.rng, pickCargo: pick, windScale, coinScale: 0.75 });
    if (d >= ENDLESS_ENVELOPE.rainFrom && !this.opt.rainy && this.rng.chance(0.18)) this.rainRanges.push([p.s0, p.s1]);
    this.history.push(t.id);
    if (this.history.length > 12) this.history.shift();
    this.placed.push(p);
    return p;
  }

  /** Validate newly placed geometry from the stored frontier. */
  private advanceValidation(force = false): boolean {
    const target = this.track.endS - 12;
    if (target <= this.validatedTo) return true;
    const h = this.opt.handling;
    const load = this.opt.loadHeight ? Math.min(4.8, this.opt.loadHeight() + 0.1) : undefined;
    const res = validateRange(this.track, this.validatedTo, target, reachVehicleFrom(h), {
      vMin: ENDLESS_ENVELOPE.speedStart * 0.84,
      vMax: ENDLESS_ENVELOPE.speedMax,
      loadClearance: load && load > h.cabHeight + 0.2 ? load : undefined,
    }, this.frontier);
    if (!res.ok && !force) return false;
    this.frontier = res.ok ? res.frontier : undefined;
    this.validatedTo = target;
    return true;
  }

  /** Called by the run session each step. Returns chunk serials that were recycled. */
  update(truckS: number): { removed: Set<number>; rebased: number } {
    this.ensure(truckS + ENDLESS_ENVELOPE.aheadDist);
    const removed = this.track.trimBefore(truckS - ENDLESS_ENVELOPE.behindDist);
    if (removed.size) this.placed = this.placed.filter((p) => !removed.has(p.serial));
    let rebased = 0;
    if (truckS > ENDLESS_ENVELOPE.rebaseAt) {
      rebased = ENDLESS_ENVELOPE.rebaseBy;
      this.track.rebaseS(rebased);
      this.validatedTo -= rebased;
      if (this.finishS !== null) this.finishS -= rebased;
      for (const p of this.placed) { p.s0 -= rebased; p.s1 -= rebased; }
      this.rainRanges = this.rainRanges.map(([a, b]) => [a - rebased, b - rebased] as [number, number]).filter(([, b]) => b > -200);
    }
    return { removed, rebased };
  }
}

export { chunkLength };
