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
