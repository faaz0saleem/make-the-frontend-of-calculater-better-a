import { MusicEngine } from './music';
import { bankSfx, coinSfx, damageSfx, fullSfx, nearMissSfx, pickupSfx, shedSfx, spillSfx, squishSfx } from './sfx-recipes';
import { materialOf } from './sfx-cargo';
import { midi, Voices } from './sfx-voices';

/**
 * Lightweight procedural audio (no external assets). Everything is synthesised with WebAudio:
 * engine loop, tyre squeal, wind, one-shot effects and a restrained per-world music loop.
 * Mute is the union of independent reasons ('platform', 'ad', 'hidden', 'user') so ending one
 * reason never cancels another.
 *
 * Signal flow: engine/tyre/wind -> bed (ducked under important one-shots) -> sfx bus;
 * one-shots -> sfx bus; music -> music bus; both buses -> master -> limiter -> soft clip -> output.
 */
export type Sfx =
  | 'coin' | 'pickup' | 'full' | 'shed' | 'spill' | 'impact' | 'bump' | 'scrape' | 'nearMiss' | 'recovery'
  | 'launch' | 'land' | 'crash' | 'finish' | 'bank' | 'purchase' | 'click' | 'error' | 'count' | 'go' | 'medal' | 'squish' | 'rumble'
  | 'damage';

/** Optional context for a one-shot. Every field is optional: play(name) alone always works. */
export interface SfxOpts {
  /** Stack height after a pickup (items on the truck): the pickup chime climbs with it. */
  height?: number;
  /** Cargo id (src/data/cargo.ts) for the material flavour of pickup / spill / squish / damage. */
  cargo?: string;
  /** Items involved: spill = items lost, bank = items delivered. */
  count?: number;
  /** Smart shed (saved the stack): adds a flourish. */
  hero?: boolean;
}

interface Engine {
  osc: OscillatorNode[];
  gain: GainNode;
  lp: BiquadFilterNode[];
}

/** Minimum gap between two plays of the same one-shot (ms). */
const GAP: Partial<Record<Sfx, number>> = { coin: 35, rumble: 250, damage: 120 };
/** Overlapping instances allowed per one-shot (default 3). */
const CAP: Partial<Record<Sfx, number>> = { coin: 4, spill: 2, shed: 2, squish: 2, damage: 2, crash: 1, bank: 2 };
/** Skipped when many one-shots are already ringing. */
const LOW_PRIORITY = new Set<Sfx>(['coin', 'rumble', 'scrape', 'bump', 'click']);
const BUSY = 12;
/** Bed duck under important one-shots: [depth dB, hold s]. */
const DUCK: Partial<Record<Sfx, [number, number]>> = {
  pickup: [5.5, 0.12], spill: [6, 0.4], shed: [5.5, 0.15], bank: [6, 0.3], full: [5, 0.2], squish: [5, 0.15], damage: [5, 0.06],
};
/** Coin-line pitch climb (semitones), one rung per coin while they keep coming. */
const COIN_STEPS = [0, 2, 4, 7, 9, 12];

/** Input range (linear) the soft clipper maps; anything hotter is pinned to the ceiling. */
const CLIP_RANGE = 2;

/**
 * Odd-symmetric soft-clip transfer curve for a WaveShaper fed with input / range: identity up to
 * `knee`, then a tanh shoulder that never reaches `ceiling` (0.88 = -1.1 dBFS). Inputs beyond the
 * range clamp to the curve's ends, so the output can never exceed the ceiling.
 */
export function softClipCurve(n = 4097, range = CLIP_RANGE, knee = 0.6, ceiling = 0.88): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const span = ceiling - knee;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  /** Engine/tyre/wind sub-bus inside the effects bus; ducked under important one-shots. */
  private bed!: GainNode;
  private limiter!: DynamicsCompressorNode;
  /** Final output stage feeding the speakers (QA level meters tap this node by name). */
  private comp!: AudioNode;
  private noise!: AudioBuffer;
  private voices: Voices | null = null;
  private engine: Engine | null = null;
  private tire: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private reasons = new Set<string>();
  private vol = { master: 0.8, music: 0.55, sfx: 0.8 };
  private musicEngine: MusicEngine | null = null;
  private world = 1;
  private intensity = 0; // 0 menu, 1 driving
  private musicOn = false;
  private lastPlay = new Map<Sfx, number>();
  /** End times (audio clock) of the instances of each one-shot still ringing. */
  private live = new Map<Sfx, number[]>();
  private coinStreak = 0;
  private lastCoinAt = -1e9;
  unlocked = false;

  /** Create/resume the context. Must be called from a user gesture on first use (iOS). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
        this.musicEngine = new MusicEngine(this.ctx, this.music, this.noise);
        if (this.musicOn) this.musicEngine.setSong(this.world, this.intensity);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
      this.unlocked = true;
    } catch {
      /* audio unavailable: game stays playable */
    }
  }

  private build(): void {
    const c = this.ctx!;
    // Output: a fast limiter (Chromium adds ~4 dB make-up gain at these settings) catches loud pile-ups
    // well above the music's level, then a soft clipper guarantees peaks stay under -1 dBFS.
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    const pre = c.createGain();
    pre.gain.value = 1 / CLIP_RANGE;
    const clip = c.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    this.comp = clip;
    this.master = c.createGain();
    this.music = c.createGain();
    this.sfx = c.createGain();
    this.bed = c.createGain();
    this.bed.connect(this.sfx);
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(pre).connect(clip);
    this.comp.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    this.voices = new Voices(c, this.noise, this.sfx);
    this.applyGains(true);
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    this.applyGains();
  }

  addMute(reason: string): void {
    this.reasons.add(reason);
    this.applyGains();
  }

  removeMute(reason: string): void {
    this.reasons.delete(reason);
    this.applyGains();
  }

  hasMute(reason: string): boolean {
    return this.reasons.has(reason);
  }

  get muted(): boolean {
    return this.reasons.size > 0;
  }

  muteReasons(): string[] {
    return [...this.reasons];
  }

  private applyGains(instant = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.reasons.size > 0 ? 0 : this.vol.master;
    const ramp = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      if (instant) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, 0.04);
    };
    ramp(this.master, m * 0.9);
    ramp(this.music, this.vol.music);
    ramp(this.sfx, this.vol.sfx);
  }

  /** Recover from iOS interruptions / backgrounding. Call on visibility + gestures. */
  resumeIfNeeded(): void {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
  }

  // ------------------------------------------------------------------ continuous loops
  startDriveLoops(): void {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    // Engine: two slightly detuned saws and a soft triangle sub, through two gentle lowpasses
    // (24 dB/oct) so the drone is a warm hum rather than a buzz.
    const gain = c.createGain();
    gain.gain.value = 0;
    const lp1 = c.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = 260;
    lp1.Q.value = 0.5;
    const lp2 = c.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 420;
    lp2.Q.value = 0.6;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 55 * 1.008;
    const o2g = c.createGain();
    o2g.gain.value = 0.7;
    const o3 = c.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = 27.5;
    const o3g = c.createGain();
    o3g.gain.value = 0.45;
    o1.connect(lp1);
    o2.connect(o2g).connect(lp1);
    o3.connect(o3g).connect(lp1);
    lp1.connect(lp2).connect(gain).connect(this.bed);
    for (const o of [o1, o2, o3]) o.start();
    this.engine = { osc: [o1, o2, o3], gain, lp: [lp1, lp2] };
    const tsrc = c.createBufferSource();
    tsrc.buffer = this.noise;
    tsrc.loop = true;
    const tf = c.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 1300;
    tf.Q.value = 3;
    const tg = c.createGain();
    tg.gain.value = 0;
    tsrc.connect(tf).connect(tg).connect(this.bed);
    tsrc.start();
    this.tire = { src: tsrc, gain: tg, filter: tf };
    const wsrc = c.createBufferSource();
    wsrc.buffer = this.noise;
    wsrc.loop = true;
    wsrc.playbackRate.value = 0.5;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 450;
    const wg = c.createGain();
    wg.gain.value = 0;
    wsrc.connect(wf).connect(wg).connect(this.bed);
    wsrc.start(0, 0.7);
    this.wind = { src: wsrc, gain: wg, filter: wf };
  }

  stopDriveLoops(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engine) {
      const e = this.engine;
      e.gain.gain.setTargetAtTime(0, t, 0.08);
      setTimeout(() => e.osc.forEach((o) => { try { o.stop(); } catch { /* */ } }), 400);
      this.engine = null;
    }
    if (this.tire) {
      const tr = this.tire;
      tr.gain.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => { try { tr.src.stop(); } catch { /* */ } }, 300);
      this.tire = null;
    }
    if (this.wind) {
      const w = this.wind;
      w.gain.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => { try { w.src.stop(); } catch { /* */ } }, 300);
      this.wind = null;
    }
  }

  /** speed m/s, slip 0..1, load 0..1, wind 0..1 */
  updateDrive(speed: number, slip: number, load: number, wind: number, airborne: boolean): void {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    const rpm = 0.35 + Math.min(1, speed / 26) * 0.65;
    const f = 36 + rpm * 60 + (airborne ? 14 : 0);
    e.osc[0].frequency.setTargetAtTime(f, t, 0.08);
    e.osc[1].frequency.setTargetAtTime(f * 1.008, t, 0.08);
    e.osc[2].frequency.setTargetAtTime(f / 2, t, 0.08);
    const cut = 150 + rpm * 330 + load * 110;
    e.lp[0].frequency.setTargetAtTime(cut, t, 0.1);
    e.lp[1].frequency.setTargetAtTime(cut * 1.6, t, 0.1);
    e.gain.gain.setTargetAtTime(0.044 + rpm * 0.023, t, 0.1);
    this.tire?.gain.gain.setTargetAtTime(Math.min(0.05, slip * 0.05), t, 0.05);
    if (this.wind) {
      this.wind.filter.frequency.setTargetAtTime(300 + Math.min(30, speed) * 9, t, 0.2);
      this.wind.gain.gain.setTargetAtTime(Math.min(0.17, wind * 0.15 + speed * 0.0016), t, 0.2);
    }
  }

  /** Silence loops while paused (without stopping them). */
  duckDrive(on: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on) {
      this.engine?.gain.gain.setTargetAtTime(0, t, 0.05);
      this.tire?.gain.gain.setTargetAtTime(0, t, 0.05);
      this.wind?.gain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  /** Briefly pull the engine/tyre/wind bed down so an important one-shot reads clearly. */
  private duckBed(db: number, hold: number): void {
    if (!this.ctx) return;
    const g = this.bed.gain;
    const t = this.ctx.currentTime;
    const floor = Math.min(g.value, Math.pow(10, -db / 20));
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(floor, t + 0.015);
    g.setValueAtTime(floor, t + 0.015 + hold);
    g.setTargetAtTime(1, t + 0.015 + hold, 0.085); // ~0.25 s back to full
  }

  // ------------------------------------------------------------------ one-shots
  /**
   * Play a one-shot. `strength` scales impact-like sounds; `opts` carries optional game context
   * (stack height, cargo id, item count, smart shed).
   */
  play(name: Sfx, strength = 1, opts?: SfxOpts): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.voices) return;
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? -1e9) < (GAP[name] ?? 60)) return;
    const ct = this.ctx.currentTime;
    let ringing = 0;
    for (const [k, ends] of this.live) {
      const still = ends.filter((e) => e > ct);
      this.live.set(k, still);
      ringing += still.length;
    }
    const mine = this.live.get(name) ?? [];
    if (mine.length >= (CAP[name] ?? 3) || (LOW_PRIORITY.has(name) && ringing >= BUSY)) return;
    this.lastPlay.set(name, now);
    const end = this.synth(name, ct + 0.005, strength, opts ?? {}, now);
    mine.push(end);
    this.live.set(name, mine);
    const d = DUCK[name];
    if (d) this.duckBed(d[0], d[1]);
  }

  private synth(name: Sfx, t: number, s: number, o: SfxOpts, now: number): number {
    const v = this.voices!;
    switch (name) {
      case 'coin': {
        this.coinStreak = now - this.lastCoinAt < 450 ? Math.min(COIN_STEPS.length - 1, this.coinStreak + 1) : 0;
        this.lastCoinAt = now;
        return coinSfx(v, t, COIN_STEPS[this.coinStreak]);
      }
      case 'pickup': return pickupSfx(v, t, o.height, o.cargo, this.world);
      case 'full': return fullSfx(v, t);
      case 'shed': return shedSfx(v, t, !!o.hero);
      case 'spill': return spillSfx(v, t, o.count, s, o.cargo, this.world);
      case 'bank': return bankSfx(v, t, o.count);
      case 'squish': {
        // Brittle things crunch as well as squelch.
        const m = materialOf(o.cargo);
        if (m === 'glass' || m === 'ceramic' || m === 'paper') damageSfx(v, t + 0.02, o.cargo, 0.6);
        return squishSfx(v, t);
      }
      case 'damage': return damageSfx(v, t, o.cargo, Math.max(0.5, Math.min(1, s)));
      case 'nearMiss': return nearMissSfx(v, t);
      case 'impact':
        v.noise(0.18, 900, 0.3 * s, t);
        return v.thump(70, 0.25, 0.45 * s, t);
      case 'bump':
        this.rattle(4, t + 0.04);
        return v.thump(80, 0.12, 0.28, t);
      case 'scrape': return v.noise(0.3, 3200, 0.16 * Math.min(1.5, s), t, 'highpass');
      case 'recovery': return Math.max(...[0, 4, 7, 12].map((n, i) => v.tone(midi(72 + n), 0.12, 'triangle', 0.09, t + i * 0.06, { attack: 0.008 })));
      case 'launch': return v.tone(200, 0.3, 'sawtooth', 0.05, t, { to: 520, attack: 0.003 });
      case 'land':
        this.rattle(6, t + 0.05);
        return v.thump(60, 0.22, 0.4 * Math.min(1.5, s), t);
      case 'crash':
        v.noise(0.7, 500, 0.4, t);
        v.thump(45, 0.5, 0.5, t);
        return v.tone(300, 0.6, 'sawtooth', 0.07, t + 0.1, { to: 60, attack: 0.003 });
      case 'finish': return Math.max(...[0, 4, 7, 12, 16].map((n, i) => v.tone(midi(67 + n), 0.22, i % 2 ? 'square' : 'triangle', 0.08, t + i * 0.09, { attack: 0.008 })));
      case 'purchase':
        v.tone(988, 0.08, 'triangle', 0.1, t, { attack: 0.008 });
        v.tone(1319, 0.08, 'triangle', 0.1, t + 0.07, { attack: 0.008 });
        return v.tone(1976, 0.18, 'triangle', 0.08, t + 0.14, { attack: 0.008 });
      case 'click': return v.tone(880, 0.03, 'triangle', 0.05, t, { attack: 0.008 });
      case 'error': return v.tone(140, 0.16, 'square', 0.06, t, { attack: 0.008 });
      case 'count': return v.tone(660, 0.1, 'triangle', 0.1, t, { attack: 0.008 });
      case 'go': return v.tone(990, 0.2, 'triangle', 0.12, t, { attack: 0.008 });
      case 'medal': return Math.max(...[0, 7, 12, 19].map((n, i) => v.tone(midi(76 + n), 0.25, 'sine', 0.08, t + i * 0.07, { attack: 0.008 })));
      case 'rumble': return v.noise(0.08, 200, 0.12, t, 'lowpass');
    }
  }

  /** Short cargo rattle: a few tiny clicks. */
  rattle(n = 3, at?: number): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.voices) return;
    const t = at ?? this.ctx.currentTime;
    for (let i = 0; i < n; i++) this.voices.noise(0.03, 2500 + Math.random() * 2000, 0.04, t + i * 0.035 + Math.random() * 0.02, 'bandpass');
  }

  // ------------------------------------------------------------------ music
  /** Choose the song (world 1..3; the menu uses its backdrop world) and its intensity (0 menu, 1 driving). */
  setMusic(world: number, intensity: number): void {
    this.world = world;
    this.intensity = intensity;
    this.musicOn = true;
    // Before the first gesture there is no context yet: unlock() starts the remembered song.
    if (this.ctx && this.musicEngine) this.musicEngine.setSong(world, intensity);
  }

  stopMusic(): void {
    this.musicOn = false;
    this.musicEngine?.stop();
  }
}
