import { describe, expect, it } from 'vitest';
import { CARGO } from '../../src/data/cargo';
import { CHUNKS, CHUNK_BY_ID, chunkLength } from '../../src/data/chunks';
import { LEVELS } from '../../src/data/levels';
import { VEHICLE_IDS } from '../../src/data/vehicles';
import { buildLevel, evaluateMedals, levelSpeedAt } from '../../src/modes/campaign';
import { reachVehicleFrom, validateRange } from '../../src/modes/reach';
import { Autopilot } from '../../src/sim/autopilot';
import { RunSession } from '../../src/sim/run';
import { handling } from './helpers';

describe('chunk library', () => {
  it('every chunk enters and exits at the standard width and has sane items', () => {
    for (const c of CHUNKS) {
      const first = c.segs[0];
      const last = c.segs[c.segs.length - 1];
      expect(first.w ?? 4.5, c.id).toBeCloseTo(4.5);
      expect(last.w1 ?? last.w ?? 4.5, c.id).toBeCloseTo(4.5);
      const len = chunkLength(c);
      for (const it of c.items) {
        expect(it.s, `${c.id} item inside chunk`).toBeLessThanOrEqual(len);
        expect(it.len ?? 0, `${c.id} feature length cap`).toBeLessThanOrEqual(100);
        if (it.k === 'hook') expect(it.h!, `${c.id} hook clears every cab`).toBeGreaterThan(2.3);
      }
    }
  });
});

describe('campaign levels', () => {
  it('has 30 levels, 10 per world, with known chunks and cargo', () => {
    expect(LEVELS.length).toBe(30);
    for (const w of [1, 2, 3]) expect(LEVELS.filter((l) => l.world === w).length).toBe(10);
    for (const l of LEVELS) {
      for (const ref of l.seq) expect(CHUNK_BY_ID[ref.replace('~', '')], `${l.id}:${ref}`).toBeTruthy();
      for (const c of l.cargo) expect(CARGO[c], `${l.id}:${c}`).toBeTruthy();
    }
  });

  it('levels take 60–90 s at their speed (the tutorial is deliberately shorter)', () => {
    for (const l of LEVELS) {
      const b = buildLevel(l);
      const v = (l.speed[0] + l.speed[1]) / 2;
      const t = b.finishS! / v;
      if (l.tutorial) expect(t).toBeGreaterThan(25);
      else {
        expect(t, l.id).toBeGreaterThanOrEqual(60);
        expect(t, l.id).toBeLessThanOrEqual(90);
      }
    }
  });

  it('delivery targets are at most ~60% of the best 8 items on offer', () => {
    for (const l of LEVELS) {
      const vals = buildLevel(l).track.features.filter((f) => f.kind === 'pickup' && f.cargo !== 'gnome').map((f) => CARGO[f.cargo!].value).sort((a, b) => b - a);
      const top8 = vals.slice(0, 8).reduce((a, v) => a + v, 0);
      expect(l.objectives.target / top8, l.id).toBeLessThanOrEqual(0.62);
    }
  });

  it('every level has a crash-free route for every truck across its speed range', () => {
    for (const l of LEVELS) {
      const b = buildLevel(l);
      for (const v of VEHICLE_IDS) {
        const h = handling(v);
        const res = validateRange(b.track, 0, b.finishS! + 20, reachVehicleFrom(h), { vMin: l.speed[0] * 0.84, vMax: l.speed[1] });
        expect(res.ok, `${l.id} with ${v} blocked at s=${res.failS}`).toBe(true);
      }
    }
  });

  it('the scripted driver completes all 30 levels with the starter truck', () => {
    const failures: string[] = [];
    for (const l of LEVELS) {
      const b = buildLevel(l);
      const run = new RunSession({ mode: 'campaign', track: b.track, handling: handling('pickup'), seed: 1, speedAt: levelSpeedAt(l, b.finishS!), finishS: b.finishS, windScale: l.wind ?? 1, wet: l.wet });
      const ap = new Autopilot({ greed: 0.8 });
      while (run.state === 'running' && run.t < 200) run.step(1 / 120, ap.input(run, 1 / 120));
      if (run.state !== 'finished') failures.push(`${l.id}:${run.crashReason}`);
      else {
        const m = evaluateMedals(l, run.stats, true);
        expect(m.deliveredValue, l.id).toBeGreaterThan(0);
      }
    }
    // The bot is a deliberately naive driver, but every level must still be completable by it.
    expect(failures, failures.join(',')).toEqual([]);
  }, 120000);
});
