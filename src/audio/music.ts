/**
 * Procedural background music (no audio files). A lookahead scheduler queues notes slightly
 * ahead of the audio clock; everything is routed into the music bus handed in by AudioManager,
 * which owns volume and every mute reason.
 */
const SCALES: Record<number, { root: number; scale: number[]; bpm: number; prog: number[] }> = {
  1: { root: 57, scale: [0, 2, 4, 7, 9], bpm: 112, prog: [0, 5, 3, 4] }, // A major pentatonic, breezy
  2: { root: 52, scale: [0, 3, 5, 7, 10], bpm: 104, prog: [0, 3, 5, 3] }, // E minor pentatonic, twangy
  3: { root: 50, scale: [0, 2, 3, 7, 9], bpm: 96, prog: [0, 5, 3, 6] }, // D dorian-ish, night-market lo-fi
};

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class MusicEngine {
  private seqTimer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private step = 0;
  private world = 1;
  private intensity = 0;

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode, private readonly noise: AudioBuffer) {}

  /** Start (or switch to) the song for a world; intensity 0 = menu, 1 = driving. */
  setSong(world: number, intensity: number): void {
    this.world = world;
    this.intensity = intensity;
    if (!this.seqTimer) {
      this.nextNote = this.ctx.currentTime + 0.1;
      this.seqTimer = setInterval(() => this.schedule(), 50);
    }
  }

  stop(): void {
    if (this.seqTimer) clearInterval(this.seqTimer);
    this.seqTimer = null;
  }

  private schedule(): void {
    const c = this.ctx;
    if (c.state !== 'running') return;
    // A throttled background tab can fall behind: skip ahead instead of playing a burst of late notes.
    if (this.nextNote < c.currentTime - 0.05) this.nextNote = c.currentTime + 0.05;
    const cfg = SCALES[this.world] ?? SCALES[1];
    const stepDur = 60 / cfg.bpm / 2; // eighth notes
    while (this.nextNote < c.currentTime + 0.15) {
      const t = this.nextNote;
      const bar = Math.floor(this.step / 8) % cfg.prog.length;
      const deg = cfg.prog[bar];
      const st = this.step % 8;
      const chordRoot = cfg.root + cfg.scale[deg % cfg.scale.length] + (deg >= cfg.scale.length ? 12 : 0);
      if (st % 2 === 0) this.tone(midi(chordRoot - 24 + (st === 6 ? 7 : 0)), stepDur * 1.6, 'triangle', 0.22 * 0.32, t);
      const pattern = [0, 2, 4, 2, 3, 2, 4, 1];
      const ni = pattern[(st + bar) % 8];
      if (st !== 3 && this.step % 16 !== 15) {
        const note = cfg.root + cfg.scale[ni % cfg.scale.length] + 12 * Math.floor(ni / cfg.scale.length);
        this.tone(midi(note), stepDur * 0.9, this.world === 2 ? 'sawtooth' : 'square', 0.05 * 0.32, t, this.world === 2 ? 1400 : 1800);
      }
      if (this.intensity > 0.5) {
        if (st === 0 || st === 4) this.kick(t);
        if (st % 2 === 1) this.hat(t, 0.025 * 0.32);
        if (st === 4) this.snare(t);
      } else if (st === 0) this.hat(t, 0.015 * 0.32);
      this.step++;
      this.nextNote += stepDur;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, t: number, cutoff = 2400): void {
    const c = this.ctx;
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
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35 * 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }

  private snare(t: number): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.08 * 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 0.15);
  }
}
