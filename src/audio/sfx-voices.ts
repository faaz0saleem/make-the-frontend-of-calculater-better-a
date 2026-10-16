/**
 * Synthesis primitives for one-shot effects. Every voice is short-lived: sources are scheduled to
 * stop right after their envelope ends, so the nodes are released by the browser on their own.
 */
const SILENT = 0.0005;

export const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export interface ToneOpts {
  /** Exponential pitch glide target (Hz), reached after `glide` seconds (default: the whole tone). */
  to?: number;
  glide?: number;
  /** Attack time in seconds (default 5 ms). */
  attack?: number;
  /** Seconds held at full level after the attack before the decay starts. */
  hold?: number;
  /** Optional lowpass cutoff (Hz) to soften a bright waveform. */
  lp?: number;
  /** Vibrato depth in cents and rate in Hz. */
  vib?: number;
  vibRate?: number;
}

export interface NoiseOpts {
  q?: number;
  /** Exponential filter sweep target (Hz) over the burst. */
  to?: number;
  attack?: number;
  hold?: number;
}

type Timbre = OscillatorType | 'coin' | 'chime' | 'reed';

/** Harmonic recipes for single-oscillator timbres (cheaper than stacking oscillators). */
const WAVES: Record<'coin' | 'chime' | 'reed', number[]> = {
  coin: [0, 1, 0.55, 0.32, 0.2, 0.12, 0.08], // bright, rounder than a square
  chime: [0, 1, 0.42, 0.06, 0.14, 0, 0.05], // soft bell-like blip
  reed: [0, 1, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08], // buzzier "nope"
};

export class Voices {
  private waves = new Map<string, PeriodicWave>();

  constructor(private readonly ctx: AudioContext, private readonly noiseBuf: AudioBuffer, private readonly out: AudioNode) {}

  private envelope(g: AudioParam, vol: number, t: number, dur: number, attack: number, hold = 0): void {
    const a = Math.min(attack, dur * 0.5);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(vol, t + a);
    if (hold > 0) g.setValueAtTime(vol, t + a + hold);
    g.exponentialRampToValueAtTime(SILENT, t + Math.max(dur, a + hold + 0.01));
  }

  private setTimbre(o: OscillatorNode, type: Timbre): void {
    if (type === 'coin' || type === 'chime' || type === 'reed') {
      let w = this.waves.get(type);
      if (!w) {
        const h = WAVES[type];
        w = this.ctx.createPeriodicWave(new Float32Array(h), new Float32Array(h.length));
        this.waves.set(type, w);
      }
      o.setPeriodicWave(w);
    } else o.type = type;
  }

  /** Enveloped oscillator with optional glide, hold, lowpass and vibrato. Returns its end time. */
  tone(f: number, dur: number, type: Timbre, vol: number, t: number, o: ToneOpts = {}): number {
    const c = this.ctx;
    const osc = c.createOscillator();
    this.setTimbre(osc, type);
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.glide ?? dur));
    const g = c.createGain();
    this.envelope(g.gain, vol, t, dur, o.attack ?? 0.005, o.hold);
    let head: AudioNode = osc;
    if (o.lp) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      lp.Q.value = 0.7;
      osc.connect(lp);
      head = lp;
    }
    head.connect(g).connect(this.out);
    const end = t + Math.max(dur, (o.attack ?? 0) + (o.hold ?? 0)) + 0.03;
    osc.start(t);
    osc.stop(end);
    if (o.vib) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vibRate ?? 6;
      const depth = c.createGain();
      depth.gain.value = o.vib;
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(end);
    }
    return end;
  }

  /** Two-step blip on one oscillator (coin "ba-ding"): f1, then f2 after `step` seconds. */
  blip(f1: number, f2: number, step: number, dur: number, type: Timbre, vol: number, t: number): number {
    const c = this.ctx;
    const osc = c.createOscillator();
    this.setTimbre(osc, type);
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.setValueAtTime(f2, t + step);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.setValueAtTime(vol * 0.85, t + step);
    g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return t + dur + 0.02;
  }

  /** Body thump: a sine that drops an octave. */
  thump(freq: number, dur: number, vol: number, t: number): number {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    return t + dur + 0.02;
  }

  /** Filtered noise burst with an optional filter sweep. */
  noise(dur: number, freq: number, vol: number, t: number, type: BiquadFilterType = 'lowpass', o: NoiseOpts = {}): number {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.q !== undefined) f.Q.value = o.q;
    const g = c.createGain();
    this.envelope(g.gain, vol, t, dur, o.attack ?? 0.002, o.hold);
    s.connect(f).connect(g).connect(this.out);
    const len = Math.max(dur, (o.attack ?? 0) + (o.hold ?? 0)) + 0.03;
    s.start(t, Math.random() * Math.max(0, this.noiseBuf.duration - len - 0.1));
    s.stop(t + len);
    return t + len;
  }

  /** Inharmonic sine partials (metal, glass, bells), each with its own decay. */
  partials(f0: number, ratios: number[], amps: number[], decays: number[], t: number): number {
    let end = t;
    for (let i = 0; i < ratios.length; i++) end = Math.max(end, this.tone(f0 * ratios[i], decays[i], 'sine', amps[i], t, { attack: 0.002 }));
    return end;
  }

  /** Soft chime note (one oscillator with a bell-like harmonic recipe). */
  chime(f: number, dur: number, vol: number, t: number): number {
    return this.tone(f, dur, 'chime', vol, t, { attack: 0.004 });
  }
}
