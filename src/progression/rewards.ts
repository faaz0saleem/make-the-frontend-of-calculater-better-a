import { ECONOMY } from '../data/economy';
import { LEVEL_BY_ID } from '../data/levels';
import type { VehicleKind } from '../data/vehicles';
import { evaluateMedals, type MedalResult } from '../modes/campaign';
import { dailyScore } from '../modes/daily';
import type { CrashReason, RunMode, RunStats } from '../sim/run';

export interface RunSummary {
  runId: string;
  mode: RunMode;
  levelId?: string;
  dailyKey?: string;
  outcome: 'finished' | 'crashed' | 'quit';
  crashReason?: CrashReason | null;
  stats: RunStats;
  distance: number;
  /** Endless/daily: unbanked cargo value lost on crash. */
  forfeited: number;
  /** Campaign: value of cargo on board when the run ended without delivery. */
  lostCargo: number;
  usedToken: boolean;
  vehicle: VehicleKind;
}

export type RewardKind = 'cargo' | 'coins' | 'bonus' | 'medal' | 'achievement' | 'contract' | 'daily' | 'loss';

export interface RewardLine {
  label: string;
  amount: number;
  kind: RewardKind;
}

export interface Reward {
  lines: RewardLine[];
  total: number;
  medals: MedalResult | null;
  newMedals: [boolean, boolean, boolean];
  score: number;
  newBest: boolean;
  dailyBonus: boolean;
  achievements: string[];
  contracts: string[];
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Pure reward computation for a finished/crashed run. The store applies it exactly once
 * (keyed by runId), so the result screen and the wallet always agree.
 */
export function computeRewards(sum: RunSummary, prevMedals: [boolean, boolean, boolean] | null, prevBest: number, dailyClaimable: boolean): Reward {
  const s = sum.stats;
  const lines: RewardLine[] = [];
  const finished = sum.outcome === 'finished';
  let medals: MedalResult | null = null;
  const newMedals: [boolean, boolean, boolean] = [false, false, false];
  let score = 0;
  let newBest = false;
  let dailyBonus = false;

  const bonusLines = () => {
    if (s.coins > 0) lines.push({ label: `Road coins (${s.coins})`, amount: s.coins * ECONOMY.coinPickupValue, kind: 'coins' });
    if (s.nearMisses > 0) lines.push({ label: `Near misses ×${s.nearMisses}`, amount: s.nearMisses * ECONOMY.nearMissBonus, kind: 'bonus' });
    if (s.recoveries > 0) lines.push({ label: `Wobble saves ×${s.recoveries}`, amount: s.recoveries * ECONOMY.recoveryBonus, kind: 'bonus' });
    if (s.cleanLandings > 0) lines.push({ label: `Clean landings ×${s.cleanLandings}`, amount: s.cleanLandings * ECONOMY.cleanLandingBonus, kind: 'bonus' });
    if (s.heroSheds > 0) lines.push({ label: `Smart sheds ×${s.heroSheds}`, amount: s.heroSheds * ECONOMY.heroShedBonus, kind: 'bonus' });
  };

  if (sum.mode === 'campaign' || sum.mode === 'tutorial') {
    const level = sum.levelId ? LEVEL_BY_ID[sum.levelId] : undefined;
    if (finished) {
      const delivered = s.delivered.reduce((a, d) => a + d.value, 0);
      lines.push({ label: `Cargo delivered (${plural(s.delivered.length, 'item')})`, amount: delivered, kind: 'cargo' });
    } else if (sum.lostCargo > 0) {
      lines.push({ label: 'Cargo lost in the crash', amount: -sum.lostCargo, kind: 'loss' });
    }
    bonusLines();
    if (finished && level) {
      lines.push({ label: 'Delivery complete', amount: ECONOMY.levelClearBase + ECONOMY.levelClearPerIndex * level.num, kind: 'bonus' });
      medals = evaluateMedals(level, s, true);
      const got: [boolean, boolean, boolean] = [medals.delivery, medals.route, medals.care];
      for (let i = 0; i < 3; i++) {
        if (got[i] && !(prevMedals?.[i] ?? false)) {
          newMedals[i] = true;
          lines.push({ label: ['First Delivery medal', 'First Route medal', 'First Care medal'][i], amount: ECONOMY.firstMedalBonus, kind: 'medal' });
        }
      }
      score = medals.deliveredValue;
      newBest = score > prevBest;
    } else if (level) {
      medals = evaluateMedals(level, s, false);
    }
  } else {
    // Long Haul & Daily Contract share depot banking rules
    if (s.banked > 0) lines.push({ label: `Banked at depots (${plural(s.bankCount, 'drop')})`, amount: s.banked, kind: 'cargo' });
    if (sum.forfeited > 0) lines.push({ label: 'Unbanked cargo forfeited', amount: -sum.forfeited, kind: 'loss' });
    bonusLines();
    const distCoins = Math.floor(sum.distance / 100) * ECONOMY.endlessCoinsPer100m;
    if (distCoins > 0) lines.push({ label: `Distance (${Math.floor(sum.distance)} m)`, amount: distCoins, kind: 'bonus' });
    score = dailyScore({ distance: sum.distance, banked: s.banked, nearMisses: s.nearMisses, recoveries: s.recoveries, cleanLandings: s.cleanLandings, coins: s.coins });
    newBest = score > prevBest;
    if (sum.mode === 'daily' && finished && dailyClaimable) {
      dailyBonus = true;
      lines.push({ label: 'Daily Contract completed', amount: ECONOMY.dailyCompletionBonus, kind: 'daily' });
    }
  }
  const total = lines.reduce((a, l) => a + (l.amount > 0 ? l.amount : 0), 0);
  return { lines, total, medals, newMedals, score, newBest, dailyBonus, achievements: [], contracts: [] };
}
