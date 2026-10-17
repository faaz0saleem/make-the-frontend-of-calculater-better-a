import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { ACHIEVEMENTS } from '../data/achievements';
import { CARGO_IDS } from '../data/cargo';
import { CONTRACT_TEMPLATES, CONTRACT_TYPE_POOL } from '../data/contracts';
import { ACCESSORIES, PAINTS, accessoryById } from '../data/cosmetics';
import { ECONOMY } from '../data/economy';
import { LEVELS } from '../data/levels';
import { MAX_TIER, UPGRADES, type UpgradeTrack } from '../data/upgrades';
import { VEHICLES, VEHICLE_IDS, type VehicleKind } from '../data/vehicles';
import { CARGO } from '../data/cargo';
import { computeRewards, type Reward, type RunSummary } from './rewards';
import { type Contract, type SaveData, SAVE_MAX_BYTES, byteSize, defaultSave, parseSave, serialize } from './save';
import type { SaveStorage } from './storage';

export type TxFail = 'insufficient' | 'owned' | 'invalid' | 'maxed' | 'stale' | 'notOwned' | 'locked';
export type TxResult = { ok: true; spent: number } | { ok: false; reason: TxFail };

export type StoreEvents = {
  change: { reason: string };
  saveError: { message: string };
  saved: { bytes: number };
};

export type SaveHealth = 'ok' | 'readFailed' | 'writeFailed' | 'tooLarge';

/**
 * Owns the save. All mutations go through small validated transactions; every successful
 * purchase or settlement is persisted immediately. If the initial read failed, the store runs
 * in memory and never writes, so an unreadable account save is not overwritten with defaults.
 */
export class ProgressStore {
  data: SaveData = defaultSave(Date.now());
  readonly events = new Emitter<StoreEvents>();
  writable = false;
  health: SaveHealth = 'ok';
  lastError = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private settled = new Map<string, Reward>();
  loadInfo = '';

  constructor(public storage: SaveStorage, private now: () => number = () => Date.now()) {}

  async init(): Promise<void> {
    const res = await this.storage.load();
    if (!res.ok) {
      // Unknown state: keep playing in memory, never overwrite what may exist remotely.
      this.data = defaultSave(this.now());
      this.writable = false;
      this.health = 'readFailed';
      this.lastError = res.error;
      this.loadInfo = 'read-failed';
      this.ensureContracts();
      this.events.emit('change', { reason: 'init' });
      return;
    }
    const parsed = parseSave(res.raw, this.now());
    if (!parsed.ok) {
      if (parsed.reason === 'future') {
        // A newer build wrote this save: don't touch it.
        this.data = defaultSave(this.now());
        this.writable = false;
        this.health = 'readFailed';
        this.lastError = parsed.detail;
        this.loadInfo = 'future';
      } else {
        if (res.raw) await this.storage.backupCorrupt(res.raw);
        this.data = defaultSave(this.now());
        this.writable = true;
        this.loadInfo = 'corrupt-reset';
      }
    } else {
      this.data = parsed.data;
      this.writable = true;
      this.loadInfo = parsed.migratedFrom ? `migrated-v${parsed.migratedFrom}` : res.raw ? 'loaded' : 'new';
    }
    this.health = this.writable ? 'ok' : this.health;
    this.ensureContracts();
    this.events.emit('change', { reason: 'init' });
    if (this.writable && (parsed.ok && parsed.migratedFrom)) await this.flush();
  }

  /** Account changed (e.g. guest signed in): drop in-memory state and reload the right save. */
  async reload(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.saving;
    this.settled.clear();
    await this.init();
  }

  // ------------------------------------------------------------------ persistence
  schedule(): void {
    if (!this.writable) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 400);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.writable) return;
    this.data.updatedAt = this.now();
    const raw = serialize(this.data);
    const bytes = byteSize(raw);
    if (bytes > SAVE_MAX_BYTES) {
      this.health = 'tooLarge';
      this.events.emit('saveError', { message: `save too large (${bytes} bytes)` });
      return;
    }
    this.saving = this.saving.then(async () => {
      try {
        await this.storage.save(raw);
        this.health = 'ok';
        this.events.emit('saved', { bytes });
      } catch (e) {
        this.health = 'writeFailed';
        this.lastError = String(e);
        this.events.emit('saveError', { message: String(e) });
      }
    });
    await this.saving;
  }

  private commit(reason: string, immediate = true): void {
    this.events.emit('change', { reason });
    if (immediate) void this.flush();
    else this.schedule();
  }

  // ------------------------------------------------------------------ queries
  get coins(): number {
    return this.data.coins;
  }

  owns(kind: 'vehicle' | 'paint' | 'accessory', id: string): boolean {
    const g = this.data.garage;
    if (kind === 'vehicle') return g.owned.includes(id as VehicleKind);
    if (kind === 'paint') return g.paints.includes(id);
    return g.accessories.includes(id);
  }

  levelUnlocked(levelId: string): boolean {
    const idx = LEVELS.findIndex((l) => l.id === levelId);
    if (idx < 0) return false;
    if (idx === 0) return true;
    return !!this.data.campaign.levels[LEVELS[idx - 1].id]?.done;
  }

  worldUnlocked(world: 1 | 2 | 3): boolean {
    const first = LEVELS.find((l) => l.world === world)!;
    return this.levelUnlocked(first.id);
  }

  nextLevelId(): string {
    for (const l of LEVELS) if (!this.data.campaign.levels[l.id]?.done) return l.id;
    return this.data.campaign.last ?? LEVELS[LEVELS.length - 1].id;
  }

  medalCount(): number {
    let n = 0;
    for (const r of Object.values(this.data.campaign.levels)) n += r.medals.filter(Boolean).length;
    return n;
  }

  /** Paint currently shown on the truck (active trial wins). */
  get displayPaint(): string {
    return this.data.trial.paint && this.data.trial.runsLeft > 0 ? this.data.trial.paint : this.data.garage.paint;
  }

  // ------------------------------------------------------------------ transactions
  private spend(price: number): boolean {
    if (!Number.isFinite(price) || price < 0) return false;
    if (this.data.coins < price) return false;
    this.data.coins -= price;
    return true;
  }

  buyVehicle(id: string): TxResult {
    const v = VEHICLES[id as VehicleKind];
    if (!v) return { ok: false, reason: 'invalid' };
    if (this.owns('vehicle', id)) return { ok: false, reason: 'owned' };
    if (!this.spend(v.price)) return { ok: false, reason: 'insufficient' };
    this.data.garage.owned.push(v.id);
    this.data.garage.equipped = v.id;
    this.checkFleet();
    this.commit('buyVehicle');
    return { ok: true, spent: v.price };
  }

  buyPaint(id: string): TxResult {
    const p = PAINTS.find((x) => x.id === id);
    if (!p) return { ok: false, reason: 'invalid' };
    if (this.owns('paint', id)) return { ok: false, reason: 'owned' };
    if (!this.spend(p.price)) return { ok: false, reason: 'insufficient' };
    this.data.garage.paints.push(id);
    this.data.garage.paint = id;
    if (this.data.trial.paint === id) this.data.trial = { paint: null, runsLeft: 0 };
    this.commit('buyPaint');
    return { ok: true, spent: p.price };
  }

  buyAccessory(id: string): TxResult {
    const a = ACCESSORIES.find((x) => x.id === id);
    if (!a) return { ok: false, reason: 'invalid' };
    if (this.owns('accessory', id)) return { ok: false, reason: 'owned' };
    if (!this.spend(a.price)) return { ok: false, reason: 'insufficient' };
    this.data.garage.accessories.push(id);
    this.equipAccessoryInternal(id);
    this.commit('buyAccessory');
    return { ok: true, spent: a.price };
  }

  /** `expectedTier` must equal the current tier: a stale double-click can't buy twice. */
  buyUpgrade(track: UpgradeTrack, expectedTier: number): TxResult {
    const def = UPGRADES[track];
    if (!def) return { ok: false, reason: 'invalid' };
    const tier = this.data.upgrades[track];
    if (tier !== expectedTier) return { ok: false, reason: 'stale' };
    if (tier >= MAX_TIER) return { ok: false, reason: 'maxed' };
    const price = def.costs[tier];
    if (!this.spend(price)) return { ok: false, reason: 'insufficient' };
    this.data.upgrades[track] = tier + 1;
    this.commit('buyUpgrade');
    return { ok: true, spent: price };
  }

  buyToken(expectedCount: number): TxResult {
    if (this.data.tokens !== expectedCount) return { ok: false, reason: 'stale' };
    if (this.data.tokens >= ECONOMY.spareTireMax) return { ok: false, reason: 'maxed' };
    if (!this.spend(ECONOMY.spareTirePrice)) return { ok: false, reason: 'insufficient' };
    this.data.tokens++;
    this.commit('buyToken');
    return { ok: true, spent: ECONOMY.spareTirePrice };
  }

  /** Consume one recovery token (never in Daily Contract — enforced by the caller and here). */
  useToken(mode: string): boolean {
    if (mode === 'daily') return false;
    if (this.data.tokens <= 0) return false;
    this.data.tokens--;
    this.commit('useToken');
    return true;
  }

  /** Rewarded-ad grant path (Full Launch only). Idempotent per ad request id. */
  private grantedAds = new Set<string>();
  grantAdReward(requestId: string, reward: 'token' | { trialPaint: string }): boolean {
    if (this.grantedAds.has(requestId)) return false;
    this.grantedAds.add(requestId);
    if (reward === 'token') {
      if (this.data.tokens >= ECONOMY.spareTireMax) return false;
      this.data.tokens++;
    } else {
      if (!PAINTS.some((p) => p.id === reward.trialPaint) || this.owns('paint', reward.trialPaint)) return false;
      this.data.trial = { paint: reward.trialPaint, runsLeft: ECONOMY.cosmeticTrialRuns };
    }
    this.commit('adReward');
    return true;
  }

  equipVehicle(id: string): TxResult {
    if (!VEHICLE_IDS.includes(id as VehicleKind)) return { ok: false, reason: 'invalid' };
    if (!this.owns('vehicle', id)) return { ok: false, reason: 'notOwned' };
    this.data.garage.equipped = id as VehicleKind;
    this.commit('equip', false);
    return { ok: true, spent: 0 };
  }

  equipPaint(id: string): TxResult {
    if (!this.owns('paint', id)) return { ok: false, reason: 'notOwned' };
    this.data.garage.paint = id;
    this.commit('equip', false);
    return { ok: true, spent: 0 };
  }

  toggleAccessory(id: string): TxResult {
    if (!this.owns('accessory', id)) return { ok: false, reason: 'notOwned' };
    const eq = this.data.garage.equippedAcc;
    if (eq.includes(id)) this.data.garage.equippedAcc = eq.filter((x) => x !== id);
    else this.equipAccessoryInternal(id);
    this.commit('equip', false);
    return { ok: true, spent: 0 };
  }

  private equipAccessoryInternal(id: string): void {
    const slot = accessoryById(id)?.slot;
    this.data.garage.equippedAcc = this.data.garage.equippedAcc.filter((x) => accessoryById(x)?.slot !== slot);
    this.data.garage.equippedAcc.push(id);
  }

  updateSettings(patch: Partial<SaveData['settings']>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.commit('settings', false);
  }

  markTutorialDone(): void {
    if (this.data.tutorialDone) return;
    this.data.tutorialDone = true;
    this.commit('tutorial');
  }

  // ------------------------------------------------------------------ settlement
  isSettled(runId: string): boolean {
    return this.settled.has(runId) || this.data.settledRuns.includes(runId);
  }

  previewReward(sum: RunSummary): Reward {
    const lv = sum.levelId ? this.data.campaign.levels[sum.levelId] : undefined;
    const prevBest = sum.mode === 'campaign' || sum.mode === 'tutorial' ? lv?.bestValue ?? 0 : sum.mode === 'daily' ? this.data.daily.best[sum.dailyKey ?? ''] ?? 0 : this.data.endless.bestScore;
    return computeRewards(sum, lv?.medals ?? null, prevBest, this.dailyClaimable(sum.dailyKey));
  }

  dailyClaimable(dateKey?: string): boolean {
    if (!dateKey) return false;
    // Monotonic: a key at or before the last claim can never pay again (reloads, clock rollback).
    return dateKey > this.data.daily.lastClaimKey;
  }

  /** Apply a run's rewards exactly once. Re-entry with the same runId returns the original result. */
  settleRun(sum: RunSummary): Reward {
    const prev = this.settled.get(sum.runId);
    if (prev) return prev;
    if (this.data.settledRuns.includes(sum.runId)) {
      const r = this.previewReward(sum);
      const noop: Reward = { ...r, lines: r.lines, total: 0 };
      this.settled.set(sum.runId, noop);
      return noop;
    }
    const reward = this.previewReward(sum);
    const d = this.data;
    const s = sum.stats;
    d.stats.runs++;
    d.stats.distance += sum.distance;
    d.stats.recoveries += s.recoveries;
    d.stats.sheds += s.sheds;
    d.stats.nearMisses += s.nearMisses;
    d.stats.cakesIntact += sum.outcome === 'finished' || sum.mode !== 'campaign' ? s.cakesIntact : 0;
    if (sum.outcome === 'crashed') d.stats.crashes++;
    for (const c of s.discovered) if (!d.album.includes(c)) d.album.push(c);
    const deliveredItems = sum.mode === 'campaign' || sum.mode === 'tutorial' ? (sum.outcome === 'finished' ? s.delivered : []) : s.delivered;
    d.stats.deliveredItems += deliveredItems.length;
    for (const it of deliveredItems) d.delivered[it.cargo] = (d.delivered[it.cargo] ?? 0) + 1;

    if ((sum.mode === 'campaign' || sum.mode === 'tutorial') && sum.levelId) {
      const rec = d.campaign.levels[sum.levelId] ?? { done: false, medals: [false, false, false], bestValue: 0, plays: 0 };
      rec.plays++;
      if (sum.outcome === 'finished') {
        rec.done = true;
        if (reward.medals) {
          rec.medals = [rec.medals[0] || reward.medals.delivery, rec.medals[1] || reward.medals.route, rec.medals[2] || reward.medals.care];
          rec.bestValue = Math.max(rec.bestValue, reward.medals.deliveredValue);
        }
      }
      d.campaign.levels[sum.levelId] = rec;
      d.campaign.last = sum.levelId;
    } else if (sum.mode === 'endless') {
      d.endless.runs++;
      d.endless.bestDistance = Math.max(d.endless.bestDistance, sum.distance);
      d.endless.bestScore = Math.max(d.endless.bestScore, reward.score);
      d.endless.bestBanked = Math.max(d.endless.bestBanked, s.banked);
    } else if (sum.mode === 'daily' && sum.dailyKey) {
      d.daily.best[sum.dailyKey] = Math.max(d.daily.best[sum.dailyKey] ?? 0, reward.score);
      const keys = Object.keys(d.daily.best).sort();
      while (keys.length > 21) delete d.daily.best[keys.shift()!];
      if (reward.dailyBonus) d.daily.lastClaimKey = sum.dailyKey;
    }
    // trial countdown
    if (d.trial.paint && d.trial.runsLeft > 0) {
      d.trial.runsLeft--;
      if (d.trial.runsLeft <= 0) d.trial = { paint: null, runsLeft: 0 };
    }
    // contracts + achievements add their own lines
    this.progressContracts(sum, reward);
    this.checkAchievements(sum, reward);
    reward.total = reward.lines.reduce((a, l) => a + (l.amount > 0 ? l.amount : 0), 0);
    d.coins = Math.min(1e9, d.coins + reward.total);
    d.lifetimeCoins += reward.total;
    d.settledRuns.push(sum.runId);
    if (d.settledRuns.length > 40) d.settledRuns.splice(0, d.settledRuns.length - 40);
    this.settled.set(sum.runId, reward);
    this.commit('settle');
    return reward;
  }

  // ------------------------------------------------------------------ contracts
  ensureContracts(): void {
    const c = this.data.contracts;
    while (c.active.length < 3) c.active.push(this.newContract());
  }

  private newContract(): Contract {
    const c = this.data.contracts;
    const rng = new Rng(`contract-${c.serial}-${this.data.createdAt}`);
    const activeKinds = new Set(c.active.map((x) => x.kind));
    const pool = CONTRACT_TEMPLATES.filter((t) => !activeKinds.has(t.kind));
    const t = rng.pick(pool.length ? pool : CONTRACT_TEMPLATES);
    const n = rng.pick(t.amounts);
    const extra = t.kind === 'deliverType' ? rng.pick(CONTRACT_TYPE_POOL) : undefined;
    c.serial++;
    return { id: `c${c.serial}`, kind: t.kind, n, extra, progress: 0, reward: t.reward(n) };
  }

  contractLabel(ct: Contract): string {
    const t = CONTRACT_TEMPLATES.find((x) => x.kind === ct.kind)!;
    return t.label(ct.n, ct.extra ? CARGO[ct.extra].name : undefined);
  }

  private progressContracts(sum: RunSummary, reward: Reward): void {
    const s = sum.stats;
    const finished = sum.outcome === 'finished';
    const c = this.data.contracts;
    for (let i = 0; i < c.active.length; i++) {
      const ct = c.active[i];
      let value = 0;
      switch (ct.kind) {
        case 'fragileIntact': value = ct.progress + (finished || sum.mode !== 'campaign' ? s.fragileIntact : 0); break;
        case 'noShedLevel': value = sum.mode === 'campaign' && finished && s.sheds === 0 ? 1 : 0; break;
        case 'bankEndless': value = sum.mode === 'endless' ? s.banked : 0; break;
        case 'coinsRun': value = s.coins; break;
        case 'itemsDelivered': value = finished || sum.mode !== 'campaign' ? s.delivered.length : 0; break;
        case 'nearMisses': value = s.nearMisses; break;
        case 'deliverType': value = ct.progress + (finished || sum.mode !== 'campaign' ? s.delivered.filter((d) => d.cargo === ct.extra).length : 0); break;
        case 'jumps': value = s.landings; break;
      }
      const cumulative = ct.kind === 'fragileIntact' || ct.kind === 'deliverType';
      ct.progress = cumulative ? value : Math.max(ct.progress, value);
      if (ct.progress >= ct.n) {
        reward.lines.push({ label: `Contract: ${this.contractLabel(ct)}`, amount: ct.reward, kind: 'contract' });
        reward.contracts.push(this.contractLabel(ct));
        c.completed++;
        c.active[i] = this.newContract();
      }
    }
  }

  // ------------------------------------------------------------------ achievements
  private unlock(id: string, reward: Reward): void {
    if (this.data.achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.data.achievements.push(id);
    reward.achievements.push(a.name);
    reward.lines.push({ label: `Achievement: ${a.name}`, amount: a.reward, kind: 'achievement' });
  }

  private checkFleet(): void {
    // Fleet achievement is granted at the next settlement (keeps all coin grants on one path).
  }

  private checkAchievements(sum: RunSummary, reward: Reward): void {
    const d = this.data;
    const s = sum.stats;
    if (d.stats.deliveredItems > 0 || (sum.outcome === 'finished' && sum.mode !== 'endless')) this.unlock('first_delivery', reward);
    if (s.maxItemsColumn >= 8) this.unlock('tall_order', reward);
    if (s.maxStackHeight >= 5) this.unlock('skyscraper', reward);
    if (d.stats.recoveries >= 5) this.unlock('saved_it', reward);
    if (s.heroSheds > 0) this.unlock('hero_shed', reward);
    if (d.stats.cakesIntact >= 10) this.unlock('cake_boss', reward);
    const worldDone = (w: number) => LEVELS.filter((l) => l.world === w).every((l) => d.campaign.levels[l.id]?.done);
    if (worldDone(1)) this.unlock('world1', reward);
    if (worldDone(2)) this.unlock('world2', reward);
    if (worldDone(3)) this.unlock('world3', reward);
    if (LEVELS.filter((l) => l.world === 1).every((l) => d.campaign.levels[l.id]?.medals.every(Boolean))) this.unlock('all_gold_w1', reward);
    if (sum.mode === 'endless' && sum.distance >= 3000) this.unlock('long_hauler', reward);
    if (sum.mode === 'endless' && s.banked >= 500) this.unlock('banker', reward);
    if (sum.mode === 'daily' && sum.outcome === 'finished') this.unlock('daily_driver', reward);
    if (CARGO_IDS.every((c) => d.album.includes(c))) this.unlock('collector', reward);
    if (VEHICLE_IDS.every((v) => d.garage.owned.includes(v))) this.unlock('fleet', reward);
    if (s.nearMisses >= 15) this.unlock('maestro', reward);
  }
}
