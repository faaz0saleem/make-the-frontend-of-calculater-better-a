import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, softClipCurve, type Sfx } from '../../src/audio/audio';
import { materialOf, pickupNote, pickupSemitones, spillClatter, spillThuds } from '../../src/audio/sfx-cargo';
import { CARGO_IDS } from '../../src/data/cargo';

// ---------------------------------------------------------------- a strict fake of the WebAudio surface used
const finite = (v: number, what: string) => {
  if (!Number.isFinite(v)) throw new TypeError(`${what}: non-finite ${v}`);
};
class FakeParam {
  value = 0;
  setValueAtTime(v: number, t: number) { finite(v, 'setValueAtTime'); finite(t, 'time'); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { finite(v, 'linearRamp'); finite(t, 'time'); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    finite(v, 'expRamp'); finite(t, 'time');
    if (v <= 0) throw new RangeError('exponential ramp target must be > 0');
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number) { finite(v, 'setTarget'); finite(t, 'time'); finite(c, 'tc'); this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
let created = 0;
class FakeNode {
  constructor() { created++; }
  connect<T>(n: T): T { return n; }
  disconnect() {}
}
class FakeSource extends FakeNode {
  started = false;
  start(t = 0, offset = 0) { finite(t, 'start'); finite(offset, 'offset'); if (offset < 0) throw new RangeError('negative offset'); this.started = true; }
  stop(t = 0) { finite(t, 'stop'); }
}
class FakeOsc extends FakeSource {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  setPeriodicWave() {}
}
class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam();
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = 'lowpass'; frequency = new FakeParam(); Q = new FakeParam(); }
class FakeComp extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam();
  reduction = 0;
}
class FakeShaper extends FakeNode { curve: Float32Array | null = null; oversample = 'none'; }
class FakeCtx {
  static last: FakeCtx | null = null;
  state = 'running';
  currentTime = 10;
  sampleRate = 8000;
  destination = new FakeNode();
  constructor() { FakeCtx.last = this; }
  createOscillator() { return new FakeOsc(); }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeFilter(); }
  createBufferSource() { return new FakeBufferSource(); }
  createDynamicsCompressor() { return new FakeComp(); }
  createWaveShaper() { return new FakeShaper(); }
  createPeriodicWave() { return {}; }
  createBuffer(_ch: number, len: number, sr: number) {
    const data = new Float32Array(len);
    return { duration: len / sr, getChannelData: () => data };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

const ALL: Sfx[] = [
  'coin', 'pickup', 'full', 'shed', 'spill', 'impact', 'bump', 'scrape', 'nearMiss', 'recovery', 'launch', 'land', 'crash',
  'finish', 'bank', 'purchase', 'click', 'error', 'count', 'go', 'medal', 'squish', 'rumble', 'damage',
];

describe('audio: cargo materials and pitch ladder', () => {
  it('every cargo id has a material; only the parcel (and unknown ids) sound like cardboard', () => {
    for (const id of CARGO_IDS) {
      const m = materialOf(id);
      expect(m).toBeTruthy();
      if (id !== 'parcel') expect(m, id).not.toBe('card');
    }
    expect(materialOf(undefined)).toBe('card');
    expect(materialOf('nope')).toBe('card');
    expect(materialOf('fridge')).toBe('metal');
    expect(materialOf('fishtank')).toBe('glass');
    expect(materialOf('weddingcake')).toBe('cake');
  });

  it('pickup chime climbs with stack height and stops at one octave', () => {
    for (const world of [1, 2, 3]) {
      let prev = -1;
      for (let h = 1; h <= 20; h++) {
        const s = pickupSemitones(h, world);
        expect(s).toBeGreaterThanOrEqual(prev);
        expect(s).toBeLessThanOrEqual(12);
        prev = s;
      }
      expect(pickupSemitones(1, world)).toBe(0);
      expect(pickupSemitones(2, world)).toBeGreaterThan(0);
      expect(pickupSemitones(8, world)).toBe(12);
      expect(pickupNote(30, world) - pickupNote(1, world)).toBe(12);
    }
    // Missing / odd heights fall back to the first rung instead of NaN.
    expect(pickupSemitones(undefined)).toBe(0);
    expect(pickupSemitones(Number.NaN)).toBe(0);
    expect(pickupSemitones(0)).toBe(0);
  });

  it('spill thuds are capped at three and clatter grows with the item count', () => {
    expect(spillThuds(undefined)).toBe(1);
    expect(spillThuds(1)).toBe(1);
    expect(spillThuds(3)).toBe(3);
    expect(spillThuds(12)).toBe(3);
    expect(spillClatter(1)).toBeLessThan(spillClatter(3));
    expect(spillClatter(50)).toBeLessThanOrEqual(5);
  });
});

describe('audio: output soft clipper', () => {
  it('is transparent below the knee and never exceeds -1 dBFS', () => {
    const c = softClipCurve();
    const n = c.length;
    const range = 2;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * range;
      max = Math.max(max, Math.abs(c[i]));
      if (Math.abs(x) <= 0.6) expect(c[i]).toBeCloseTo(x, 5);
      if (i > 0) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
      expect(c[i]).toBeCloseTo(-c[n - 1 - i], 6);
    }
    expect(c[(n - 1) / 2]).toBe(0);
    expect(20 * Math.log10(max)).toBeLessThan(-1);
  });
});

describe('audio: one-shots on a fake context', () => {
  let clock = 0;
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  const make = () => {
    const a = new AudioManager();
    a.unlock();
    expect(FakeCtx.last).toBeTruthy();
    return a;
  };

  it('does nothing before unlock and never throws', () => {
    const a = new AudioManager();
    for (const n of ALL) expect(() => a.play(n)).not.toThrow();
  });

  it('every one-shot plays with no extra arguments and with full context, scheduling only valid automation', () => {
    const a = make();
    for (const n of ALL) {
      clock += 1000;
      expect(() => a.play(n), n).not.toThrow();
      clock += 1000;
      expect(() => a.play(n, 1.3, { height: 7, cargo: 'piano', count: 5, hero: true }), n).not.toThrow();
    }
    for (const cargo of [...CARGO_IDS, undefined, 'unknown']) {
      clock += 1000;
      expect(() => a.play('pickup', 1, { height: 3, cargo }), String(cargo)).not.toThrow();
      clock += 1000;
      expect(() => a.play('damage', 0.7, { cargo }), String(cargo)).not.toThrow();
    }
    clock += 1000;
    expect(() => a.play('pickup', 1, { height: Number.NaN, count: Number.NaN })).not.toThrow();
  });

  it('keeps per-sound node counts light (coin is a single oscillator)', () => {
    const a = make();
    const cost = (fn: () => void) => { clock += 1000; const before = created; fn(); return created - before; };
    expect(cost(() => a.play('coin'))).toBeLessThanOrEqual(2);
    expect(cost(() => a.play('pickup', 1, { height: 3, cargo: 'parcel' }))).toBeLessThanOrEqual(12);
    expect(cost(() => a.play('pickup', 1, { height: 3, cargo: 'gnome' }))).toBeLessThanOrEqual(30);
    expect(cost(() => a.play('spill', 1, { count: 10 }))).toBeLessThanOrEqual(45);
    expect(cost(() => a.play('bank', 1, { count: 50 }))).toBeLessThanOrEqual(36);
  });

  it('throttles repeats and caps overlapping instances', () => {
    const a = make();
    const count = (fn: () => void) => { const before = created; fn(); return created - before; };
    // Coin keeps its 35 ms throttle.
    a.play('coin');
    clock += 20;
    expect(count(() => a.play('coin'))).toBe(0);
    clock += 20;
    expect(count(() => a.play('coin'))).toBeGreaterThan(0);
    // Spill: at most two ringing at once even when the throttle allows more (audio clock frozen).
    for (let i = 0; i < 2; i++) { clock += 100; expect(count(() => a.play('spill'))).toBeGreaterThan(0); }
    clock += 100;
    expect(count(() => a.play('spill'))).toBe(0);
    // Once the audio clock moves past their tails, spills play again.
    FakeCtx.last!.currentTime += 5;
    clock += 100;
    expect(count(() => a.play('spill'))).toBeGreaterThan(0);
  });

  it('keeps the mute model: any reason silences the master', () => {
    const a = make();
    const master = (a as unknown as { master: FakeGain }).master;
    a.setVolumes(1, 1, 1);
    expect(master.gain.value).toBeGreaterThan(0);
    a.addMute('ad');
    expect(master.gain.value).toBe(0);
    a.addMute('platform');
    a.removeMute('ad');
    expect(master.gain.value).toBe(0);
    a.removeMute('platform');
    expect(master.gain.value).toBeGreaterThan(0);
  });

  it('ducks the engine bed under a pickup but not under a coin', () => {
    const a = make();
    const bed = (a as unknown as { bed: FakeGain }).bed;
    bed.gain.value = 1;
    a.play('coin');
    expect(bed.gain.value).toBe(1);
    const spy = vi.spyOn(bed.gain, 'linearRampToValueAtTime');
    a.play('pickup');
    const floor = spy.mock.calls[0]?.[0] as number;
    expect(20 * Math.log10(floor)).toBeLessThan(-4.5);
    expect(20 * Math.log10(floor)).toBeGreaterThan(-6.5);
    expect(bed.gain.value).toBe(1); // released back to full
  });
});
