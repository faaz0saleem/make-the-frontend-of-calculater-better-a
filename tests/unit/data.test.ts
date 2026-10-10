import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/data/achievements';
import { CARGO, CARGO_IDS } from '../../src/data/cargo';
import { ACCESSORIES, PAINTS } from '../../src/data/cosmetics';
import { CONTRACT_TEMPLATES } from '../../src/data/contracts';
import { UPGRADES, UPGRADE_IDS, applyUpgrades, MAX_TIER } from '../../src/data/upgrades';
import { VEHICLES, VEHICLE_IDS, statBars } from '../../src/data/vehicles';

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe('content data', () => {
  it('has the required catalogue sizes with unique ids', () => {
    expect(VEHICLE_IDS.length).toBe(5);
    expect(PAINTS.length).toBeGreaterThanOrEqual(12);
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(6);
    expect(UPGRADE_IDS.length).toBe(3);
    expect(CARGO_IDS.length).toBeGreaterThanOrEqual(15);
    expect(CONTRACT_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(unique(PAINTS.map((p) => p.id))).toBe(true);
    expect(unique(ACCESSORIES.map((a) => a.id))).toBe(true);
    expect(unique(ACHIEVEMENTS.map((a) => a.id))).toBe(true);
  });

  it('prices are positive integers (starter items free) and upgrade costs rise each tier', () => {
    expect(VEHICLES.pickup.price).toBe(0);
    expect(PAINTS[0].price).toBe(0);
    for (const v of VEHICLE_IDS.filter((v) => v !== 'pickup')) expect(VEHICLES[v].price).toBeGreaterThan(0);
    for (const p of [...PAINTS.slice(1), ...ACCESSORIES]) expect(Number.isInteger(p.price) && p.price > 0).toBe(true);
    for (const u of UPGRADE_IDS) {
      const c = UPGRADES[u].costs;
      expect(c.length).toBe(MAX_TIER);
      for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    }
  });

  it('cargo physical values are in sane ranges', () => {
    for (const id of CARGO_IDS) {
      const c = CARGO[id];
      expect(c.mass).toBeGreaterThan(0);
      expect(c.height).toBeGreaterThan(0.3);
      expect(c.width).toBeLessThanOrEqual(1.1);
      expect(c.fragility).toBeGreaterThanOrEqual(0);
      expect(c.fragility).toBeLessThanOrEqual(1);
      expect(c.desc.length).toBeGreaterThan(10);
    }
  });

  it('each truck has a distinct strength profile; max upgrades stay modest', () => {
    const profiles = VEHICLE_IDS.map((v) => statBars(VEHICLES[v].stats).map((b) => b.value.toFixed(2)).join(','));
    expect(new Set(profiles).size).toBe(5);
    const base = VEHICLES.pickup.stats;
    const max = applyUpgrades(base, { suspension: 5, grip: 5, supports: 5 });
    expect(max.rollStiffness / base.rollStiffness).toBeLessThanOrEqual(1.31);
    expect(max.latAccel / base.latAccel).toBeLessThanOrEqual(1.26);
    expect(max.support / base.support).toBeLessThanOrEqual(1.31);
  });
});
