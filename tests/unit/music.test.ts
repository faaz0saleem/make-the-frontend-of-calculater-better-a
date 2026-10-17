import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicEngine } from '../../src/audio/music';
import { SONGS } from '../../src/audio/music-songs';
import { BEATS_PER_BAR, barEvents, barSignature, formBars, type SongDef } from '../../src/audio/music-theory';

// ------------------------------------------------------------------ a minimal recording WebAudio fake

type Ev = [string, ...unknown[]];

class FakeParam {
  events: Ev[] = [];
  constructor(public value = 0) {}
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v: number, t: number, c: number) { this.events.push(['target', v, t, c]); return this; }
  setValueCurveAtTime(c: Float32Array, t: number, d: number) { this.events.push(['curve', c.length, t, d]); return this; }
  cancelScheduledValues(t: number) { this.events.push(['cancel', t]); return this; }
}

class FakeNode {
  outputs: unknown[] = [];
  constructor(readonly kind: string) {}
  connect<T>(n: T): T { this.outputs.push(n); return n; }
  disconnect() { this.outputs = []; }
}

class FakeSource extends FakeNode {
  starts: number[] = [];
  stops: number[] = [];
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  playbackRate = new FakeParam(1);
  type = 'sine';
  buffer: unknown = null;
  onended: (() => void) | null = null;
  start(t = 0) { this.starts.push(t); }
  stop(t = 0) { this.stops.push(t); }
  setPeriodicWave() {}
}

class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  created = 0;
  sources: FakeSource[] = [];
  gains: (FakeNode & { gain: FakeParam })[] = [];
  readonly destination = new FakeNode('destination');
  constructor(public state: 'running' | 'suspended' = 'running', offline = false) {
    if (offline) (this as unknown as { startRendering: () => void }).startRendering = () => {};
  }
  private node<T extends FakeNode>(n: T): T { this.created++; return n; }
  createGain() { const g = Object.assign(new FakeNode('gain'), { gain: new FakeParam(1) }); this.gains.push(g); return this.node(g); }
  createOscillator() { const s = new FakeSource('osc'); this.sources.push(s); return this.node(s); }
  createBufferSource() { const s = new FakeSource('buffer'); this.sources.push(s); return this.node(s); }
  createBiquadFilter() { return this.node(Object.assign(new FakeNode('filter'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1), gain: new FakeParam(0) })); }
  createStereoPanner() { return this.node(Object.assign(new FakeNode('panner'), { pan: new FakeParam(0) })); }
  createDelay() { return this.node(Object.assign(new FakeNode('delay'), { delayTime: new FakeParam(0) })); }
  createWaveShaper() { return this.node(Object.assign(new FakeNode('shaper'), { curve: null as Float32Array | null })); }
  createPeriodicWave() { return {}; }
}

const NOISE = { duration: 2, length: 96000, sampleRate: 48000, numberOfChannels: 1 } as unknown as AudioBuffer;

function engineOn(ctx: FakeContext) {
  const bus = ctx.createGain();
  return new MusicEngine(ctx as unknown as BaseAudioContext, bus as unknown as AudioNode, NOISE);
}

/** Drive the engine the way the live timer does: currentTime advances, scheduleUntil(now + lookahead). */
function run(ctx: FakeContext, e: MusicEngine, from: number, to: number, step = 0.05) {
  for (let t = from; t <= to + 1e-9; t += step) {
    ctx.currentTime = t;
    e.scheduleUntil(t + 0.35);
  }
}

const songs = [1, 2, 3].map((w) => [w, SONGS[w].title, SONGS[w]] as [number, string, SongDef]);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------ song data

describe('music: song data', () => {
  it.each(songs)('world %i %s has a tempo in range, A/B sections and >= 32 bars before the form repeats', (_w, _t, song) => {
    expect(song.bpm).toBeGreaterThanOrEqual(100);
    expect(song.bpm).toBeLessThanOrEqual(130);
    expect(formBars(song)).toBeGreaterThanOrEqual(32);
    const names = new Set(song.form);
    expect(names.has('A') && names.has('B')).toBe(true);
    expect(song.sections.A.chords).not.toBe(song.sections.B.chords);
    // No period shorter than 32 bars in the written content (seeded variation comes on top of this).
    const L = formBars(song);
    const sig = Array.from({ length: 2 * L }, (_, i) => barSignature(song, i));
    for (let p = 1; p < 32; p++) {
      const repeats = sig.slice(0, L).every((s, i) => s === sig[i + p]);
      expect(repeats, `repeats every ${p} bars`).toBe(false);
    }
  });

  it.each(songs)('world %i %s: every section line has one entry per bar and ends with a drum fill', (_w, _t, song) => {
    for (const [name, sec] of Object.entries(song.sections)) {
      const bars = sec.chords.split('|').length;
      expect(bars, name).toBe(8);
      for (const line of [sec.lead, sec.counter]) if (line) expect(line.split('|').length, name).toBe(bars);
      for (const [part, list] of Object.entries(sec.pat)) {
        expect(list.length, `${name}.${part}`).toBe(bars);
        if (part === 'kit') expect(list[bars - 1].split('|').every((n) => n.startsWith('fill')), `${name} fill`).toBe(true);
      }
    }
  });

  it.each(songs)('world %i %s: notes are in sane MIDI ranges, timed inside the bar', (_w, _t, song) => {
    const L = formBars(song);
    let notes = 0;
    for (let bar = 0; bar < 2 * L; bar++) {
      for (const e of barEvents(song, bar)) {
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThan(BEATS_PER_BAR);
        expect(e.d).toBeGreaterThan(0);
        expect(e.v).toBeGreaterThan(0);
        expect(e.v).toBeLessThanOrEqual(1);
        if (e.drum) continue;
        notes++;
        const part = song.parts.find((p) => p.id === e.part)!;
        expect(Number.isInteger(e.n)).toBe(true);
        expect(e.n).toBeGreaterThanOrEqual(part.kind === 'bass' ? 28 : 45);
        expect(e.n).toBeLessThanOrEqual(part.kind === 'bass' ? 64 : 96);
      }
    }
    expect(notes).toBeGreaterThan(L * 8);
  });

  it.each(songs)('world %i %s: the menu arrangement (intensity 0) has chords, a melody and light percussion but no kick', (_w, _t, song) => {
    const menu = song.parts.filter((p) => p.mix[0] > 0);
    expect(menu.some((p) => p.kind === 'pad' || p.kind === 'comp')).toBe(true);
    expect(menu.some((p) => p.kind === 'line' && p.line === 'lead')).toBe(true);
    expect(menu.some((p) => p.kind === 'kit')).toBe(true);
    const ids = new Set(menu.map((p) => p.id));
    for (let bar = 0; bar < 2 * formBars(song); bar++) {
      for (const e of barEvents(song, bar)) if (ids.has(e.part)) expect(e.drum, `${e.part} bar ${bar}`).not.toBe('k');
    }
    // The driving arrangement does have a kick and a bass.
    const full = song.parts.filter((p) => p.mix[1] > 0);
    expect(full.some((p) => p.kind === 'bass')).toBe(true);
    expect(barEvents(song, 0).some((e) => e.drum === 'k' && full.some((p) => p.id === e.part))).toBe(true);
  });

  it.each(songs)('world %i %s: deterministic for a seed, lightly varied on repeats, no Math.random', (_w, _t, song) => {
    const rnd = vi.spyOn(Math, 'random');
    const L = formBars(song);
    for (let bar = 0; bar < 2 * L; bar++) expect(barEvents(song, bar, 123)).toEqual(barEvents(song, bar, 123));
    const a = Array.from({ length: 2 * L }, (_, b) => JSON.stringify(barEvents(song, b, 1)));
    const b = Array.from({ length: 2 * L }, (_, i) => JSON.stringify(barEvents(song, i, 2)));
    expect(a).not.toEqual(b);
    // The second pass is the same tune with small differences, not a different tune.
    const pass = (p: number) => Array.from({ length: L }, (_, i) => barEvents(song, p * L + i).filter((e) => e.part === 'lead').length);
    const p0 = pass(0);
    const p1 = pass(1);
    const sameBars = p0.filter((n, i) => n === p1[i]).length;
    expect(sameBars).toBeGreaterThan(L * 0.6);
    expect(Array.from({ length: L }, (_, i) => JSON.stringify(barEvents(song, i))).join()).not.toBe(Array.from({ length: L }, (_, i) => JSON.stringify(barEvents(song, L + i))).join());
    expect(rnd).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ engine

describe('music: engine', () => {
  it.each(songs)('world %i %s: node budget while driving and in menus', (w) => {
    const rnd = vi.spyOn(Math, 'random');
    const rates: number[] = [];
    for (const intensity of [1, 0]) {
      const ctx = new FakeContext('suspended', true);
      const e = engineOn(ctx);
      e.setSong(w, intensity);
      const persistent = ctx.created;
      const firstNote = ctx.sources.length; // layer LFOs are created with the song
      run(ctx, e, 0, 120);
      const perSecond = (ctx.created - persistent) / 120;
      rates.push(perSecond);
      expect(e.stats.nodes).toBe(ctx.created - persistent);
      expect(perSecond).toBeGreaterThan(10); // it really plays
      expect(perSecond).toBeLessThanOrEqual(60);
      // Every source gets a stop time.
      for (const s of ctx.sources.slice(firstNote)) expect(s.stops.length, s.kind).toBeGreaterThan(0);
    }
    console.log(`${SONGS[w].title}: ${rates[0].toFixed(1)} nodes/s driving, ${rates[1].toFixed(1)} nodes/s menu`);
    expect(rnd).not.toHaveBeenCalled();
  });

  it('schedules synchronously on an offline context before rendering, without a timer', () => {
    const timer = vi.spyOn(globalThis, 'setInterval');
    const ctx = new FakeContext('suspended', true);
    const e = engineOn(ctx);
    e.setSong(2, 1);
    expect(ctx.sources.length).toBe(0);
    e.scheduleUntil(30);
    expect(timer).not.toHaveBeenCalled();
    const starts = ctx.sources.flatMap((s) => s.starts);
    expect(starts.length).toBeGreaterThan(300);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(0.05);
    expect(Math.max(...starts)).toBeLessThan(30);
    expect(Math.max(...starts)).toBeGreaterThan(29);
  });

  it('timer path only schedules while the context is running', () => {
    vi.useFakeTimers();
    const ctx = new FakeContext('suspended');
    const e = engineOn(ctx);
    e.setSong(1, 1);
    vi.advanceTimersByTime(500);
    expect(ctx.sources.length).toBe(0);
    ctx.state = 'running';
    ctx.currentTime = 1;
    vi.advanceTimersByTime(100);
    const starts = ctx.sources.flatMap((s) => s.starts);
    expect(starts.length).toBeGreaterThan(0);
    expect(Math.max(...starts)).toBeLessThan(1 + 0.36);
    e.stop();
  });

  it('skips ahead without a burst after the timer fell far behind (throttled background tab)', () => {
    const ctx = new FakeContext('suspended', true);
    const e = engineOn(ctx);
    e.setSong(1, 1);
    run(ctx, e, 0, 10);
    const before = ctx.sources.length;
    ctx.currentTime = 70; // a minute without timer ticks
    e.scheduleUntil(70.35);
    const fresh = ctx.sources.slice(before);
    expect(fresh.length).toBeLessThan(30);
    for (const s of fresh) expect(s.starts[0]).toBeGreaterThanOrEqual(70 - 0.031);
    // ...and carries on in time afterwards.
    run(ctx, e, 70.05, 80);
    expect(ctx.sources.length - before).toBeGreaterThan(100);
  });

  it('crossfades layers when the intensity changes, keeping the song position', () => {
    const ctx = new FakeContext('suspended', true);
    const e = engineOn(ctx);
    e.setSong(1, 0);
    run(ctx, e, 0, 6);
    const kicks = () => e.stats.byPart.kit ?? 0;
    expect(kicks()).toBe(0);
    const seen = ctx.gains.map((g) => g.gain.events.length);
    e.setSong(1, 1);
    const fades = ctx.gains.flatMap((g, i) => g.gain.events.slice(seen[i] ?? 0)).filter((ev) => ev[0] === 'lin');
    expect(fades.length).toBeGreaterThanOrEqual(4);
    for (const f of fades) {
      expect(f[2] as number).toBeGreaterThanOrEqual(6 + 0.5);
      expect(f[2] as number).toBeLessThanOrEqual(6 + 1);
    }
    run(ctx, e, 6.05, 12);
    expect(kicks()).toBeGreaterThan(0);
    expect(e.stats.byPart.flute).toBeGreaterThan(0);
  });

  it('crossfades between songs and releases the old one', () => {
    const ctx = new FakeContext('suspended', true);
    const e = engineOn(ctx);
    e.setSong(1, 1);
    run(ctx, e, 0, 5);
    const n = ctx.gains.length;
    e.setSong(3, 1);
    const fresh = ctx.gains.slice(n);
    // The new song's output fades in from silence; the old one fades out over ~0.9 s.
    const fadeIns = fresh.flatMap((g) => g.gain.events).filter((ev) => ev[0] === 'lin' && ev[1] === 1);
    expect(fadeIns.length).toBeGreaterThan(0);
    const fadeOuts = ctx.gains.slice(0, n).flatMap((g) => g.gain.events).filter((ev) => ev[0] === 'lin' && ev[1] === 0);
    expect(fadeOuts.some((ev) => (ev[2] as number) > 5.5 && (ev[2] as number) <= 6)).toBe(true);
    const before = ctx.sources.length;
    run(ctx, e, 5.05, 20);
    // After the fade, only the new song schedules notes (the old player's nodes were disconnected).
    const late = ctx.sources.slice(before).filter((s) => s.starts[0] > 6.5);
    expect(late.length).toBeGreaterThan(50);
    expect(e.stats.byPart.ep).toBeGreaterThan(0);
  });

  it('stop(): everything fades and no note keeps sounding afterwards', () => {
    const ctx = new FakeContext('suspended', true);
    const e = engineOn(ctx);
    e.setSong(2, 1);
    run(ctx, e, 0, 7.3);
    e.stop();
    const T = ctx.currentTime;
    // The last stop() call is the one that applies.
    for (const s of ctx.sources) expect(s.stops[s.stops.length - 1]).toBeLessThanOrEqual(T + 0.45);
    const count = ctx.sources.length;
    run(ctx, e, T + 0.05, T + 10);
    expect(ctx.sources.length).toBe(count);
    // It can start again afterwards.
    e.setSong(2, 0);
    run(ctx, e, T + 10.05, T + 14);
    expect(ctx.sources.length).toBeGreaterThan(count);
  });
});
