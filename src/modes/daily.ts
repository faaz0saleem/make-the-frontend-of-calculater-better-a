import { hashString, Rng } from '../core/rng';
import { msUntilUtcMidnight, utcDateKey } from '../core/time';
import type { VehicleKind } from '../data/vehicles';
import type { WorldId } from '../sim/types';

export interface DailySpec {
  dateKey: string;
  seed: number;
  world: WorldId;
  vehicle: VehicleKind;
  distance: number;
  windBoost: number;
  rainy: boolean;
  modifierName: string;
  modifierDesc: string;
}

const MODS = [
  { name: 'Calm Skies', desc: 'No special conditions. Pure driving.', wind: 0, rain: false },
  { name: 'Gusty Afternoon', desc: 'Stronger crosswinds on every gust.', wind: 0.5, rain: false },
  { name: 'Drizzle', desc: 'Wet roads all the way. Less grip.', wind: 0, rain: true },
  { name: 'Storm Run', desc: 'Wet roads and strong winds.', wind: 0.4, rain: true },
] as const;

const DAILY_VEHICLES: VehicleKind[] = ['pickup', 'van', 'trike', 'flatbed', 'offroad'];

/** Deterministic daily contract for a UTC date key. Same for everyone, all day. */
export function dailySpec(dateKey: string): DailySpec {
  const seed = hashString('wobblehaul-daily-v1:' + dateKey);
  const rng = new Rng(seed);
  const world = (1 + rng.int(0, 2)) as WorldId;
  const vehicle = rng.pick(DAILY_VEHICLES);
  const mod = rng.weighted([...MODS], (m) => (m.name === 'Calm Skies' ? 2 : 1));
  return {
    dateKey, seed, world, vehicle, distance: 2400 + rng.int(0, 4) * 150,
    windBoost: mod.wind, rainy: mod.rain, modifierName: mod.name, modifierDesc: mod.desc,
  };
}

export function todaysDaily(nowMs: number): { spec: DailySpec; resetsInMs: number } {
  return { spec: dailySpec(utcDateKey(nowMs)), resetsInMs: msUntilUtcMidnight(nowMs) };
}

export function dailyScore(s: { distance: number; banked: number; nearMisses: number; recoveries: number; cleanLandings: number; coins: number }): number {
  return Math.floor(s.distance) + s.banked * 2 + s.coins + s.nearMisses * 10 + s.recoveries * 15 + s.cleanLandings * 5;
}
