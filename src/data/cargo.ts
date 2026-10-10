export type CargoShape =
  | 'parcel' | 'crate' | 'cake' | 'armchair' | 'plant' | 'buoy'
  | 'cactus' | 'barrel' | 'washer' | 'melons' | 'jukebox' | 'tv'
  | 'lantern' | 'fishtank' | 'fridge' | 'weddingcake' | 'piano' | 'neon' | 'gnome';

export interface CargoDef {
  id: CargoShape;
  name: string;
  desc: string;
  world: 0 | 1 | 2 | 3; // 0 = any world
  mass: number; // kg
  height: number; // m
  width: number; // m (lateral footprint)
  value: number; // coins when delivered intact
  fragility: number; // 0..1, damage sensitivity to jolts
  grip: number; // 0..1 friction with the item below
  crushLimit: number; // kg resting above before it squishes (Infinity = sturdy)
  rare?: boolean;
}

export const CARGO: Record<CargoShape, CargoDef> = {
  parcel: { id: 'parcel', name: 'Cardboard Parcel', desc: 'Contents: almost certainly more cardboard.', world: 1, mass: 4, height: 0.55, width: 0.9, value: 6, fragility: 0.1, grip: 0.8, crushLimit: Infinity },
  crate: { id: 'crate', name: 'Fish Crate', desc: 'Smells like a promotion. Handle with nose plugs.', world: 1, mass: 12, height: 0.6, width: 1.0, value: 9, fragility: 0.0, grip: 0.9, crushLimit: Infinity },
  cake: { id: 'cake', name: 'Layer Cake', desc: 'Three layers, two candles, zero patience.', world: 1, mass: 3, height: 0.5, width: 0.8, value: 14, fragility: 0.8, grip: 0.55, crushLimit: 14 },
  armchair: { id: 'armchair', name: 'Squishy Armchair', desc: 'Pre-loved by a cat who would like it back.', world: 1, mass: 18, height: 0.9, width: 1.0, value: 16, fragility: 0.15, grip: 0.7, crushLimit: Infinity },
  plant: { id: 'plant', name: 'Potted Fern', desc: 'Named Gerald. Gerald does not enjoy corners.', world: 1, mass: 6, height: 0.85, width: 0.7, value: 10, fragility: 0.4, grip: 0.75, crushLimit: 30 },
  buoy: { id: 'buoy', name: 'Striped Buoy', desc: 'Floats beautifully. Stacks less beautifully.', world: 1, mass: 8, height: 0.8, width: 0.75, value: 8, fragility: 0.05, grip: 0.5, crushLimit: Infinity },
  cactus: { id: 'cactus', name: 'Cactus in a Pot', desc: 'Free hugs. Not recommended.', world: 2, mass: 7, height: 0.9, width: 0.6, value: 11, fragility: 0.3, grip: 0.8, crushLimit: 25 },
  barrel: { id: 'barrel', name: 'Root Beer Barrel', desc: 'Fizzy, heavy, and very round on purpose.', world: 2, mass: 20, height: 0.85, width: 0.8, value: 12, fragility: 0.05, grip: 0.6, crushLimit: Infinity },
  washer: { id: 'washer', name: 'Washing Machine', desc: 'Spin cycle sold separately. Wobble included.', world: 2, mass: 35, height: 0.95, width: 0.95, value: 22, fragility: 0.2, grip: 0.85, crushLimit: Infinity },
  melons: { id: 'melons', name: 'Watermelon Crate', desc: 'Seven melons, one dream.', world: 2, mass: 15, height: 0.55, width: 1.0, value: 13, fragility: 0.5, grip: 0.8, crushLimit: 60 },
  jukebox: { id: 'jukebox', name: 'Retro Jukebox', desc: 'Only plays one song. It is a good song.', world: 2, mass: 28, height: 1.1, width: 0.9, value: 30, fragility: 0.45, grip: 0.8, crushLimit: Infinity },
  tv: { id: 'tv', name: 'Boxy Television', desc: 'Receives four channels and one strong opinion.', world: 2, mass: 14, height: 0.75, width: 0.85, value: 20, fragility: 0.6, grip: 0.75, crushLimit: 45 },
  lantern: { id: 'lantern', name: 'Paper Lantern Bundle', desc: 'Lighter than air. Almost.', world: 3, mass: 2, height: 0.7, width: 0.7, value: 12, fragility: 0.6, grip: 0.6, crushLimit: 10 },
  fishtank: { id: 'fishtank', name: 'Fish Tank', desc: 'Residents: Gill, Bill and Phil. They are counting on you.', world: 3, mass: 22, height: 0.7, width: 1.0, value: 28, fragility: 0.85, grip: 0.7, crushLimit: 20 },
  fridge: { id: 'fridge', name: 'Mint Fridge', desc: 'Keeps snacks cold and drivers humble.', world: 3, mass: 45, height: 1.4, width: 0.95, value: 34, fragility: 0.25, grip: 0.9, crushLimit: Infinity },
  weddingcake: { id: 'weddingcake', name: 'Wedding Cake', desc: 'Seven tiers. The wedding is in nine minutes.', world: 3, mass: 6, height: 1.0, width: 0.85, value: 45, fragility: 0.95, grip: 0.6, crushLimit: 8 },
  piano: { id: 'piano', name: 'Upright Piano', desc: 'Plays a sad chord whenever you brake. You never brake.', world: 3, mass: 60, height: 1.15, width: 1.05, value: 50, fragility: 0.35, grip: 0.95, crushLimit: Infinity },
  neon: { id: 'neon', name: 'Neon OPEN Sign', desc: 'Always open. Even when it should not be.', world: 3, mass: 5, height: 0.6, width: 1.0, value: 18, fragility: 0.7, grip: 0.65, crushLimit: 20 },
  gnome: { id: 'gnome', name: 'Golden Garden Gnome', desc: 'Rare, shiny, and slightly smug about it.', world: 0, mass: 3, height: 0.5, width: 0.55, value: 60, fragility: 0.3, grip: 0.7, crushLimit: 40, rare: true },
};

export const CARGO_IDS = Object.keys(CARGO) as CargoShape[];
export const isFragile = (c: CargoDef): boolean => c.fragility >= 0.55;
