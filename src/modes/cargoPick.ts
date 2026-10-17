import type { Rng } from '../core/rng';
import { CARGO, type CargoShape } from '../data/cargo';
import type { WorldId } from '../sim/types';

export const WORLD_CARGO: Record<WorldId, CargoShape[]> = {
  1: ['parcel', 'crate', 'cake', 'armchair', 'plant', 'buoy'],
  2: ['cactus', 'barrel', 'washer', 'melons', 'jukebox', 'tv'],
  3: ['lantern', 'fishtank', 'fridge', 'weddingcake', 'piano', 'neon'],
};

/** Picks from a pool (duplicates weight the choice); a small chance of the rare gnome. */
export function cargoPicker(pool: CargoShape[], rareChance = 0.02): (rng: Rng) => CargoShape {
  const valid = pool.filter((c) => CARGO[c]);
  return (rng) => {
    if (rng.chance(rareChance)) return 'gnome';
    return rng.pick(valid.length ? valid : ['parcel']);
  };
}

/**
 * The cargo a run opens with: the sturdiest item in the pool (uncrushable first, then least fragile,
 * then cheapest). It sits at the bottom of the stack for the whole run, so it must never squish or
 * break under what is stacked on it, and a cheap pick keeps the free opening item from moving the economy.
 */
export function baseCargo(pool: readonly CargoShape[]): CargoShape {
  const defs = pool.map((c) => CARGO[c]).filter((c) => c && !c.rare);
  if (defs.length === 0) return 'crate';
  defs.sort((a, b) => Number(a.crushLimit !== Infinity) - Number(b.crushLimit !== Infinity) || a.fragility - b.fragility || a.value - b.value);
  return defs[0].id;
}
