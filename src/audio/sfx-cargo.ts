/**
 * Pure helpers for the cargo sounds: which material a cargo item sounds like, and the pitch ladder
 * the pickup chime climbs as the stack grows. No WebAudio here, so it is unit-testable.
 */
export type Material =
  | 'card' | 'wood' | 'plush' | 'rubber' | 'ceramic' | 'metal' | 'glass' | 'cake' | 'paper' | 'piano';

const MATERIAL: Record<string, Material> = {
  parcel: 'card',
  crate: 'wood',
  barrel: 'wood',
  melons: 'wood',
  armchair: 'plush',
  buoy: 'rubber',
  plant: 'ceramic',
  cactus: 'ceramic',
  gnome: 'ceramic',
  washer: 'metal',
  fridge: 'metal',
  jukebox: 'metal',
  fishtank: 'glass',
  tv: 'glass',
  neon: 'glass',
  cake: 'cake',
  weddingcake: 'cake',
  lantern: 'paper',
  piano: 'piano',
};

/** Material of a cargo id; unknown or missing ids sound like a cardboard parcel. */
export function materialOf(cargo?: string): Material {
  return (cargo && MATERIAL[cargo]) || 'card';
}

/** Scale ladders per world (same keys as the music): eight rungs from the root to the octave. */
const LADDER: Record<number, number[]> = {
  1: [0, 2, 4, 5, 7, 9, 11, 12], // major
  2: [0, 2, 3, 5, 7, 8, 10, 12], // natural minor
  3: [0, 2, 3, 5, 7, 9, 10, 12], // dorian
};

/** Chime root (MIDI note) per world, in the music's key: A4, E5, D5. */
const ROOT: Record<number, number> = { 1: 69, 2: 76, 3: 74 };

/**
 * Semitones above the chime root for the n-th item on the stack (1 = first item). Climbs one scale
 * step per item and stops at the octave, so a full stack of eight ends on "do".
 */
export function pickupSemitones(height: number | undefined, world = 1): number {
  const ladder = LADDER[world] ?? LADDER[1];
  const h = Number.isFinite(height) ? Math.floor(height as number) : 1;
  const i = Math.max(0, Math.min(ladder.length - 1, h - 1));
  return ladder[i];
}

/** MIDI note of the first pickup chime note for a stack height in a world. */
export function pickupNote(height: number | undefined, world = 1): number {
  return (ROOT[world] ?? ROOT[1]) + pickupSemitones(height, world);
}

/** Ground thuds after an accidental spill: one per lost item, at most three. */
export function spillThuds(count: number | undefined): number {
  const n = Number.isFinite(count) ? Math.floor(count as number) : 1;
  return Math.max(1, Math.min(3, n));
}

/** Clatter ticks for a spill, growing with the number of items (capped for CPU). */
export function spillClatter(count: number | undefined): number {
  const n = Number.isFinite(count) ? Math.floor(count as number) : 1;
  return Math.max(2, Math.min(5, 1 + n * 2));
}
