import { CHUNK_BY_ID, type ChunkTemplate } from '../../src/data/chunks';
import { applyUpgrades, type EffectiveHandling } from '../../src/data/upgrades';
import { VEHICLES, type VehicleKind } from '../../src/data/vehicles';
import { Rng } from '../../src/core/rng';
import { placeChunk } from '../../src/sim/builder';
import { RunSession } from '../../src/sim/run';
import { Track } from '../../src/sim/track';
import type { WorldId } from '../../src/sim/types';

export const handling = (v: VehicleKind = 'pickup', tiers = 0): EffectiveHandling =>
  applyUpgrades(VEHICLES[v].stats, { suspension: tiers, grip: tiers, supports: tiers });

/** Build a small custom track from chunk ids (or inline templates). */
export function trackOf(ids: (string | ChunkTemplate)[], world: WorldId = 1): Track {
  const t = new Track(world);
  const rng = new Rng(7);
  ids.forEach((id, i) => {
    const tpl = typeof id === 'string' ? CHUNK_BY_ID[id] : id;
    placeChunk(t, tpl, { mirror: false, world, chunk: i, rng, pickCargo: () => 'parcel' });
  });
  return t;
}

export function session(track: Track, v: VehicleKind = 'pickup', speed = 15, finishS: number | null = null, seed = 1): RunSession {
  return new RunSession({ mode: 'campaign', track, handling: handling(v), seed, speedAt: () => speed, finishS });
}

export const inline = (items: ChunkTemplate['items'], len = 120, extra: Partial<ChunkTemplate> = {}): ChunkTemplate => ({
  id: 'test', worlds: [1, 2, 3], diff: [0, 1], weight: 1, tags: [], segs: [{ len }], items, ...extra,
});
