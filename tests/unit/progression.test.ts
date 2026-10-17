import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../../src/data/economy';
import { PAINTS } from '../../src/data/cosmetics';
import { UPGRADES, applyUpgrades } from '../../src/data/upgrades';
import { VEHICLES } from '../../src/data/vehicles';
import type { RunStats } from '../../src/sim/run';
import type { RunSummary } from '../../src/progression/rewards';
import { SAVE_MAX_BYTES, byteSize, defaultSave, parseSave, serialize } from '../../src/progression/save';
import { MemoryStorage } from '../../src/progression/storage';
import { ProgressStore } from '../../src/progression/store';

const stats = (o: Partial<RunStats> = {}): RunStats => ({
  coins: 0, nearMisses: 0, recoveries: 0, cleanLandings: 0, jumps: 0, heroSheds: 0, sheds: 0, spilled: 0, spilledValue: 0,
  collected: 0, collectedValue: 0, closeShaves: 0, landings: 0, maxItems: 0, scrapes: 0, maxItemsColumn: 0, maxStackHeight: 0,
  gates: {}, delivered: [], banked: 0, bankCount: 0, bestMultiplier: 1, fragileIntact: 0, cakesIntact: 0, discovered: [], timeDriven: 0, ...o,
});
const sum = (o: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'r1', mode: 'campaign', levelId: 'h2', outcome: 'finished', stats: stats({ coins: 20, delivered: [{ cargo: 'cake', base: 14, cond: 1, value: 14, squished: false }] }),
  distance: 1000, forfeited: 0, lostCargo: 0, usedToken: false, vehicle: 'pickup', ...o,
});

async function store(coins = 0, raw: string | null = null) {
  const mem = new MemoryStorage(raw);
  const s = new ProgressStore(mem, () => 1_000);
  await s.init();
  s.data.coins = coins;
  return { s, mem };
}

describe('shop transactions', () => {
  it('rejects purchases without enough coins and never goes negative', async () => {
    const { s } = await store(100);
    expect(s.buyVehicle('van')).toEqual({ ok: false, reason: 'insufficient' });
    expect(s.coins).toBe(100);
    expect(s.owns('vehicle', 'van')).toBe(false);
  });

  it('buys once; repeated clicks cannot deduct twice', async () => {
    const { s, mem } = await store(5000);
    const r1 = s.buyVehicle('van');
    const r2 = s.buyVehicle('van');
    expect(r1.ok).toBe(true);
    expect(r2).toEqual({ ok: false, reason: 'owned' });
    expect(s.coins).toBe(5000 - VEHICLES.van.price);
    await s.flush();
    expect(JSON.parse(mem.raw!).coins).toBe(5000 - VEHICLES.van.price);
  });

  it('upgrades require the expected tier (stale double-click is rejected) and cap at tier 5', async () => {
    const { s } = await store(1e6);
    expect(s.buyUpgrade('grip', 0).ok).toBe(true);
    expect(s.buyUpgrade('grip', 0)).toEqual({ ok: false, reason: 'stale' });
    for (let t = 1; t < 5; t++) expect(s.buyUpgrade('grip', t).ok).toBe(true);
    expect(s.buyUpgrade('grip', 5)).toEqual({ ok: false, reason: 'maxed' });
    const spent = UPGRADES.grip.costs.reduce((a, c) => a + c, 0);
    expect(s.coins).toBe(1e6 - spent);
  });

  it('rejects unknown items and equipping things you do not own', async () => {
    const { s } = await store(1e6);
    expect(s.buyPaint('nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(s.equipVehicle('trike')).toEqual({ ok: false, reason: 'notOwned' });
    expect(s.equipPaint('gold')).toEqual({ ok: false, reason: 'notOwned' });
  });

  it('spare tires: max 3, stale-guarded, never usable in the Daily Contract', async () => {
    const { s } = await store(1e4);
    for (let i = 0; i < 3; i++) expect(s.buyToken(i).ok).toBe(true);
    expect(s.buyToken(3)).toEqual({ ok: false, reason: 'maxed' });
    expect(s.useToken('daily')).toBe(false);
    expect(s.useToken('campaign')).toBe(true);
    expect(s.data.tokens).toBe(2);
    expect(s.coins).toBe(1e4 - 3 * ECONOMY.spareTirePrice);
  });

  it('one accessory per slot; cosmetics never change handling', async () => {
    const { s } = await store(1e5);
    expect(s.buyAccessory('beacon').ok).toBe(true);
    expect(s.buyAccessory('horns').ok).toBe(true); // same roof slot
    expect(s.data.garage.equippedAcc).toEqual(['horns']);
    // handling is a pure function of base stats + upgrade tiers; no cosmetic inputs exist
    expect(applyUpgrades.length).toBe(2);
    const before = applyUpgrades(VEHICLES.pickup.stats, s.data.upgrades);
    s.buyPaint(PAINTS[5].id);
    expect(applyUpgrades(VEHICLES.pickup.stats, s.data.upgrades)).toEqual(before);
  });

  it('the first meaningful purchase is reachable after 2–3 ordinary runs', () => {
    const cheapest = Math.min(...PAINTS.filter((p) => p.price > 0).map((p) => p.price), UPGRADES.suspension.costs[0], ECONOMY.spareTirePrice * 2);
    // An ordinary early run (tutorial / Harbor 2) pays ~120–220 coins (see ECONOMY.md / QA_REPORT.md).
    expect(cheapest).toBeGreaterThanOrEqual(250);
    expect(cheapest).toBeLessThanOrEqual(3 * 150);
  });
});

describe('reward settlement', () => {
  it('applies exactly once per runId, even if the result screen is re-entered', async () => {
    const { s } = await store(0);
    const a = s.settleRun(sum());
    const coins = s.coins;
    const b = s.settleRun(sum());
    expect(b).toBe(a);
    expect(s.coins).toBe(coins);
    expect(coins).toBe(a.total);
    expect(a.total).toBeGreaterThan(0);
  });

  it('does not pay again after a reload for an already-settled run', async () => {
    const { s, mem } = await store(0);
    s.settleRun(sum());
    await s.flush();
    const s2 = new ProgressStore(mem, () => 2_000);
    await s2.init();
    const coins = s2.coins;
    const r = s2.settleRun(sum());
    expect(r.total).toBe(0);
    expect(s2.coins).toBe(coins);
  });

  it('crashes forfeit unbanked cargo but keep banked coins and road coins', async () => {
    const { s } = await store(0);
    const r = s.settleRun(sum({ runId: 'e1', mode: 'endless', levelId: undefined, outcome: 'crashed', forfeited: 120, stats: stats({ banked: 300, bankCount: 2, coins: 15 }) }));
    expect(r.lines.find((l) => l.kind === 'loss')?.amount).toBe(-120);
    expect(r.total).toBeGreaterThanOrEqual(300 + 15);
    expect(s.data.endless.bestBanked).toBe(300);
  });

  it('campaign medals are kept (never lost) and first-medal bonus is paid once', async () => {
    const { s } = await store(0);
    const good = sum({ runId: 'm1', stats: stats({ coins: 30, collectedValue: 28, fragileIntact: 2, delivered: [{ cargo: 'cake', base: 14, cond: 1, value: 14, squished: false }, { cargo: 'cake', base: 14, cond: 1, value: 14, squished: false }, { cargo: 'crate', base: 9, cond: 1, value: 50, squished: false }] }) });
    const r1 = s.settleRun(good);
    expect(r1.newMedals.filter(Boolean).length).toBeGreaterThan(0);
    const r2 = s.settleRun({ ...good, runId: 'm2' });
    expect(r2.newMedals.some(Boolean)).toBe(false);
    s.settleRun(sum({ runId: 'm3', outcome: 'crashed', stats: stats() }));
    expect(s.data.campaign.levels.h2.medals.some(Boolean)).toBe(true);
    expect(s.levelUnlocked('h3')).toBe(true);
  });

  it('a crashed first attempt does not unlock the next level', async () => {
    const { s } = await store(0);
    s.settleRun(sum({ runId: 'c1', levelId: 'h1', outcome: 'crashed', stats: stats({ coins: 5 }) }));
    expect(s.levelUnlocked('h2')).toBe(false);
  });
});

describe('daily contract claims', () => {
  it('pays the completion bonus once per UTC date, survives reloads, and rejects clock rollback', async () => {
    const { s, mem } = await store(0);
    const d = (id: string, key: string, outcome: 'finished' | 'crashed' = 'finished') => sum({ runId: id, mode: 'daily', levelId: undefined, dailyKey: key, outcome, stats: stats({ banked: 50 }) });
    expect(s.settleRun(d('d1', '2026-10-11')).dailyBonus).toBe(true);
    expect(s.settleRun(d('d2', '2026-10-11')).dailyBonus).toBe(false); // replay same day
    await s.flush();
    const s2 = new ProgressStore(mem, () => 3_000);
    await s2.init();
    expect(s2.settleRun(d('d3', '2026-10-11')).dailyBonus).toBe(false); // after reload
    expect(s2.settleRun(d('d4', '2026-10-10')).dailyBonus).toBe(false); // clock moved back
    expect(s2.settleRun(d('d5', '2026-10-12', 'crashed')).dailyBonus).toBe(false); // not completed
    expect(s2.settleRun(d('d6', '2026-10-12')).dailyBonus).toBe(true); // next day
    expect(s2.data.daily.best['2026-10-11']).toBeGreaterThan(0);
  });
});

describe('save data', () => {
  it('round-trips defaults and stays far below the 1 MB Data-module limit', () => {
    const d = defaultSave(1);
    const raw = serialize(d);
    const p = parseSave(raw, 1);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.data).toEqual(d);
    expect(byteSize(raw)).toBeLessThan(SAVE_MAX_BYTES / 50);
  });

  it('a fully progressed save is still tiny', async () => {
    const { LEVELS } = await import('../../src/data/levels');
    const { CARGO } = await import('../../src/data/cargo');
    const d = defaultSave(1);
    for (const l of LEVELS) d.campaign.levels[l.id] = { done: true, medals: [true, true, true], bestValue: 999, plays: 99 };
    for (let i = 0; i < 365; i++) d.daily.best[`2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}#${i}`] = 99999;
    d.album = Object.keys(CARGO) as typeof d.album;
    const bytes = byteSize(serialize(d));
    // a year of daily scores plus every level and album entry stays far below the 900 KB guard
    expect(bytes).toBeLessThan(20_000);
  });

  it('refuses to write a save above the size guard and keeps the stored copy', async () => {
    const mem = new MemoryStorage();
    const st = new ProgressStore(mem, () => 1);
    await st.init();
    await st.flush();
    const before = mem.raw;
    const savesBefore = mem.saves;
    for (let i = 0; i < 80_000; i++) st.data.daily.best[`k${i}`] = 1234567;
    await st.flush();
    expect(st.health).toBe('tooLarge');
    expect(mem.saves).toBe(savesBefore);
    expect(mem.raw).toBe(before);
  });

  it('migrates a v1 save without losing coins, trucks or medals', () => {
    const v1 = JSON.stringify({ version: 1, coins: 777, trucks: ['van', 'bogus'], truck: 'van', levels: { h1: 3, h2: 1, nope: 2 }, settings: { music: 0.2 } });
    const p = parseSave(v1, 5);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.migratedFrom).toBe(1);
    expect(p.data.coins).toBe(777);
    expect(p.data.garage.owned).toEqual(['pickup', 'van']);
    expect(p.data.garage.equipped).toBe('van');
    expect(p.data.campaign.levels.h1.medals).toEqual([true, true, true]);
    expect(p.data.campaign.levels.h2.medals).toEqual([true, false, false]);
    expect(p.data.campaign.levels.nope).toBeUndefined();
    expect(p.data.settings.music).toBe(0.2);
  });

  it('sanitises malformed values instead of trusting them', () => {
    const bad = JSON.stringify({ version: 2, coins: -50, tokens: 99, upgrades: { grip: 17, suspension: 'x' }, garage: { owned: ['trike'], equipped: 'van', paint: 'gold', paints: [] }, settings: { master: 7, quality: 'ultra' } });
    const p = parseSave(bad, 1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data.coins).toBe(0);
    expect(p.data.tokens).toBe(ECONOMY.spareTireMax);
    expect(p.data.upgrades).toEqual({ suspension: 0, grip: 5, supports: 0 });
    expect(p.data.garage.owned).toEqual(['pickup', 'trike']);
    expect(p.data.garage.equipped).toBe('pickup');
    expect(p.data.garage.paint).toBe('tomato');
    expect(p.data.settings.master).toBe(1);
    expect(p.data.settings.quality).toBe('auto');
  });

  it('corrupt JSON is backed up, then the store starts fresh and writable', async () => {
    const mem = new MemoryStorage('{not json');
    const s = new ProgressStore(mem, () => 1);
    await s.init();
    expect(mem.backups).toEqual(['{not json']);
    expect(s.writable).toBe(true);
    expect(s.loadInfo).toBe('corrupt-reset');
  });

  it('a failed initial read never overwrites the stored save (memory-only session)', async () => {
    const existing = serialize({ ...defaultSave(1), coins: 4321 });
    const mem = new MemoryStorage(existing);
    mem.failNextLoad = 'network down';
    const s = new ProgressStore(mem, () => 1);
    await s.init();
    expect(s.writable).toBe(false);
    expect(s.health).toBe('readFailed');
    s.data.coins = 1;
    s.settleRun(sum({ runId: 'x' }));
    await s.flush();
    expect(mem.raw).toBe(existing);
    expect(mem.saves).toBe(0);
  });

  it('a save written by a newer build is left untouched', async () => {
    const future = JSON.stringify({ version: 99, coins: 5 });
    const mem = new MemoryStorage(future);
    const s = new ProgressStore(mem, () => 1);
    await s.init();
    expect(s.writable).toBe(false);
    s.buyToken(0);
    await s.flush();
    expect(mem.raw).toBe(future);
  });

  it('account change reloads the other identity’s save instead of merging coins', async () => {
    const mem = new MemoryStorage(serialize({ ...defaultSave(1), coins: 100 }));
    const s = new ProgressStore(mem, () => 1);
    await s.init();
    expect(s.coins).toBe(100);
    // the platform now serves a different account's data
    mem.raw = serialize({ ...defaultSave(1), coins: 9000 });
    await s.reload();
    expect(s.coins).toBe(9000);
  });

  it('save failures are reported and retried on the next write', async () => {
    const { s, mem } = await store(500);
    mem.failSaves = true;
    s.buyToken(0);
    await s.flush();
    expect(s.health).toBe('writeFailed');
    mem.failSaves = false;
    s.buyToken(1);
    await s.flush();
    expect(s.health).toBe('ok');
    expect(JSON.parse(mem.raw!).tokens).toBe(2);
  });
});
