/**
 * Lightweight procedural audio (no external assets). Everything is synthesised with WebAudio:
 * engine loop, tyre squeal, wind, one-shot effects and a restrained per-world music loop.
 * Mute is the union of independent reasons ('platform', 'ad', 'hidden', 'user') so ending one
 * reason never cancels another.
 */
export type Sfx =
  | 'coin' | 'pickup' | 'full' | 'shed' | 'spill' | 'impact' | 'bump' | 'scrape' | 'nearMiss' | 'recovery'
  | 'launch' | 'land' | 'crash' | 'finish' | 'bank' | 'purchase' | 'click' | 'error' | 'count' | 'go' | 'medal' | 'squish' | 'rumble';

interface Voice {
  osc: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
}

const SCALES: Record<number, { root: number; scale: number[]; bpm: number; prog: number[] }> = {
  1: { root: 57, scale: [0, 2, 4, 7, 9], bpm: 112, prog: [0, 5, 3, 4] }, // A major pentatonic, breezy
  2: { root: 52, scale: [0, 3, 5, 7, 10], bpm: 104, prog: [0, 3, 5, 3] }, // E minor pentatonic, twangy
  3: { root: 50, scale: [0, 2, 3, 7, 9], bpm: 96, prog: [0, 5, 3, 6] }, // D dorian-ish, night-market lo-fi
};

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noise!: AudioBuffer;
  private engine: Voice | null = null;
  private tire: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private reasons = new Set<string>();
  private vol = { master: 0.8, music: 0.55, sfx: 0.8 };
  private seqTimer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private step = 0;
  private world = 1;
  private intensity = 0; // 0 menu, 1 driving
  private musicOn = false;
  private lastPlay = new Map<Sfx, number>();
  unlocked = false;

  /** Create/resume the context. Must be called from a user gesture on first use (iOS). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
      this.unlocked = true;
    } catch {
      /* audio unavailable: game stays playable */
    }
  }

  private build(): void {
    const c = this.ctx!;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = c.createGain();
    this.music = c.createGain();
    this.sfx = c.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
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
    ramp(this.music, this.vol.music * 0.32);
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
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 27.5;
    const o2g = c.createGain();
    o2g.gain.value = 0.5;
    o1.connect(filter);
    o2.connect(o2g).connect(filter);
    filter.connect(gain).connect(this.sfx);
    o1.start();
    o2.start();
    this.engine = { osc: [o1, o2], gain, filter };
    const tsrc = c.createBufferSource();
    tsrc.buffer = this.noise;
    tsrc.loop = true;
    const tf = c.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 1800;
    tf.Q.value = 6;
    const tg = c.createGain();
    tg.gain.value = 0;
    tsrc.connect(tf).connect(tg).connect(this.sfx);
    tsrc.start();
    this.tire = { src: tsrc, gain: tg, filter: tf };
    const wsrc = c.createBufferSource();
    wsrc.buffer = this.noise;
    wsrc.loop = true;
    wsrc.playbackRate.value = 0.5;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    const wg = c.createGain();
    wg.gain.value = 0;
    wsrc.connect(wf).connect(wg).connect(this.sfx);
    wsrc.start();
    this.wind = { src: wsrc, gain: wg };
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

  /** speed m/s, slip 0..1, load 0..1, wind 0..1, rattle 0..1 */
  updateDrive(speed: number, slip: number, load: number, wind: number, airborne: boolean): void {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const rpm = 0.35 + Math.min(1, speed / 26) * 0.65;
    const f = 42 + rpm * 70 + (airborne ? 18 : 0);
    this.engine.osc[0].frequency.setTargetAtTime(f, t, 0.08);
    this.engine.osc[1].frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(350 + rpm * 900 + load * 200, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(0.09 + rpm * 0.05, t, 0.1);
    this.tire?.gain.gain.setTargetAtTime(Math.min(0.12, slip * 0.12), t, 0.05);
    this.wind?.gain.gain.setTargetAtTime(Math.min(0.25, wind * 0.22 + speed * 0.002), t, 0.2);
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

  // ------------------------------------------------------------------ one-shots
  play(name: Sfx, strength = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const minGap = name === 'coin' ? 35 : name === 'rumble' ? 250 : 60;
    if (now - (this.lastPlay.get(name) ?? -1e9) < minGap) return;
    this.lastPlay.set(name, now);
    const c = this.ctx;
    const t = c.currentTime + 0.005;
    switch (name) {
      case 'coin': this.tone(1320, 0.07, 'square', 0.06, t); this.tone(1760, 0.09, 'square', 0.05, t + 0.05); break;
      case 'pickup': this.thump(160, 0.12, 0.35, t); this.tone(660, 0.08, 'triangle', 0.12, t + 0.03); this.tone(990, 0.1, 'triangle', 0.1, t + 0.08); break;
      case 'full': this.tone(220, 0.15, 'square', 0.06, t); this.tone(180, 0.15, 'square', 0.06, t + 0.12); break;
      case 'shed': this.sweep(900, 200, 0.25, 'triangle', 0.12, t); this.noiseHit(0.18, 1200, 0.12, t + 0.1); break;
      case 'spill': this.noiseHit(0.25, 700, 0.25 * strength, t); this.thump(90, 0.2, 0.3, t + 0.05); break;
      case 'impact': this.noiseHit(0.18, 900, 0.3 * strength, t); this.thump(70, 0.25, 0.45 * strength, t); break;
      case 'bump': this.thump(80, 0.12, 0.28, t); this.rattle(4, t + 0.04); break;
      case 'scrape': this.noiseHit(0.3, 3200, 0.16 * Math.min(1.5, strength), t, 'highpass'); break;
      case 'nearMiss': this.sweep(400, 1600, 0.22, 'sine', 0.08, t); this.noiseHit(0.22, 2400, 0.06, t, 'bandpass'); break;
      case 'recovery': [0, 4, 7, 12].forEach((n, i) => this.tone(midi(72 + n), 0.12, 'triangle', 0.09, t + i * 0.06)); break;
      case 'launch': this.sweep(200, 520, 0.3, 'sawtooth', 0.05, t); break;
      case 'land': this.thump(60, 0.22, 0.4 * Math.min(1.5, strength), t); this.rattle(6, t + 0.05); break;
      case 'crash': this.noiseHit(0.7, 500, 0.45, t); this.thump(45, 0.5, 0.6, t); this.sweep(300, 60, 0.6, 'sawtooth', 0.08, t + 0.1); break;
      case 'finish': [0, 4, 7, 12, 16].forEach((n, i) => this.tone(midi(67 + n), 0.22, i % 2 ? 'square' : 'triangle', 0.08, t + i * 0.09)); break;
      case 'bank': this.tone(1568, 0.08, 'square', 0.06, t); this.tone(2093, 0.12, 'square', 0.06, t + 0.07); this.noiseHit(0.12, 5000, 0.05, t + 0.02, 'highpass'); break;
      case 'purchase': this.tone(988, 0.08, 'triangle', 0.1, t); this.tone(1319, 0.08, 'triangle', 0.1, t + 0.07); this.tone(1976, 0.18, 'triangle', 0.08, t + 0.14); break;
      case 'click': this.tone(880, 0.03, 'triangle', 0.05, t); break;
      case 'error': this.tone(140, 0.16, 'square', 0.06, t); break;
      case 'count': this.tone(660, 0.1, 'triangle', 0.1, t); break;
      case 'go': this.tone(990, 0.2, 'triangle', 0.12, t); break;
      case 'medal': [0, 7, 12, 19].forEach((n, i) => this.tone(midi(76 + n), 0.25, 'sine', 0.08, t + i * 0.07)); break;
      case 'squish': this.sweep(300, 90, 0.18, 'sine', 0.15, t); break;
      case 'rumble': this.noiseHit(0.08, 200, 0.12, t, 'lowpass'); break;
    }
  }

  /** Short cargo rattle: a few tiny clicks. */
  rattle(n = 3, at?: number): void {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    for (let i = 0; i < n; i++) this.noiseHit(0.03, 2500 + Math.random() * 2000, 0.04, t + i * 0.035 + Math.random() * 0.02, 'bandpass');
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sweep(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private thump(freq: number, dur: number, vol: number, t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(dur: number, freq: number, vol: number, t: number, type: BiquadFilterType = 'lowpass'): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ music
  setMusic(world: number, intensity: number): void {
    this.world = world;
    this.intensity = intensity;
    if (!this.ctx) return;
    if (!this.musicOn) {
      this.musicOn = true;
      this.nextNote = this.ctx.currentTime + 0.1;
      this.seqTimer = setInterval(() => this.schedule(), 50);
    }
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.seqTimer) clearInterval(this.seqTimer);
    this.seqTimer = null;
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const cfg = SCALES[this.world] ?? SCALES[1];
    const stepDur = 60 / cfg.bpm / 2; // eighth notes
    while (this.nextNote < c.currentTime + 0.15) {
      const t = this.nextNote;
      const bar = Math.floor(this.step / 8) % cfg.prog.length;
      const deg = cfg.prog[bar];
      const st = this.step % 8;
      const chordRoot = cfg.root + cfg.scale[deg % cfg.scale.length] + (deg >= cfg.scale.length ? 12 : 0);
      // bass on beats
      if (st % 2 === 0) this.musicTone(midi(chordRoot - 24 + (st === 6 ? 7 : 0)), stepDur * 1.6, 'triangle', 0.22, t);
      // plucked melody pattern
      const pattern = [0, 2, 4, 2, 3, 2, 4, 1];
      const ni = pattern[(st + bar) % 8];
      if (st !== 3 && (this.step % 16 !== 15)) {
        const note = cfg.root + cfg.scale[ni % cfg.scale.length] + 12 * Math.floor(ni / cfg.scale.length);
        this.musicTone(midi(note), stepDur * 0.9, this.world === 2 ? 'sawtooth' : 'square', 0.05, t, this.world === 2 ? 1400 : 1800);
      }
      // light drums while driving
      if (this.intensity > 0.5) {
        if (st === 0 || st === 4) this.kick(t);
        if (st % 2 === 1) this.hat(t, 0.025);
        if (st === 4) this.snare(t);
      } else if (st === 0) this.hat(t, 0.015);
      this.step++;
      this.nextNote += stepDur;
    }
  }

  private musicTone(freq: number, dur: number, type: OscillatorType, vol: number, t: number, cutoff = 2400): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }

  private snare(t: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random());
    s.stop(t + 0.15);
  }
}
