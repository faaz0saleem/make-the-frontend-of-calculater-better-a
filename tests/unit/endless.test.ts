import { describe, expect, it } from 'vitest';
import { CHUNK_BY_ID } from '../../src/data/chunks';
import { ECONOMY } from '../../src/data/economy';
import { ENDLESS_ENVELOPE, EndlessRoute } from '../../src/modes/endless';
import { reachVehicleFrom, validateRange } from '../../src/modes/reach';
import { dailySpec } from '../../src/modes/daily';
import { RunSession } from '../../src/sim/run';
import { Autopilot } from '../../src/sim/autopilot';
import { handling } from './helpers';

/** Generates a route of `dist` metres by advancing a virtual truck (with recycling + rebasing). */
function drive(seed: number, veh: 'pickup' | 'flatbed' | 'trike' | 'van' | 'offroad', dist: number) {
  const h = handling(veh);
  const route = new EndlessRoute({ seed, handling: h, startWorld: 1 });
  let s = 0;
  let maxFeat = 0;
  let maxSegs = 0;
  let abs = 0;
  while (abs < dist) {
    s += 10;
    abs += 10;
    const { rebased } = route.update(s);
    s -= rebased;
    maxFeat = Math.max(maxFeat, route.track.features.length);
    maxSegs = Math.max(maxSegs, route.track.segments.length);
  }
  return { route, maxFeat, maxSegs, s };
}

describe('endless generator', () => {
  it('stays inside the explicit speed envelope', () => {
    const r = new EndlessRoute({ seed: 1, handling: handling(), startWorld: 1 });
    expect(r.speedAt(0)).toBeCloseTo(ENDLESS_ENVELOPE.speedStart);
    expect(r.speedAt(1e7)).toBeCloseTo(ENDLESS_ENVELOPE.speedMax);
    for (let d = 0; d < 20000; d += 250) expect(r.speedAt(d)).toBeLessThanOrEqual(ENDLESS_ENVELOPE.speedMax + 1e-9);
  });

  it('every generated sequence keeps a crash-free route (many seeds, max difficulty, slowest & widest trucks)', () => {
    for (const veh of ['flatbed', 'pickup', 'trike'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const h = handling(veh);
        const route = new EndlessRoute({ seed: seed * 7919, handling: h, startWorld: ((seed % 3) + 1) as 1 | 2 | 3 });
        // generate well past the difficulty ramp without recycling, then validate the whole window
        for (let d = 500; d <= ENDLESS_ENVELOPE.diffRampDist + 1200; d += 500) route.ensure(d);
        const t = route.track;
        const res = validateRange(t, 0, t.endS - 15, reachVehicleFrom(h), { vMin: ENDLESS_ENVELOPE.speedStart * 0.84, vMax: ENDLESS_ENVELOPE.speedMax });
        expect(res.ok, `${veh} seed ${seed} blocked at ${res.failS}`).toBe(true);
      }
    }
  }, 120000);

  it('avoids immediate repetition and inserts depots on schedule', () => {
    const route = new EndlessRoute({ seed: 99, handling: handling(), startWorld: 1 });
    for (let d = 500; d <= 6000; d += 500) route.ensure(d);
    const ids = route.placed.map((p) => p.id);
    for (let i = 1; i < ids.length; i++) if (ids[i] !== 'depot_fork' && ids[i] !== 'cargo_line') expect(ids[i], `repeat at ${i}`).not.toBe(ids[i - 1]);
    const depots = route.placed.filter((p) => p.id === 'depot_fork').map((p) => p.s0);
    expect(depots.length).toBeGreaterThan(5);
    for (let i = 1; i < depots.length; i++) {
      const gap = depots[i] - depots[i - 1];
      expect(gap).toBeGreaterThan(ECONOMY.endlessDepotEvery[0] * 0.9);
      expect(gap).toBeLessThan(ECONOMY.endlessDepotEvery[1] + 250);
    }
  });

  it('recycles track and rebases s over a 30 km drive with bounded memory', () => {
    const { route, maxFeat, maxSegs, s } = drive(4242, 'pickup', 30000);
    expect(route.track.sOffset).toBeGreaterThan(20000);
    expect(s).toBeLessThan(ENDLESS_ENVELOPE.rebaseAt + 20);
    expect(maxFeat).toBeLessThan(260);
    expect(maxSegs).toBeLessThan(60);
    expect(route.placed.length).toBeLessThan(16);
  });

  it('a scripted 20-minute Long Haul run stays bounded and keeps simulating', () => {
    const h = handling('van');
    const route = new EndlessRoute({ seed: 2024, handling: h, startWorld: 1 });
    const run = new RunSession({ mode: 'endless', track: route.track, handling: h, seed: 2024, speedAt: route.speedAt, finishS: null });
    const ap = new Autopilot({ greed: 0.5 });
    let maxFeat = 0;
    let revives = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 60 * 20; i++) {
      run.step(dt, ap.input(run, dt));
      const { rebased } = route.update(run.truck.s);
      if (rebased) run.truck.s -= rebased;
      if (run.state === 'crashed') {
        // keep the soak going: use the revive path (the test is about resource bounds)
        run.revive();
        revives++;
      }
      if (i % 600 === 0) maxFeat = Math.max(maxFeat, route.track.features.length);
    }
    expect(run.distance).toBeGreaterThan(20000);
    expect(maxFeat).toBeLessThan(260);
    expect(route.track.segments.length).toBeLessThan(60);
    expect(run.events.listenerCount()).toBe(0);
    expect(revives).toBeLessThan(200);
  }, 300000);

  it('daily routes are deterministic for a date and differ between dates', () => {
    const a = dailySpec('2026-10-11');
    const b = dailySpec('2026-10-11');
    const c = dailySpec('2026-10-12');
    expect(a).toEqual(b);
    expect(a.seed).not.toBe(c.seed);
    const ra = new EndlessRoute({ seed: a.seed, handling: handling(a.vehicle), startWorld: a.world, fixedWorld: true, finishDist: a.distance });
    const rb = new EndlessRoute({ seed: a.seed, handling: handling(a.vehicle), startWorld: a.world, fixedWorld: true, finishDist: a.distance });
    ra.ensure(5000);
    rb.ensure(5000);
    expect(ra.placed.map((p) => p.id)).toEqual(rb.placed.map((p) => p.id));
    expect(ra.finishS).not.toBeNull();
    expect(ra.placed[ra.placed.length - 1].id).toBe('finish');
    expect(CHUNK_BY_ID.finish).toBeTruthy();
  });
});
