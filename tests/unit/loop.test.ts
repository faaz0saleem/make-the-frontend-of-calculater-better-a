import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../../src/core/loop';
import { PauseManager } from '../../src/core/pause';
import { StateMachine } from '../../src/core/fsm';

describe('FixedLoop', () => {
  const run = (frameDt: number, seconds: number) => {
    let steps = 0;
    let simT = 0;
    const loop = new FixedLoop({ step: (dt) => { steps++; simT += dt; }, render: () => {} }, 120);
    const frames = Math.round(seconds / frameDt);
    for (let i = 0; i < frames; i++) loop.advance(frameDt);
    return { steps, simT };
  };

  it('takes the same number of fixed steps at 30, 60 and 144 Hz', () => {
    const a = run(1 / 30, 10);
    const b = run(1 / 60, 10);
    const c = run(1 / 144, 10);
    expect(Math.abs(a.steps - b.steps)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.steps - c.steps)).toBeLessThanOrEqual(1);
    expect(b.simT).toBeCloseTo(10, 1);
  });

  it('bounds catch-up after a long stall instead of spiralling', () => {
    let steps = 0;
    const loop = new FixedLoop({ step: () => steps++, render: () => {} }, 120, 12);
    loop.advance(5); // 5 s hitch
    expect(steps).toBeLessThanOrEqual(12);
    loop.advance(Number.NaN);
    loop.advance(-1);
    expect(steps).toBeLessThanOrEqual(12);
  });

  it('does not step while not running and drops the accumulator', () => {
    let steps = 0;
    const loop = new FixedLoop({ step: () => steps++, render: () => {} }, 120);
    loop.running = false;
    for (let i = 0; i < 60; i++) loop.advance(1 / 60);
    expect(steps).toBe(0);
    loop.running = true;
    loop.advance(1 / 60);
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(2);
  });

  it('passes an interpolation alpha in [0,1)', () => {
    const alphas: number[] = [];
    const loop = new FixedLoop({ step: () => {}, render: (a) => alphas.push(a) }, 120);
    for (let i = 0; i < 50; i++) loop.advance(1 / 144);
    expect(alphas.every((a) => a >= 0 && a < 1)).toBe(true);
  });
});

describe('PauseManager', () => {
  it('only resumes when every reason is cleared', () => {
    const p = new PauseManager();
    p.add('user');
    p.add('ad');
    p.add('hidden');
    p.remove('ad');
    expect(p.paused).toBe(true);
    p.remove('hidden');
    expect(p.paused).toBe(true);
    p.remove('user');
    expect(p.paused).toBe(false);
  });

  it('removing an absent reason never clears another', () => {
    const p = new PauseManager();
    p.add('menu');
    p.remove('ad');
    expect(p.has('menu')).toBe(true);
  });
});

describe('StateMachine', () => {
  it('rejects transitions not in the table', () => {
    const f = new StateMachine();
    expect(f.go('driving')).toBe(false);
    expect(f.go('loading')).toBe(true);
    expect(f.go('title')).toBe(true);
    expect(f.go('driving')).toBe(true);
    expect(f.go('paused')).toBe(true);
    expect(f.go('garage')).toBe(false);
    expect(f.go('driving')).toBe(true);
    expect(f.go('results')).toBe(true);
    expect(f.go('ad')).toBe(true);
    expect(f.go('driving')).toBe(true);
  });
});
