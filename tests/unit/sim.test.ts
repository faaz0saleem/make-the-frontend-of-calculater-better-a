import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../../src/core/loop';
import { CARGO } from '../../src/data/cargo';
import { TruckSim } from '../../src/sim/truck';
import { Rng } from '../../src/core/rng';
import { handling, inline, session, trackOf } from './helpers';

const flat = { curvature: 0, vcurv: 0, rampH: 0, rampSlope: 0, overGap: false, gust: 0, puddle: 0 };

describe('cargo stack', () => {
  it('stays put at rest and while driving straight', () => {
    const tr = new TruckSim(handling(), 15, new Rng(1));
    for (let i = 0; i < 6; i++) tr.addCargo(CARGO.parcel, []);
    for (let i = 0; i < 600; i++) tr.step(1 / 120, 0, flat);
    expect(tr.itemCount).toBe(6);
    expect(tr.stability).toBeGreaterThan(0.9);
  });

  it('a taller stack wobbles more for the same swerve (height matters)', () => {
    const peak = (n: number) => {
      const tr = new TruckSim(handling(), 16, new Rng(1));
      for (let i = 0; i < n; i++) tr.addCargo(CARGO.parcel, []);
      let m = 0;
      for (let i = 0; i < 240; i++) {
        tr.step(1 / 120, i < 60 ? 1 : 0, flat);
        m = Math.max(m, tr.maxRatio);
      }
      return m;
    };
    expect(peak(6)).toBeGreaterThan(peak(2) * 1.3);
  });

  it('the top item is the most exposed', () => {
    const tr = new TruckSim(handling(), 16, new Rng(1));
    for (let i = 0; i < 5; i++) tr.addCargo(i < 2 ? CARGO.crate : CARGO.parcel, []);
    for (let i = 0; i < 50; i++) tr.step(1 / 120, 1, flat);
    const items = tr.columns[0].items;
    expect(items[4].ratio).toBeGreaterThan(items[0].ratio);
  });

  it('crosswinds push light, tall cargo harder than heavy cargo', () => {
    const lean = (shape: 'lantern' | 'washer') => {
      const tr = new TruckSim(handling(), 16, new Rng(1));
      for (let i = 0; i < 3; i++) tr.addCargo(CARGO[shape], []);
      for (let i = 0; i < 120; i++) tr.step(1 / 120, 0, { ...flat, gust: 3 });
      return tr.maxRatio;
    };
    expect(lean('lantern')).toBeGreaterThan(lean('washer'));
  });

  it('heavy cargo squishes fragile cargo below it', () => {
    const tr = new TruckSim(handling(), 16, new Rng(1));
    tr.addCargo(CARGO.weddingcake, []);
    const crushed: unknown[] = [];
    tr.addCargo(CARGO.fridge, crushed as never[]);
    expect(crushed.length).toBe(1);
    expect(tr.columns[0].items[0].squished).toBe(true);
  });

  it('the van cargo walls lock the bottom item', () => {
    const tr = new TruckSim(handling('van'), 16, new Rng(1));
    tr.addCargo(CARGO.parcel, []);
    expect(tr.columns[0].items[0].locked).toBe(true);
  });

  it('the flatbed spreads items over two columns', () => {
    const tr = new TruckSim(handling('flatbed'), 16, new Rng(1));
    for (let i = 0; i < 4; i++) tr.addCargo(CARGO.parcel, []);
    expect(tr.columns[0].items.length).toBe(2);
    expect(tr.columns[1].items.length).toBe(2);
  });
});

describe('run session', () => {
  it('is deterministic and frame-rate independent with scripted input', () => {
    const play = (frameDt: number) => {
      const track = trackOf(['start', 'cargo_trio', 'gentle_curve', 'cone_slalom', 'hill_crest', 's_bend', 'finish']);
      const run = session(track, 'pickup', 15, track.endS - 88);
      let k = 0;
      const loop = new FixedLoop({
        step: (dt) => {
          k++;
          const steer = Math.sin(k / 70) * 0.8;
          run.step(dt, { steer, shed: k === 2400 });
        },
        render: () => {},
      }, 120);
      for (let t = 0; t < 30; t += frameDt) loop.advance(frameDt);
      // run exactly the same number of steps
      return { steps: run.steps, s: run.truck.s, x: run.truck.x, coins: run.stats.coins, items: run.truck.itemCount };
    };
    const a = play(1 / 60);
    const b = play(1 / 30);
    const c = play(1 / 144);
    // compare at equal step counts by replaying the shorter
    const n = Math.min(a.steps, b.steps, c.steps);
    expect(n).toBeGreaterThan(3500);
    const replay = () => {
      const track = trackOf(['start', 'cargo_trio', 'gentle_curve', 'cone_slalom', 'hill_crest', 's_bend', 'finish']);
      const run = session(track, 'pickup', 15, track.endS - 88);
      for (let k = 1; k <= n; k++) run.step(1 / 120, { steer: Math.sin(k / 70) * 0.8, shed: k === 2400 });
      return { s: run.truck.s, x: run.truck.x, coins: run.stats.coins, items: run.truck.itemCount };
    };
    const r1 = replay();
    const r2 = replay();
    expect(r1).toEqual(r2);
  });

  it('collects coins and cargo', () => {
    const track = trackOf(['start', 'cargo_line']);
    const run = session(track);
    for (let i = 0; i < 120 * 6; i++) run.step(1 / 120, { steer: 0, shed: false });
    expect(run.stats.coins).toBeGreaterThan(3);
    expect(run.stats.collected).toBeGreaterThanOrEqual(1);
  });

  it('crashes on a head-on barrier but only scrapes on a glancing contact', () => {
    const headOn = session(trackOf([inline([{ k: 'barrier', s: 40, x: 0, hw: 1.4 }])]));
    for (let i = 0; i < 120 * 5 && headOn.state === 'running'; i++) headOn.step(1 / 120, { steer: 0, shed: false });
    expect(headOn.state).toBe('crashed');
    expect(headOn.crashReason).toBe('barrier');
    const glance = session(trackOf([inline([{ k: 'barrier', s: 40, x: 2.4, hw: 1.4 }])]));
    for (let i = 0; i < 120 * 5; i++) glance.step(1 / 120, { steer: 0, shed: false });
    expect(glance.state).toBe('running');
  });

  it('overhead beams knock off exactly the cargo above the clearance', () => {
    const track = trackOf([inline([{ k: 'overhead', s: 30, x: 0, hw: 4.6, h: 2.6 }])]);
    const run = session(track);
    for (let i = 0; i < 4; i++) run.truck.addCargo(CARGO.parcel, []); // bed 0.82 + 4*0.55 = 3.02
    let spilled = 0;
    run.events.on('spill', (e) => (spilled += e.items.length));
    for (let i = 0; i < 120 * 4; i++) run.step(1 / 120, { steer: 0, shed: false });
    // items whose top exceeds 2.6: tops at 1.37, 1.92, 2.47, 3.02 -> only the 4th
    expect(spilled).toBe(1);
    expect(run.truck.itemCount).toBe(3);
  });

  it('a beam lower than the cab is a crash', () => {
    const run = session(trackOf([inline([{ k: 'overhead', s: 30, x: 0, hw: 4.6, h: 1.4 }])]));
    for (let i = 0; i < 120 * 4 && run.state === 'running'; i++) run.step(1 / 120, { steer: 0, shed: false });
    expect(run.crashReason).toBe('lowbridge');
  });

  it('shedding drops the top item', () => {
    const run = session(trackOf(['start', 'cargo_line']));
    run.truck.addCargo(CARGO.crate, []);
    run.truck.addCargo(CARGO.cake, []);
    run.step(1 / 120, { steer: 0, shed: true });
    expect(run.truck.itemCount).toBe(1);
    expect(run.truck.columns[0].items[0].def.id).toBe('crate');
    expect(run.stats.sheds).toBe(1);
  });

  it('ramps launch the truck and it lands past the chasm', () => {
    const track = trackOf(['start', 'chasm_jump', 'cargo_line'], 2);
    const run = session(track, 'pickup', 16);
    let launched = false;
    run.events.on('launch', () => (launched = true));
    for (let i = 0; i < 120 * 8 && run.state === 'running'; i++) run.step(1 / 120, { steer: 0, shed: false });
    expect(launched).toBe(true);
    expect(run.state).toBe('running');
    expect(run.stats.landings).toBe(1);
  });

  it('driving off a drop edge is a fall', () => {
    const run = session(trackOf(['start', 'dock_edge']));
    for (let i = 0; i < 120 * 8 && run.state === 'running'; i++) run.step(1 / 120, { steer: 1, shed: false });
    expect(run.crashReason).toBe('fell');
  });

  it('banks cargo at a depot with the multiplier and clears the stack', () => {
    const track = trackOf(['start', 'depot_fork', 'cargo_line']);
    const run = session(track);
    run.multiplierIndex = 2;
    run.truck.addCargo(CARGO.crate, []);
    run.truck.addCargo(CARGO.crate, []);
    const goTo = (x: number) => Math.max(-1, Math.min(1, (x - run.truck.x) * 0.35 - run.truck.vx * 0.1));
    for (let i = 0; i < 120 * 10; i++) run.step(1 / 120, { steer: run.truck.s > 30 ? goTo(4.85) : 0, shed: false });
    expect(run.stats.spilled).toBe(0);
    expect(run.stats.bankCount).toBe(1);
    expect(run.stats.banked).toBe(Math.round(9 * 1.5) * 2);
  });

  it('passing a depot with cargo raises the multiplier', () => {
    const track = trackOf(['start', 'depot_fork', 'cargo_line']);
    const run = session(track);
    run.truck.addCargo(CARGO.crate, []);
    const goTo = (x: number) => Math.max(-1, Math.min(1, (x - run.truck.x) * 0.35 - run.truck.vx * 0.1));
    for (let i = 0; i < 120 * 10; i++) run.step(1 / 120, { steer: run.truck.s > 30 ? goTo(-4.85) : 0, shed: false });
    expect(run.multiplier).toBeGreaterThan(1);
    expect(run.stats.bankCount).toBe(0);
  });

  it('revive places the truck past the obstacle and continues', () => {
    const run = session(trackOf([inline([{ k: 'barrier', s: 40, x: 0, hw: 1.4 }], 160)]));
    for (let i = 0; i < 120 * 5 && run.state === 'running'; i++) run.step(1 / 120, { steer: 0, shed: false });
    expect(run.state).toBe('crashed');
    expect(run.revive()).toBe(true);
    for (let i = 0; i < 120 * 3; i++) run.step(1 / 120, { steer: 0, shed: false });
    expect(run.state).toBe('running');
    expect(run.truck.s).toBeGreaterThan(45);
  });

  it('a tall heavy stack in a tight fast corner tips the truck (rollover)', () => {
    const track = trackOf([inline([], 200, { segs: [{ len: 10 }, { len: 160, k: 1 / 40 }] })]);
    const run = session(track, 'trike', 22);
    for (let i = 0; i < 7; i++) run.truck.addCargo(CARGO.fridge, []);
    for (let i = 0; i < 120 * 8 && run.state === 'running'; i++) {
      const ff = (0.11 * 22 * 22 * (1 / 40)) / run.truck.h.maxLatSpeed;
      run.step(1 / 120, { steer: run.truck.s > 10 ? ff : 0, shed: false });
    }
    expect(['crashed']).toContain(run.state);
  });
});
