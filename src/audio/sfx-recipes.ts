/**
 * The cargo-related one-shots: pickup, spill, shed, full, bank, coin, squish, damage, near miss.
 * Each recipe schedules short-lived voices at time `t` and returns the time its tail ends, which
 * AudioManager uses to cap overlapping instances.
 */
import { materialOf, pickupNote, spillClatter, spillThuds, type Material } from './sfx-cargo';
import { midi, type Voices } from './sfx-voices';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** The sound of an item landing on the stack (or getting knocked), by material. */
export function materialHit(v: Voices, mat: Material, t: number, k: number, world: number): number {
  switch (mat) {
    case 'card': // cardboard thunk
      v.noise(0.08, 850, 0.34 * k, t, 'lowpass', { q: 0.8 });
      return v.thump(105, 0.12, 0.3 * k, t);
    case 'wood': // hollow wooden "tok"
      v.noise(0.035, 1700, 0.3 * k, t, 'bandpass', { q: 2.2 });
      v.tone(1330, 0.05, 'sine', 0.07 * k, t, { attack: 0.001 });
      return v.tone(540, 0.11, 'sine', 0.24 * k, t, { to: 480, glide: 0.09, attack: 0.001 });
    case 'plush': // soft "fwump"
      v.noise(0.16, 380, 0.44 * k, t, 'lowpass', { q: 0.5, attack: 0.01 });
      return v.thump(80, 0.18, 0.32 * k, t);
    case 'rubber': // a squeaky "boing"
      v.thump(95, 0.1, 0.22 * k, t);
      return v.tone(170, 0.26, 'sine', 0.2 * k, t + 0.01, { to: 460, glide: 0.12, attack: 0.004, vib: 140, vibRate: 22 });
    case 'ceramic': // clay pot "clonk"
      v.noise(0.02, 3200, 0.2 * k, t, 'highpass');
      return v.partials(930, [1, 2.37, 4.1], [0.15 * k, 0.07 * k, 0.035 * k], [0.15, 0.09, 0.05], t);
    case 'metal': // appliance "clang"
      v.noise(0.03, 2500, 0.22 * k, t, 'bandpass', { q: 1.5 });
      v.thump(120, 0.12, 0.22 * k, t);
      return v.partials(300, [1, 2.76, 5.4, 8.93], [0.12 * k, 0.08 * k, 0.05 * k, 0.03 * k], [0.45, 0.32, 0.18, 0.1], t);
    case 'glass': // "clink"
      v.noise(0.015, 5200, 0.14 * k, t, 'highpass');
      v.thump(110, 0.09, 0.2 * k, t);
      return v.partials(2380, [1, 1.52, 2.33], [0.09 * k, 0.06 * k, 0.035 * k], [0.34, 0.24, 0.14], t + 0.004);
    case 'cake': // soft "splosh"
      v.noise(0.17, 1300, 0.34 * k, t, 'lowpass', { to: 260, q: 3 });
      return v.tone(260, 0.13, 'sine', 0.2 * k, t, { to: 120, attack: 0.004 });
    case 'paper': // rustle
      v.thump(120, 0.08, 0.18 * k, t);
      v.noise(0.06, 3000, 0.2 * k, t, 'highpass', { q: 0.7 });
      return v.noise(0.07, 2400, 0.16 * k, t + 0.045, 'bandpass', { q: 1 });
    case 'piano': { // a wooden knock plus a low "plunk" chord in the world's key
      v.noise(0.04, 1500, 0.26 * k, t, 'bandpass', { q: 2 });
      v.thump(90, 0.14, 0.3 * k, t);
      const root = world === 2 ? 40 : world === 3 ? 38 : 45;
      let end = t;
      for (const n of [12, 19, 24]) end = Math.max(end, v.tone(midi(root + n), 0.75, 'triangle', 0.07 * k, t + 0.012, { lp: 1600, attack: 0.003 }));
      return end;
    }
  }
}

/** Pickup: "plonk" + material layer + rising two-note chime climbing with the stack. */
export function pickupSfx(v: Voices, t: number, height: number | undefined, cargo: string | undefined, world: number): number {
  const mat = materialOf(cargo);
  const n1 = pickupNote(height, world);
  const lift = Math.pow(2, (n1 - pickupNote(1, world)) / 24); // the plonk climbs at half the chime's rate
  v.thump(165 * lift, 0.16, 0.36, t);
  let end = materialHit(v, mat, t, 0.85, world);
  v.chime(midi(n1), 0.3, 0.2, t + 0.045);
  end = Math.max(end, v.chime(midi(n1 + 7), 0.48, 0.22, t + 0.11));
  if (cargo === 'gnome') {
    // Golden Gnome: a sparkle arpeggio and shimmer on top.
    [12, 16, 19, 24].forEach((n, i) => { end = Math.max(end, v.chime(midi(n1 + n), 0.32, 0.09, t + 0.2 + i * 0.05)); });
    v.noise(0.45, 7000, 0.06, t + 0.18, 'highpass', { attack: 0.08 });
  }
  return end;
}

/** Accidental spill: descending slide-whistle "whoop", clatter, then ground thuds (the first in the lost item's material). */
export function spillSfx(v: Voices, t: number, count: number | undefined, strength: number, cargo: string | undefined, world: number): number {
  const k = Math.max(0.6, Math.min(1.25, strength));
  v.tone(1500, 0.58, 'sine', 0.22 * k, t, { to: 290, glide: 0.52, attack: 0.03, hold: 0.32, vib: 40, vibRate: 7 });
  v.tone(3000, 0.5, 'sine', 0.03 * k, t, { to: 580, glide: 0.52, attack: 0.03, hold: 0.26 });
  const ticks = spillClatter(count);
  for (let i = 0; i < ticks; i++) {
    const tt = t + 0.02 + i * 0.045 + rnd(0, 0.025);
    v.noise(0.045, rnd(1300, 3400), rnd(0.13, 0.19) * k, tt, 'bandpass', { q: 2 });
    if (i % 2 === 0) v.tone(rnd(480, 820), 0.05, 'sine', 0.09 * k, tt, { attack: 0.001 });
  }
  const thuds = spillThuds(count);
  let end = t + 0.6;
  for (let i = 0; i < thuds; i++) {
    const tt = t + 0.36 + i * 0.07 + rnd(0, 0.02);
    if (i === 0) {
      v.noise(0.1, 360, 0.24 * k, tt, 'lowpass');
      end = Math.max(end, materialHit(v, materialOf(cargo), tt, 0.6 * k, world));
    }
    end = Math.max(end, v.thump(rnd(68, 92), 0.22, 0.4 * k, tt));
  }
  return end;
}

/** Deliberate shed: an upward whoosh, a bright "pop" and a rising pling; a smart shed adds a flourish. */
export function shedSfx(v: Voices, t: number, hero: boolean): number {
  v.noise(0.2, 520, 0.5, t, 'bandpass', { to: 3400, q: 1.3, attack: 0.07 });
  const tp = t + 0.1;
  v.tone(1150, 0.08, 'sine', 0.45, tp, { to: 300, glide: 0.045, attack: 0.002 });
  v.noise(0.014, 4200, 0.28, tp, 'highpass');
  v.chime(midi(88), 0.24, 0.2, tp + 0.035);
  let end = v.chime(midi(95), 0.34, 0.18, tp + 0.085);
  if (hero) {
    [88, 92, 95, 100].forEach((n, i) => { end = Math.max(end, v.chime(midi(n), 0.28, 0.1, tp + 0.17 + i * 0.045)); });
    v.noise(0.3, 7500, 0.05, tp + 0.15, 'highpass', { attack: 0.05 });
  }
  return end;
}

/** Truck full: a soft "nuh-uh" double buzz, the second one lower. */
export function fullSfx(v: Voices, t: number): number {
  v.tone(311, 0.14, 'reed', 0.17, t, { lp: 1500, attack: 0.008, hold: 0.07 });
  v.tone(155.5, 0.14, 'sine', 0.13, t, { attack: 0.008, hold: 0.07 });
  v.tone(233, 0.19, 'reed', 0.17, t + 0.17, { lp: 1200, attack: 0.008, hold: 0.09 });
  return v.tone(116.5, 0.19, 'sine', 0.13, t + 0.17, { attack: 0.008, hold: 0.09 });
}

/** Delivery cashed: register "ka" + bright "ching" + a shower of coins (more coins for more items). */
export function bankSfx(v: Voices, t: number, count: number | undefined): number {
  v.noise(0.03, 2300, 0.36, t, 'bandpass', { q: 1.6 });
  v.thump(130, 0.1, 0.34, t);
  v.noise(0.06, 900, 0.2, t + 0.035, 'bandpass', { q: 3 });
  const tc = t + 0.075;
  // Two slightly detuned partials beat slowly, like a real bell.
  let end = v.partials(2637, [1, 1.0026, 1.5, 2.0], [0.15, 0.11, 0.06, 0.05], [0.75, 0.75, 0.42, 0.3], tc);
  v.partials(1976, [1, 2.0], [0.12, 0.04], [0.55, 0.3], tc + 0.004);
  const n = Math.max(3, Math.min(6, Math.round(count ?? 5)));
  v.noise(0.06 * n, 6500, 0.045, tc + 0.09, 'highpass', { attack: 0.02 });
  for (let i = 0; i < n; i++) {
    const tt = tc + 0.09 + i * 0.05 + rnd(0, 0.03);
    end = Math.max(end, v.tone(rnd(3000, 4900), 0.08, 'sine', rnd(0.07, 0.1), tt, { attack: 0.001 }));
  }
  return end;
}

/** Road coin: a bright two-step "ba-ding"; `step` (semitones) climbs along a coin line. */
export function coinSfx(v: Voices, t: number, step: number): number {
  const f = 988 * Math.pow(2, step / 12);
  return v.blip(f, f * 4 / 3, 0.045, 0.17, 'coin', 0.28, t);
}

/** Squished cargo: a comedic wet squelch with a "blorp" back up. */
export function squishSfx(v: Voices, t: number): number {
  v.noise(0.24, 2300, 0.4, t, 'lowpass', { to: 220, q: 5, attack: 0.01 });
  v.tone(470, 0.2, 'sine', 0.24, t, { to: 95, glide: 0.15, attack: 0.006 });
  return v.tone(170, 0.12, 'sine', 0.15, t + 0.16, { to: 330, glide: 0.08, attack: 0.006 });
}

/** Cargo damaged by a jolt: a short crack or crunch by material. */
export function damageSfx(v: Voices, t: number, cargo: string | undefined, k: number): number {
  switch (materialOf(cargo)) {
    case 'glass': { // crack + tinkle
      v.noise(0.09, 3600, 0.24 * k, t, 'highpass', { hold: 0.012 });
      let end = t;
      for (let i = 0; i < 4; i++) end = Math.max(end, v.tone(rnd(2800, 5600), 0.12, 'sine', 0.07 * k, t + 0.012 + i * 0.028, { attack: 0.001 }));
      return end;
    }
    case 'metal': // dent
      v.thump(190, 0.1, 0.36 * k, t);
      return v.noise(0.1, 900, 0.32 * k, t, 'bandpass', { q: 3, hold: 0.012 });
    case 'cake': // squash
      v.tone(300, 0.12, 'sine', 0.2 * k, t, { to: 120, attack: 0.004 });
      return v.noise(0.14, 900, 0.36 * k, t, 'lowpass', { to: 250, q: 3, hold: 0.015 });
    case 'plush':
    case 'paper': // muffled crunch
      v.thump(90, 0.09, 0.22 * k, t);
      return v.noise(0.13, 1500, 0.6 * k, t, 'lowpass', { hold: 0.025 });
    default: // wood, cardboard, ceramic, rubber, piano: a dry crack and a splinter
      v.noise(0.01, 6000, 0.16 * k, t, 'highpass');
      v.thump(140, 0.07, 0.22 * k, t);
      v.noise(0.08, 2200, 0.55 * k, t, 'bandpass', { q: 0.8, hold: 0.02 });
      return v.noise(0.11, 1100, 0.4 * k, t + 0.025, 'bandpass', { q: 1.2, hold: 0.012 });
  }
}

/** Near miss / close shave: a quick rising "zip". */
export function nearMissSfx(v: Voices, t: number): number {
  v.noise(0.22, 700, 0.42, t, 'bandpass', { to: 3600, q: 1.2, attack: 0.05 });
  return v.tone(520, 0.2, 'sine', 0.18, t, { to: 1900, attack: 0.02 });
}
