import { CARGO_IDS, type CargoShape } from '../data/cargo';
import { ACHIEVEMENTS } from '../data/achievements';
import { ACCESSORIES, PAINTS } from '../data/cosmetics';
import { LEVELS } from '../data/levels';
import { MAX_TIER, type UpgradeLevels } from '../data/upgrades';
import { VEHICLE_IDS, type VehicleKind } from '../data/vehicles';
import type { ContractKind } from '../data/contracts';
import { isValidDateKey } from '../core/time';
import { ECONOMY } from '../data/economy';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'wobblehaul.save';
/** Data module limit is 1 MB; keep a safety margin. */
export const SAVE_MAX_BYTES = 900_000;

export interface LevelRecord {
  done: boolean;
  medals: [boolean, boolean, boolean];
  bestValue: number;
  plays: number;
}

export interface Contract {
  id: string;
  kind: ContractKind;
  n: number;
  extra?: CargoShape;
  progress: number;
  reward: number;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  resScale: number;
  shake: number;
  reducedMotion: boolean;
  sensitivity: number;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  createdAt: number;
  updatedAt: number;
  coins: number;
  lifetimeCoins: number;
  tokens: number;
  garage: {
    owned: VehicleKind[];
    equipped: VehicleKind;
    paints: string[];
    paint: string;
    accessories: string[];
    equippedAcc: string[];
  };
  upgrades: UpgradeLevels;
  campaign: { levels: Record<string, LevelRecord>; last: string | null };
  endless: { bestDistance: number; bestScore: number; bestBanked: number; runs: number };
  daily: { lastClaimKey: string; best: Record<string, number> };
  album: CargoShape[];
  delivered: Partial<Record<CargoShape, number>>;
  achievements: string[];
  stats: { runs: number; distance: number; deliveredItems: number; recoveries: number; sheds: number; cakesIntact: number; nearMisses: number; crashes: number };
  contracts: { active: Contract[]; serial: number; completed: number };
  settings: Settings;
  tutorialDone: boolean;
  settledRuns: string[];
  trial: { paint: string | null; runsLeft: number };
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, music: 0.55, sfx: 0.8, muted: false, quality: 'auto', resScale: 1, shake: 0.7, reducedMotion: false, sensitivity: 1,
};

export function defaultSave(now = 0): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    coins: 0,
    lifetimeCoins: 0,
    tokens: 0,
    garage: { owned: ['pickup'], equipped: 'pickup', paints: ['tomato'], paint: 'tomato', accessories: [], equippedAcc: [] },
    upgrades: { suspension: 0, grip: 0, supports: 0 },
    campaign: { levels: {}, last: null },
    endless: { bestDistance: 0, bestScore: 0, bestBanked: 0, runs: 0 },
    daily: { lastClaimKey: '', best: {} },
    album: [],
    delivered: {},
    achievements: [],
    stats: { runs: 0, distance: 0, deliveredItems: 0, recoveries: 0, sheds: 0, cakesIntact: 0, nearMisses: 0, crashes: 0 },
    contracts: { active: [], serial: 0, completed: 0 },
    settings: { ...DEFAULT_SETTINGS },
    tutorialDone: false,
    settledRuns: [],
    trial: { paint: null, runsLeft: 0 },
  };
}

// ------------------------------------------------------------------ migrations
/** v1 was the prototype schema (flat). Kept so older saves keep their progress. */
interface SaveV1 {
  version: 1;
  coins?: number;
  trucks?: string[];
  truck?: string;
  levels?: Record<string, number>; // medal count per level
  settings?: Partial<Settings>;
  tutorial?: boolean;
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {
  1: (raw) => {
    const v1 = raw as unknown as SaveV1;
    const out = defaultSave(Date.now()) as unknown as Record<string, unknown>;
    const d = out as unknown as SaveData;
    d.coins = num(v1.coins, 0);
    d.garage.owned = ['pickup', ...(v1.trucks ?? []).filter((t) => (VEHICLE_IDS as string[]).includes(t))] as VehicleKind[];
    d.garage.equipped = (VEHICLE_IDS as string[]).includes(v1.truck ?? '') ? (v1.truck as VehicleKind) : 'pickup';
    for (const [id, medals] of Object.entries(v1.levels ?? {})) {
      const m = Math.max(0, Math.min(3, Math.floor(num(medals, 0))));
      d.campaign.levels[id] = { done: true, medals: [m >= 1, m >= 2, m >= 3], bestValue: 0, plays: 1 };
    }
    d.settings = { ...DEFAULT_SETTINGS, ...(v1.settings ?? {}) };
    d.tutorialDone = !!v1.tutorial || Object.keys(v1.levels ?? {}).length > 0;
    return out;
  },
};

export type LoadOutcome =
  | { ok: true; data: SaveData; migratedFrom: number | null; repaired: string[] }
  | { ok: false; reason: 'corrupt' | 'future' | 'invalid'; detail: string };

/** Parse + migrate + validate a raw save string. Never throws. */
export function parseSave(raw: string | null, now = Date.now()): LoadOutcome {
  if (raw === null || raw === '') return { ok: true, data: defaultSave(now), migratedFrom: null, repaired: [] };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'corrupt', detail: String(e) };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'invalid', detail: 'not an object' };
  let rec = obj as Record<string, unknown>;
  let version = typeof rec.version === 'number' ? rec.version : 1;
  if (version > SAVE_VERSION) return { ok: false, reason: 'future', detail: `save version ${version} is newer than ${SAVE_VERSION}` };
  const from = version < SAVE_VERSION ? version : null;
  while (version < SAVE_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) return { ok: false, reason: 'invalid', detail: `no migration from v${version}` };
    rec = m(rec);
    version = typeof rec.version === 'number' ? rec.version : version + 1;
  }
  const repaired: string[] = [];
  const data = sanitize(rec, now, repaired);
  return { ok: true, data, migratedFrom: from, repaired };
}

function num(v: unknown, d: number, lo = -Infinity, hi = Infinity): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.max(lo, Math.min(hi, n));
}
const int = (v: unknown, d: number, lo: number, hi: number): number => Math.floor(num(v, d, lo, hi));
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const LEVEL_IDS = new Set(LEVELS.map((l) => l.id));
const PAINT_IDS = new Set(PAINTS.map((p) => p.id));
const ACC_IDS = new Set(ACCESSORIES.map((a) => a.id));
const ACH_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

/** Coerce any object into a valid SaveData, repairing unknown or out-of-range values. */
export function sanitize(src: Record<string, unknown>, now: number, repaired: string[] = []): SaveData {
  const d = defaultSave(now);
  d.createdAt = num(src.createdAt, now, 0);
  d.updatedAt = num(src.updatedAt, now, 0);
  d.coins = int(src.coins, 0, 0, 1e9);
  if (src.coins !== undefined && src.coins !== d.coins) repaired.push('coins');
  d.lifetimeCoins = int(src.lifetimeCoins, d.coins, 0, 1e10);
  d.tokens = int(src.tokens, 0, 0, ECONOMY.spareTireMax);
  const g = obj(src.garage);
  const owned = strArr(g.owned).filter((v) => (VEHICLE_IDS as string[]).includes(v)) as VehicleKind[];
  d.garage.owned = [...new Set<VehicleKind>(['pickup', ...owned])];
  d.garage.equipped = d.garage.owned.includes(g.equipped as VehicleKind) ? (g.equipped as VehicleKind) : 'pickup';
  d.garage.paints = [...new Set(['tomato', ...strArr(g.paints).filter((p) => PAINT_IDS.has(p))])];
  d.garage.paint = d.garage.paints.includes(g.paint as string) ? (g.paint as string) : 'tomato';
  d.garage.accessories = [...new Set(strArr(g.accessories).filter((a) => ACC_IDS.has(a)))];
  d.garage.equippedAcc = [...new Set(strArr(g.equippedAcc).filter((a) => d.garage.accessories.includes(a)))];
  const u = obj(src.upgrades);
  d.upgrades = { suspension: int(u.suspension, 0, 0, MAX_TIER), grip: int(u.grip, 0, 0, MAX_TIER), supports: int(u.supports, 0, 0, MAX_TIER) };
  const c = obj(src.campaign);
  for (const [id, r] of Object.entries(obj(c.levels))) {
    if (!LEVEL_IDS.has(id)) {
      repaired.push(`level:${id}`);
      continue;
    }
    const rr = obj(r);
    const m = Array.isArray(rr.medals) ? rr.medals : [];
    d.campaign.levels[id] = { done: bool(rr.done, false), medals: [!!m[0], !!m[1], !!m[2]], bestValue: int(rr.bestValue, 0, 0, 1e6), plays: int(rr.plays, 0, 0, 1e7) };
  }
  d.campaign.last = typeof c.last === 'string' && LEVEL_IDS.has(c.last) ? c.last : null;
  const e = obj(src.endless);
  d.endless = { bestDistance: num(e.bestDistance, 0, 0, 1e8), bestScore: int(e.bestScore, 0, 0, 1e9), bestBanked: int(e.bestBanked, 0, 0, 1e9), runs: int(e.runs, 0, 0, 1e8) };
  const dy = obj(src.daily);
  d.daily.lastClaimKey = typeof dy.lastClaimKey === 'string' && isValidDateKey(dy.lastClaimKey) ? dy.lastClaimKey : '';
  const best = obj(dy.best);
  const keys = Object.keys(best).filter(isValidDateKey).sort().slice(-21);
  for (const k of keys) d.daily.best[k] = int(best[k], 0, 0, 1e9);
  d.album = [...new Set(strArr(src.album).filter((x) => (CARGO_IDS as string[]).includes(x)))] as CargoShape[];
  const del = obj(src.delivered);
  for (const k of CARGO_IDS) if (del[k] !== undefined) d.delivered[k] = int(del[k], 0, 0, 1e8);
  d.achievements = [...new Set(strArr(src.achievements).filter((a) => ACH_IDS.has(a)))];
  const st = obj(src.stats);
  for (const k of Object.keys(d.stats) as (keyof SaveData['stats'])[]) d.stats[k] = num(st[k], 0, 0, 1e12);
  const ct = obj(src.contracts);
  d.contracts.serial = int(ct.serial, 0, 0, 1e9);
  d.contracts.completed = int(ct.completed, 0, 0, 1e9);
  d.contracts.active = (Array.isArray(ct.active) ? ct.active : []).map(obj).filter((x) => typeof x.id === 'string' && typeof x.kind === 'string').slice(0, 3).map((x) => ({
    id: x.id as string, kind: x.kind as ContractKind, n: int(x.n, 1, 1, 1e6), extra: typeof x.extra === 'string' && (CARGO_IDS as string[]).includes(x.extra) ? (x.extra as CargoShape) : undefined,
    progress: int(x.progress, 0, 0, 1e6), reward: int(x.reward, 50, 0, 5000),
  }));
  const s = obj(src.settings);
  const q = s.quality;
  d.settings = {
    master: num(s.master, DEFAULT_SETTINGS.master, 0, 1), music: num(s.music, DEFAULT_SETTINGS.music, 0, 1), sfx: num(s.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    muted: bool(s.muted, false), quality: q === 'low' || q === 'medium' || q === 'high' || q === 'auto' ? q : 'auto',
    resScale: num(s.resScale, 1, 0.5, 1), shake: num(s.shake, DEFAULT_SETTINGS.shake, 0, 1), reducedMotion: bool(s.reducedMotion, false),
    sensitivity: num(s.sensitivity, 1, 0.5, 2),
  };
  d.tutorialDone = bool(src.tutorialDone, false);
  d.settledRuns = strArr(src.settledRuns).slice(-40);
  const tr = obj(src.trial);
  d.trial = { paint: typeof tr.paint === 'string' && PAINT_IDS.has(tr.paint) ? tr.paint : null, runsLeft: int(tr.runsLeft, 0, 0, 10) };
  if (!d.trial.paint) d.trial.runsLeft = 0;
  return d;
}

export function serialize(d: SaveData): string {
  return JSON.stringify(d);
}

export function byteSize(s: string): number {
  return new TextEncoder().encode(s).length;
}
