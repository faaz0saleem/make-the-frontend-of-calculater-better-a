import { SONGS } from './music-songs';
import { BEATS_PER_BAR, barEvents, prng, type DrumId, type NoteEvent, type PartDef, type SongDef, type VoiceId } from './music-theory';

/**
 * Procedural background music (no audio files). Three written-out songs (see music-songs.ts) are
 * turned into note events bar by bar and scheduled slightly ahead of the audio clock. Every part
 * is a layer with its own GainNode, so menu <-> driving arrangements and song changes crossfade.
 * Each note costs one oscillator or noise source plus one gain (plus a filter for the twang lead;
 * a snare hit is a noise burst plus a short body tone). One shared echo serves all songs and a soft
 * limiter keeps peaks under control. Everything goes into the music bus handed in by AudioManager,
 * which owns volume and every mute reason.
 */

const LOOKAHEAD = 0.35; // s scheduled ahead by the timer path
const TICK_MS = 50;
const LATE = 0.03; // events later than this are dropped instead of played in a burst
const LAYER_FADE = 0.7;
const SONG_FADE_OUT = 0.9;
const SONG_FADE_IN = 0.5;
const FIRST_FADE_IN = 0.25;
const STOP_FADE = 0.4;
/** Overall music level into the bus (the bus applies the player's music volume). */
const LEVEL = 1.12;
/** Soft peak limiter: exactly linear below KNEE, then a smooth (tanh) shoulder up to CEIL. */
const KNEE = 0.55;
const CEIL = 0.9;

function limiterCurve(points = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= KNEE ? a : KNEE + (CEIL - KNEE) * Math.tanh((a - KNEE) / (CEIL - KNEE));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

interface VoiceDef {
  /** Sine-series amplitudes for harmonics 1..n (a shared PeriodicWave), or a built-in type. */
  partials?: number[];
  type?: OscillatorType;
  level: number;
  a: number; // attack
  d: number; // decay time constant to sustain, or the ring time when s = 0
  s: number; // sustain fraction (0 = percussive)
  r: number; // release
  /** Per-note lowpass sweep: start Hz, end Hz, time constant, Q. */
  cut?: [number, number, number, number];
  /** Cents below pitch at the attack, gliding up (twang, whistle scoop). */
  bend?: number;
  /** Delayed vibrato on long notes: depth cents, rate Hz, delay s. */
  vib?: [number, number, number];
  /** Oscillator frequency multiplier (the power-chord wave sits an octave under the root). */
  mul?: number;
}

const VOICES: Record<VoiceId, VoiceDef> = {
  marimba: { partials: [1, 0.12, 0.05, 0.32, 0, 0.03, 0, 0, 0, 0.06], level: 0.45, a: 0.002, d: 0.7, s: 0, r: 0.08 },
  vibes: { partials: [1, 0, 0, 0.14], level: 0.3, a: 0.004, d: 1.5, s: 0, r: 0.35 },
  glock: { partials: [1, 0, 0, 0, 0.16, 0, 0.05], level: 0.25, a: 0.001, d: 1.1, s: 0, r: 0.2 },
  flute: { partials: [1, 0.2, 0.09, 0.04, 0.02], level: 0.23, a: 0.035, d: 0.25, s: 0.78, r: 0.12, vib: [9, 5.2, 0.18] },
  whistle: { partials: [1, 0.04], level: 0.2, a: 0.04, d: 0.2, s: 0.85, r: 0.1, bend: 60, vib: [18, 5.8, 0.15] },
  uke: { partials: [1, 0.6, 0.45, 0.3, 0.2, 0.13, 0.09, 0.06, 0.04], level: 0.24, a: 0.003, d: 0.5, s: 0, r: 0.06 },
  steel: { partials: [1, 0.6, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05], level: 0.22, a: 0.003, d: 1.3, s: 0, r: 0.15 },
  upright: { partials: [1, 0.6, 0.32, 0.18, 0.1, 0.05], level: 0.27, a: 0.008, d: 0.18, s: 0.5, r: 0.07 },
  pickbass: { partials: [1, 0.55, 0.35, 0.2, 0.12, 0.06], level: 0.36, a: 0.004, d: 0.12, s: 0.45, r: 0.05 },
  sub: { partials: [1, 0.3, 0.1, 0.04], level: 0.25, a: 0.008, d: 0.3, s: 0.75, r: 0.08 },
  pad: { partials: [1, 0.35, 0.2, 0.1, 0.06, 0.03], level: 0.09, a: 0.4, d: 0.8, s: 0.85, r: 0.7 },
  ep: { partials: [1, 0.32, 0.07, 0.03, 0, 0.015], level: 0.13, a: 0.004, d: 0.5, s: 0.45, r: 0.3 },
  twang: { type: 'sawtooth', level: 0.36, a: 0.003, d: 0.35, s: 0.35, r: 0.12, cut: [5000, 1400, 0.06, 4], bend: 35, vib: [14, 6, 0.25] },
  power: { partials: [0, 1, 0.75, 0.45, 0, 0.28, 0, 0.14, 0.08], mul: 0.5, level: 0.42, a: 0.002, d: 0.15, s: 0, r: 0.03 },
  synth: { partials: [1, 0.1, 0.33, 0.05, 0.16, 0.02, 0.08], level: 0.24, a: 0.012, d: 0.3, s: 0.7, r: 0.14, vib: [10, 5, 0.3] },
};

const DRUM_LEVEL: Record<DrumId, number> = {
  k: 0.4, s: 0.4, c: 0.4, h: 0.36, o: 0.25, sh: 0.3, tb: 0.5, r: 0.3, wh: 0.4, wl: 0.45, tH: 0.3, tM: 0.3, tL: 0.3, cr: 0.12,
};

const mtof = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** Gain(s) whose linear ramps are tracked, so a new fade always starts from the true current value. */
class Fader {
  private readonly nodes: GainNode[];
  private from: number;
  private to: number;
  private t0 = 0;
  private t1 = 0;
  constructor(nodes: GainNode | GainNode[], value: number) {
    this.nodes = Array.isArray(nodes) ? nodes : [nodes];
    this.from = this.to = value;
    for (const n of this.nodes) n.gain.value = value;
  }
  get target(): number {
    return this.to;
  }
  valueAt(t: number): number {
    if (t >= this.t1) return this.to;
    if (t <= this.t0) return this.from;
    return this.from + ((this.to - this.from) * (t - this.t0)) / (this.t1 - this.t0);
  }
  fade(to: number, t: number, dur: number): void {
    const v = this.valueAt(t);
    for (const n of this.nodes) {
      const p = n.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(v, t);
      p.linearRampToValueAtTime(to, t + dur);
    }
    this.from = v;
    this.to = to;
    this.t0 = t;
    this.t1 = t + dur;
  }
}

interface Layer {
  def: PartDef;
  fader: Fader;
  input: AudioNode;
  silentAfter: number;
  hat?: BiquadFilterNode;
  snare?: BiquadFilterNode;
  shaker?: BiquadFilterNode;
}

interface Queued { time: number; ev: NoteEvent }

class SongPlayer {
  readonly out: GainNode;
  /** Echo sends leave through here, so they fade with the song. */
  readonly sendBus: GainNode;
  readonly fader: Fader;
  readonly layers = new Map<string, Layer>();
  readonly barDur: number;
  readonly beat: number;
  private readonly nodes: AudioNode[] = [];
  private readonly lfos: OscillatorNode[] = [];
  bar = 0;
  barTime: number;
  queue: Queued[] = [];
  cutoff = Infinity;
  disposeAt = Infinity;

  constructor(ctx: BaseAudioContext, readonly world: number, readonly song: SongDef, dest: AudioNode, echo: AudioNode, start: number, intensity: number) {
    this.beat = 60 / song.bpm;
    this.barDur = this.beat * BEATS_PER_BAR;
    this.barTime = start;
    this.out = ctx.createGain();
    this.sendBus = ctx.createGain();
    this.fader = new Fader([this.out, this.sendBus], 0);
    this.out.connect(dest);
    this.sendBus.connect(echo);
    const c = ctx;
    for (const p of song.parts) {
      const g = c.createGain();
      const fader = new Fader(g, mixAt(p, intensity) * song.trim);
      this.nodes.push(g);
      let tail: AudioNode = g;
      if (p.pan !== undefined || p.autopan) {
        if (typeof c.createStereoPanner === 'function') {
          const pan = c.createStereoPanner();
          pan.pan.value = p.pan ?? 0;
          if (p.autopan) {
            const lfo = c.createOscillator();
            lfo.frequency.value = p.autopan[0];
            const depth = c.createGain();
            depth.gain.value = p.autopan[1];
            lfo.connect(depth).connect(pan.pan);
            lfo.start(start);
            this.lfos.push(lfo);
            this.nodes.push(depth);
          }
          g.connect(pan);
          tail = pan;
          this.nodes.push(pan);
        }
      }
      tail.connect(this.out);
      if (p.echo) {
        const send = c.createGain();
        send.gain.value = p.echo;
        g.connect(send).connect(this.sendBus);
        this.nodes.push(send);
      }
      let input: AudioNode = g;
      if (p.lowpass) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = p.lowpass;
        f.Q.value = 0.5;
        f.connect(g);
        input = f;
        this.nodes.push(f);
      }
      const layer: Layer = { def: p, fader, input, silentAfter: fader.target > 1e-4 ? Infinity : -Infinity };
      if (p.kind === 'kit') {
        const filt = (type: BiquadFilterType, freq: number, q: number) => {
          const f = c.createBiquadFilter();
          f.type = type;
          f.frequency.value = freq;
          f.Q.value = q;
          f.connect(g);
          this.nodes.push(f);
          return f;
        };
        layer.hat = filt('highpass', song.kitTone.hat, 0.7);
        layer.snare = filt('highpass', song.kitTone.snare[0], 0.6);
        layer.shaker = filt('bandpass', 6500, 0.9);
      }
      this.layers.set(p.id, layer);
    }
  }

  setIntensity(intensity: number, t: number): void {
    for (const layer of this.layers.values()) {
      const target = mixAt(layer.def, intensity) * this.song.trim;
      if (Math.abs(target - layer.fader.target) < 1e-6) continue;
      layer.fader.fade(target, t, LAYER_FADE);
      layer.silentAfter = target > 1e-4 ? Infinity : t + LAYER_FADE;
    }
  }

  audible(part: string, t: number): boolean {
    const l = this.layers.get(part);
    return !!l && (l.fader.target > 1e-4 || t < l.silentAfter);
  }

  /** Stop the layer LFOs (auto-pan) at time t. */
  endAt(t: number): void {
    for (const l of this.lfos) {
      try {
        l.stop(t);
      } catch {
        /* already stopped */
      }
    }
  }

  dispose(): void {
    for (const l of this.lfos) {
      try {
        l.stop();
      } catch {
        /* already stopped */
      }
    }
    this.out.disconnect();
    this.sendBus.disconnect();
    for (const n of this.nodes) n.disconnect();
  }
}

const mixAt = (p: PartDef, i: number): number => p.mix[0] + (p.mix[1] - p.mix[0]) * i;

export class MusicEngine {
  private readonly master: GainNode;
  private readonly limiter: WaveShaperNode;
  private readonly echoIn: GainNode;
  private readonly delay: DelayNode;
  private readonly echoFb: GainNode;
  private readonly echoWet: GainNode;
  private readonly echoTone: BiquadFilterNode;
  private readonly echoPan: AudioNode;
  private readonly waves = new Map<VoiceId, PeriodicWave>();
  private readonly offline: boolean;
  private readonly rnd = prng(0x5eed);
  private players: SongPlayer[] = [];
  private current: SongPlayer | null = null;
  private intensity = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private live: { src: AudioScheduledSourceNode; end: number }[] = [];
  /** Counters for tests and in-page instruments: nodes created per note, notes per part. */
  readonly stats = { nodes: 0, notes: 0, dropped: 0, byPart: {} as Record<string, number> };

  constructor(private readonly ctx: BaseAudioContext, out: AudioNode, private readonly noise: AudioBuffer) {
    const c = ctx;
    this.offline = typeof (c as Partial<OfflineAudioContext>).startRendering === 'function';
    this.master = c.createGain();
    this.master.gain.value = LEVEL;
    this.limiter = c.createWaveShaper();
    this.limiter.curve = limiterCurve();
    this.master.connect(this.limiter);
    this.limiter.connect(out);
    // Shared echo: delay -> tone -> feedback, and a return into the master.
    this.echoIn = c.createGain();
    this.delay = c.createDelay(1.5);
    this.echoTone = c.createBiquadFilter();
    this.echoTone.type = 'lowpass';
    this.echoFb = c.createGain();
    this.echoWet = c.createGain();
    this.echoIn.connect(this.delay);
    this.delay.connect(this.echoTone);
    this.echoTone.connect(this.echoFb);
    this.echoFb.connect(this.delay);
    this.echoTone.connect(this.echoWet);
    // The echo returns slightly left, opposite the leads, for a little width.
    if (typeof c.createStereoPanner === 'function') {
      const pan = c.createStereoPanner();
      pan.pan.value = -0.25;
      this.echoPan = pan;
    } else this.echoPan = c.createGain();
    this.echoWet.connect(this.echoPan);
    this.echoPan.connect(this.master);
    this.echoFb.gain.value = 0;
    this.echoWet.gain.value = 0;
  }

  /** Start (or switch to) the song for a world; intensity 0 = menu arrangement, 1 = full band while driving. */
  setSong(world: number, intensity: number): void {
    const w = SONGS[world] ? world : 1;
    const i = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 0));
    const now = this.ctx.currentTime;
    if (this.current && this.current.world === w) {
      if (i !== this.intensity) this.current.setIntensity(i, now);
    } else {
      const first = !this.current;
      if (this.current) this.fadeOut(this.current, now, SONG_FADE_OUT, now + SONG_FADE_OUT);
      const song = SONGS[w];
      const p = new SongPlayer(this.ctx, w, song, this.master, this.echoIn, now + 0.06, i);
      p.fader.fade(1, now, first ? FIRST_FADE_IN : SONG_FADE_IN);
      this.players.push(p);
      this.current = p;
      const e = song.echo;
      this.delay.delayTime.setTargetAtTime(e.beats * p.beat, now, first ? 0.001 : 0.15);
      this.echoFb.gain.setTargetAtTime(e.feedback, now, 0.1);
      this.echoWet.gain.setTargetAtTime(e.wet, now, 0.1);
      this.echoTone.frequency.setTargetAtTime(e.tone, now, 0.1);
    }
    this.intensity = i;
    if (!this.offline && !this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Fade everything out and stop scheduling; nothing keeps sounding after the fade. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    for (const p of this.players) if (p.cutoff > now) this.fadeOut(p, now, STOP_FADE, now);
    this.echoWet.gain.setTargetAtTime(0, now, STOP_FADE / 4);
    const end = now + STOP_FADE + 0.02;
    for (const l of this.live) {
      if (l.end <= end) continue;
      try {
        l.src.stop(end);
      } catch {
        /* already stopped */
      }
      l.end = end;
    }
    this.current = null;
  }

  /** Schedule every note that starts before `time` (audio-clock seconds). Works on an OfflineAudioContext before rendering. */
  scheduleUntil(time: number): void {
    const now = this.ctx.currentTime;
    this.reap(now);
    for (const p of this.players) this.schedulePlayer(p, now, time);
  }

  private tick(): void {
    if (this.ctx.state === 'running') this.scheduleUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  private fadeOut(p: SongPlayer, now: number, dur: number, cutoff: number): void {
    p.fader.fade(0, now, dur);
    p.cutoff = Math.min(p.cutoff, cutoff);
    p.disposeAt = now + dur + 3;
    p.endAt(now + dur + 1);
    if (this.current === p) this.current = null;
  }

  private reap(now: number): void {
    if (this.live.length > 64) this.live = this.live.filter((l) => l.end > now);
    if (!this.players.some((p) => p.disposeAt <= now)) return;
    this.players = this.players.filter((p) => {
      if (p.disposeAt > now) return true;
      p.dispose();
      return false;
    });
  }

  private schedulePlayer(p: SongPlayer, now: number, horizon: number): void {
    if (p.cutoff <= now) {
      p.queue = [];
      return;
    }
    const limit = Math.min(horizon, p.cutoff);
    // A throttled background tab can fall far behind: jump whole bars (keeping the beat grid)
    // instead of playing everything that was missed in one burst.
    if (p.barTime + p.barDur < now - LATE) {
      const k = Math.floor((now - p.barTime) / p.barDur);
      p.bar += k;
      p.barTime += k * p.barDur;
      this.stats.dropped += p.queue.length;
      p.queue = [];
    }
    while (p.barTime < limit) {
      const evs = barEvents(p.song, p.bar);
      for (const ev of evs) p.queue.push({ time: p.barTime + ev.t * p.beat, ev });
      p.bar++;
      p.barTime += p.barDur;
    }
    let i = 0;
    for (; i < p.queue.length; i++) {
      const q = p.queue[i];
      if (q.time >= limit) break;
      if (q.time < now - LATE) {
        this.stats.dropped++;
        continue;
      }
      if (!p.audible(q.ev.part, q.time)) continue;
      this.play(p, q.ev, Math.max(q.time, now));
    }
    if (i) p.queue.splice(0, i);
    if (p.cutoff <= limit) p.queue = [];
  }

  private play(p: SongPlayer, ev: NoteEvent, t: number): void {
    const layer = p.layers.get(ev.part)!;
    this.stats.notes++;
    this.stats.byPart[ev.part] = (this.stats.byPart[ev.part] ?? 0) + 1;
    if (ev.drum) this.drum(layer, ev.drum, t, ev.v, p.song);
    else if (layer.def.voice) this.note(layer.input, layer.def.voice, ev.n, t, ev.d * p.beat, ev.v, ev.from);
  }

  private wave(id: VoiceId): PeriodicWave | null {
    const v = VOICES[id];
    if (!v.partials) return null;
    let w = this.waves.get(id);
    if (!w) {
      const n = v.partials.length + 1;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      v.partials.forEach((a, i) => (imag[i + 1] = a));
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(id, w);
    }
    return w;
  }

  private track(src: AudioScheduledSourceNode, end: number): void {
    this.live.push({ src, end });
  }

  private note(dest: AudioNode, id: VoiceId, midi: number, t: number, dur: number, vel: number, from?: number): void {
    const c = this.ctx;
    const v = VOICES[id];
    const o = c.createOscillator();
    const w = this.wave(id);
    if (w) o.setPeriodicWave(w);
    else o.type = v.type ?? 'sine';
    const mul = v.mul ?? 1;
    const f = mtof(midi) * mul;
    if (from !== undefined) {
      o.frequency.setValueAtTime(mtof(from) * mul, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    } else o.frequency.value = f;
    const g = c.createGain();
    this.stats.nodes += 2;
    let out: AudioNode = dest;
    if (v.cut) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.Q.value = v.cut[3];
      fl.frequency.setValueAtTime(v.cut[0], t);
      fl.frequency.setTargetAtTime(v.cut[1], t + 0.004, v.cut[2]);
      fl.connect(dest);
      out = fl;
      this.stats.nodes++;
    }
    o.connect(g).connect(out);
    const peak = v.level * Math.pow(vel, 1.3);
    const gp = g.gain;
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(peak, t + v.a);
    let end: number;
    if (v.s > 0) {
      gp.setTargetAtTime(peak * v.s, t + v.a, v.d / 3);
      const rel = Math.max(t + v.a + 0.01, t + dur);
      gp.setTargetAtTime(0, rel, v.r / 6);
      end = rel + v.r;
    } else {
      // Percussive: rings for a pitch-dependent time unless the note is damped earlier.
      const ring = v.d * Math.min(1.6, Math.max(0.6, Math.pow(2, (72 - midi) / 24)));
      gp.setTargetAtTime(0, t + v.a, ring / 6);
      end = t + v.a + ring;
      if (dur + v.r < ring) {
        const rel = Math.max(t + v.a + 0.01, t + dur);
        gp.setTargetAtTime(0, rel, v.r / 6);
        end = rel + v.r;
      }
    }
    if (v.bend) {
      o.detune.setValueAtTime(-v.bend, t);
      o.detune.setTargetAtTime(0, t, 0.025);
    }
    if (v.vib) {
      const [depth, rate, delay] = v.vib;
      const len = end - (t + delay);
      if (dur > delay + 0.2 && len > 0.2) {
        const pts = Math.ceil(len * rate * 8) + 2;
        const curve = new Float32Array(pts);
        for (let k = 0; k < pts; k++) {
          const x = (k / (pts - 1)) * len;
          curve[k] = depth * Math.min(1, x / 0.25) * Math.sin(2 * Math.PI * rate * x);
        }
        o.detune.setValueCurveAtTime(curve, t + delay, len);
      }
    }
    o.start(t);
    o.stop(end + 0.02);
    this.track(o, end + 0.02);
  }

  /** A noise burst of `len` seconds from a seeded offset into the shared noise buffer. */
  private noiseSrc(t: number, len: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.start(t, this.rnd() * Math.max(0, this.noise.duration - len * rate - 0.01));
    return s;
  }

  private drum(layer: Layer, id: DrumId, t: number, vel: number, song: SongDef): void {
    const c = this.ctx;
    const peak = DRUM_LEVEL[id] * Math.pow(vel, 1.4);
    const g = c.createGain();
    const gp = g.gain;
    this.stats.nodes += 2;
    const pitched = (f0: number, f1: number, sweep: number, decay: number, type: OscillatorType, dest: AudioNode) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
      gp.setValueAtTime(0, t);
      gp.linearRampToValueAtTime(peak, t + 0.002);
      gp.setTargetAtTime(0, t + 0.004, decay / 6);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + decay + 0.03);
      this.track(o, t + decay + 0.03);
    };
    const noisy = (dest: AudioNode, attack: number, decay: number, rate = 1) => {
      const s = this.noiseSrc(t, attack + decay + 0.02, rate);
      gp.setValueAtTime(0, t);
      gp.linearRampToValueAtTime(peak, t + attack);
      gp.setTargetAtTime(0, t + attack, decay / 6);
      s.connect(g).connect(dest);
      s.stop(t + attack + decay + 0.02);
      this.track(s, t + attack + decay + 0.02);
    };
    const kt = song.kitTone;
    switch (id) {
      case 'k': pitched(kt.kick[0], kt.kick[1], 0.06, kt.kick[2], 'sine', layer.input); break;
      case 'tH': pitched(260, 180, 0.08, 0.26, 'sine', layer.input); break;
      case 'tM': pitched(200, 135, 0.08, 0.28, 'sine', layer.input); break;
      case 'tL': pitched(150, 98, 0.09, 0.3, 'sine', layer.input); break;
      case 'wh': pitched(1250, 1180, 0.03, 0.06, 'sine', layer.input); break;
      case 'wl': pitched(880, 830, 0.03, 0.07, 'sine', layer.input); break;
      case 'r': pitched(1700, 1500, 0.01, 0.03, 'triangle', layer.input); break;
      case 'h': noisy(layer.hat!, 0.001, 0.07); break;
      case 'o': noisy(layer.hat!, 0.002, 0.28); break;
      case 'cr': noisy(layer.hat!, 0.002, 1.6, 0.8); break;
      case 'sh': noisy(layer.shaker!, 0.012, 0.09); break;
      case 'tb': noisy(layer.shaker!, 0.002, 0.12, 1.3); break;
      case 's': {
        noisy(layer.snare!, 0.002, kt.snare[1]);
        // Body: a short pitched thump under the noise.
        const o = c.createOscillator();
        const bg = c.createGain();
        this.stats.nodes += 2;
        o.type = 'triangle';
        o.frequency.setValueAtTime(210, t);
        o.frequency.exponentialRampToValueAtTime(165, t + 0.05);
        bg.gain.setValueAtTime(peak * 0.5, t);
        bg.gain.setTargetAtTime(0, t + 0.002, 0.018);
        o.connect(bg).connect(layer.input);
        o.start(t);
        o.stop(t + 0.14);
        this.track(o, t + 0.14);
        break;
      }
      case 'c': {
        // Clap: three quick bursts and a short tail on one noise source.
        const s = this.noiseSrc(t, 0.2, 1.1);
        gp.setValueAtTime(peak, t);
        gp.setTargetAtTime(0, t, 0.003);
        gp.setValueAtTime(peak * 0.8, t + 0.011);
        gp.setTargetAtTime(0, t + 0.011, 0.003);
        gp.setValueAtTime(peak, t + 0.022);
        gp.setTargetAtTime(0, t + 0.022, 0.025);
        s.connect(g).connect(layer.snare!);
        s.stop(t + 0.2);
        this.track(s, t + 0.2);
        break;
      }
    }
  }
}
