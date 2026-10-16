/**
 * Music data types and the pure, deterministic event generator behind MusicEngine.
 * No WebAudio here: songs are written-out note data (melodies, chord charts, bass and comping
 * rhythms, drum grids) and barEvents() turns one bar of a song into timed note events. Light
 * variation on repeats comes from a seeded PRNG, so the same seed always yields the same music.
 */

export const BEATS_PER_BAR = 4;

export type VoiceId =
  | 'marimba' | 'flute' | 'glock' | 'uke' | 'upright' | 'pad'
  | 'twang' | 'whistle' | 'power' | 'steel' | 'pickbass'
  | 'ep' | 'sub' | 'synth' | 'vibes';

/** Drum grid keys. */
export type DrumId =
  | 'k' // kick
  | 's' // snare
  | 'c' // clap
  | 'h' // closed hat
  | 'o' // open hat
  | 'sh' // shaker
  | 'tb' // tambourine
  | 'r' // rim click
  | 'wh' // woodblock, high
  | 'wl' // woodblock, low
  | 'tH' | 'tM' | 'tL' // toms
  | 'cr'; // crash

export const DRUM_IDS: readonly DrumId[] = ['k', 's', 'c', 'h', 'o', 'sh', 'tb', 'r', 'wh', 'wl', 'tH', 'tM', 'tL', 'cr'];

export type DrumPattern = Partial<Record<DrumId, string>>;

export interface PartDef {
  /** Layer id (one GainNode per part in the engine). */
  id: string;
  kind: 'line' | 'comp' | 'pad' | 'bass' | 'kit';
  /** Which written line a 'line' part plays. */
  line?: 'lead' | 'counter';
  voice?: VoiceId;
  /** Layer gain at intensity 0 (menus) and 1 (driving). */
  mix: [number, number];
  pan?: number;
  /** Send level into the shared echo. */
  echo?: number;
  /** Layer tone filter (lowpass, Hz). */
  lowpass?: number;
  /** Shift a written line by octaves. */
  octave?: number;
  /** Pitch range for comp/pad voicings and bass placement. */
  range?: [number, number];
  /** Max simultaneous chord tones (comp/pad). */
  notes?: number;
  /** Comp plays only the chord root (with the power-chord voice). */
  root?: boolean;
  /** Fixed pattern for every bar (otherwise the section's pattern list for this part id). */
  pattern?: string;
  /** Fixed-pattern parts: pattern used on the last bar of each section. */
  fill?: string;
  /** Kit: crash cymbal on section downbeats. */
  crash?: boolean;
  /** Slow auto-pan on the layer: [rate Hz, depth 0..1]. */
  autopan?: [number, number];
  /** Velocity scale. */
  vel?: number;
}

export interface SectionDef {
  /** Bars separated by '|'; chords inside a bar split it evenly ("Dm7 G7"). */
  chords: string;
  /** Bars separated by '|'; tokens split each bar evenly: note names, '.' rest, '-' hold. */
  lead?: string;
  /** Alternate lead bars (bar index -> bar text), swapped in on some repeats (seeded). */
  leadAlt?: Record<number, string>;
  counter?: string;
  /** Per-part pattern names, cycled per bar. Kit parts may list alternatives "a|b" (seeded pick). '_' = tacet bar. */
  pat: Record<string, string[]>;
}

export interface KitTone {
  kick: [number, number, number]; // start Hz, end Hz, decay s
  snare: [number, number]; // noise highpass Hz, decay s
  hat: number; // highpass Hz
}

export interface SongDef {
  id: string;
  title: string;
  bpm: number;
  /** Position of the off-beat inside its pair (0.5 = straight). */
  swing: number;
  /** Which subdivision swings. */
  swingUnit: 8 | 16;
  seed: number;
  /** Output trim (linear). */
  trim: number;
  /** Shared echo: delay in beats, feedback, tone (lowpass Hz), return level. */
  echo: { beats: number; feedback: number; tone: number; wet: number };
  kitTone: KitTone;
  parts: PartDef[];
  bass: Record<string, string>;
  comp: Record<string, string>;
  kits: Record<string, DrumPattern>;
  sections: Record<string, SectionDef>;
  form: string[];
}

export interface NoteEvent {
  part: string;
  /** Start, in beats from the bar start (swing applied). */
  t: number;
  /** Length in beats. */
  d: number;
  /** MIDI note (0 for drums). */
  n: number;
  /** Velocity 0..1. */
  v: number;
  drum?: DrumId;
  /** MIDI note to glide from (bass slides). */
  from?: number;
}

// ------------------------------------------------------------------ small helpers

/** mulberry32: tiny seeded PRNG returning [0, 1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mixSeed = (a: number, b: number): number => {
  let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) >>> 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
};

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" -> 73 (C4 = 60). */
export function noteNum(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const pcOf = (name: string): number => {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) throw new Error(`bad pitch class "${name}"`);
  return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
};

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], m7b5: [0, 3, 6, 10], dim: [0, 3, 6], add9: [0, 4, 7, 14], '13': [0, 4, 7, 10, 14, 21],
};

export interface Chord {
  sym: string;
  root: number; // pitch class
  bass: number; // pitch class (slash chords)
  iv: number[]; // intervals above the root
}

export function parseChord(sym: string): Chord {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !(m[2] in QUALITY)) throw new Error(`bad chord "${sym}"`);
  const root = pcOf(m[1]);
  return { sym, root, bass: m[3] ? pcOf(m[3]) : root, iv: QUALITY[m[2]] };
}

/** Chord-relative degree -> semitones above the chord root. */
function degree(ch: Chord, d: string): number {
  const has = (x: number) => ch.iv.includes(x);
  switch (d) {
    case '2': return 2;
    case '3': return has(3) ? 3 : has(4) ? 4 : 5;
    case '4': return 5;
    case '5': return has(6) && !has(7) ? 6 : 7;
    case '6': return 9;
    case '7': return has(11) ? 11 : has(9) && !has(10) ? 9 : 10;
    case '8': return 12;
    default: return 0;
  }
}

interface Tok { t: number; d: number; tok: string }

/** Split a bar of tokens evenly over the bar; '-' extends the previous token, '.' is a rest. */
function parseBar(src: string): Tok[] {
  const toks = src.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const step = BEATS_PER_BAR / toks.length;
  const out: Tok[] = [];
  let last: Tok | null = null;
  toks.forEach((tok, i) => {
    if (tok === '-') {
      if (last) last.d += step;
      return;
    }
    if (tok === '.') {
      last = null;
      return;
    }
    last = { t: i * step, d: step, tok };
    out.push(last);
  });
  return out;
}

const splitBars = (src: string): string[] => src.split('|').map((s) => s.trim());

// ------------------------------------------------------------------ section compilation

interface Span { t: number; d: number; chord: Chord }
interface StaticEv { t: number; d: number; n: number; v: number; alt?: number; from?: number }

interface CompiledSection {
  name: string;
  bars: number;
  spans: Span[];
  parts: Map<string, StaticEv[]>;
}

interface CompiledSong {
  def: SongDef;
  sections: CompiledSection[]; // in form order
  starts: number[]; // first bar of each form entry
  length: number; // bars in one pass of the form
  lines: Map<string, StaticEv[]>; // cache: section:line:mask
}

const compiledCache = new WeakMap<SongDef, CompiledSong>();

function chordSpans(src: string): Span[] {
  const spans: Span[] = [];
  splitBars(src).forEach((bar, bi) => {
    const syms = bar.split(/\s+/).filter(Boolean);
    const step = BEATS_PER_BAR / syms.length;
    syms.forEach((s, i) => {
      const chord = parseChord(s);
      const prev = spans[spans.length - 1];
      const t = bi * BEATS_PER_BAR + i * step;
      if (prev && prev.chord.sym === s && prev.t + prev.d === t) prev.d += step;
      else spans.push({ t, d: step, chord });
    });
  });
  return spans;
}

const spanAt = (spans: Span[], t: number): Span => {
  for (let i = spans.length - 1; i >= 0; i--) if (spans[i].t <= t + 1e-6) return spans[i];
  return spans[0];
};

/** Nearest note with pitch class pc to ref inside [lo, hi]. */
function nearest(pc: number, ref: number, lo: number, hi: number): number {
  let best = -1;
  for (let n = lo; n <= hi; n++) {
    if (((n % 12) + 12) % 12 !== pc) continue;
    if (best < 0 || Math.abs(n - ref) < Math.abs(best - ref)) best = n;
  }
  if (best < 0) best = lo + ((pc - (lo % 12) + 24) % 12);
  return best;
}

/** Chord voicing in a range, led smoothly from the previous voicing. */
function voice(ch: Chord, lo: number, hi: number, max: number, prev: number[] | null): number[] {
  let iv = [...ch.iv];
  for (const drop of [7, 0, 14, 21]) if (iv.length > max && iv.includes(drop)) iv = iv.filter((x) => x !== drop);
  iv = iv.slice(0, max);
  const pcs = iv.map((x) => (ch.root + x) % 12);
  const options = pcs.map((pc) => {
    const o: number[] = [];
    for (let n = lo; n <= hi; n++) if (n % 12 === pc) o.push(n);
    return o;
  });
  const center = (lo + hi) / 2;
  let best: number[] | null = null;
  let bestScore = Infinity;
  const walk = (i: number, acc: number[]) => {
    if (i === options.length) {
      const s = [...acc].sort((a, b) => a - b);
      for (let k = 1; k < s.length; k++) if (s[k] - s[k - 1] < 2) return;
      const spread = s[s.length - 1] - s[0];
      if (spread > 16) return;
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      let score = spread * 0.15;
      if (prev && prev.length === s.length) for (let k = 0; k < s.length; k++) score += Math.abs(s[k] - prev[k]);
      else score += Math.abs(mean - center) * 2;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
      return;
    }
    for (const n of options[i]) walk(i + 1, [...acc, n]);
  };
  walk(0, []);
  return best ?? pcs.map((pc) => nearest(pc, center, lo - 12, hi + 12)).sort((a, b) => a - b);
}

const COMP_VEL: Record<string, number> = { X: 1, x: 0.8, D: 0.95, d: 0.7, U: 0.66, u: 0.5, S: 1, s: 0.8 };

function compileLine(song: CompiledSong, sec: SectionDef, name: string, line: 'lead' | 'counter', mask: number): StaticEv[] {
  const key = `${name}:${line}:${mask}`;
  const hit = song.lines.get(key);
  if (hit) return hit;
  const src = line === 'lead' ? sec.lead : sec.counter;
  const out: StaticEv[] = [];
  if (src) {
    const bars = splitBars(src);
    const alts = Object.keys(sec.leadAlt ?? {}).map(Number).sort((a, b) => a - b);
    if (line === 'lead') alts.forEach((b, i) => { if (mask & (1 << i)) bars[b] = sec.leadAlt![b]; });
    let last: StaticEv | null = null;
    bars.forEach((bar, bi) => {
      const toks = bar.split(/\s+/).filter(Boolean);
      const step = BEATS_PER_BAR / toks.length;
      toks.forEach((tok, i) => {
        if (tok === '-') {
          if (last) last.d += step;
          return;
        }
        if (tok === '.') {
          last = null;
          return;
        }
        last = { t: bi * BEATS_PER_BAR + i * step, d: step, n: noteNum(tok), v: 0.85 };
        out.push(last);
      });
    });
  }
  song.lines.set(key, out);
  return out;
}

type BassCarry = Map<string, { prev: number | null; forced: number | null }>;

/** Compile one form entry; `carry` threads each bass line's last note into the next entry. */
function compileSection(def: SongDef, name: string, nextFirst: Chord, last: boolean, carry: BassCarry): CompiledSection {
  const sec = def.sections[name];
  const spans = chordSpans(sec.chords);
  const bars = splitBars(sec.chords).length;
  const parts = new Map<string, StaticEv[]>();
  const strum = (0.012 * def.bpm) / 60; // 12 ms between strummed strings, in beats
  for (const p of def.parts) {
    if (p.kind === 'line' || p.kind === 'kit') continue;
    const [lo, hi] = p.range ?? [48, 72];
    const evs: StaticEv[] = [];
    const patFor = (b: number): string | null => {
      const list = sec.pat[p.id];
      const name2 = list ? list[b % list.length] : p.pattern;
      if (!name2 || name2 === '_') return null;
      if (name2.includes('|')) throw new Error(`${def.id}/${name}/${p.id}: alternatives are only allowed for kit parts`);
      return name2;
    };
    if (p.kind === 'pad') {
      let prev: number[] | null = null;
      for (const sp of spans) {
        const vs: number[] = voice(sp.chord, lo, hi, p.notes ?? 4, prev);
        prev = vs;
        for (const n of vs) evs.push({ t: sp.t, d: sp.d, n, v: 0.8 });
      }
    } else if (p.kind === 'comp') {
      const voicings = new Map<Span, number[]>();
      let prev: number[] | null = null;
      for (const sp of spans) {
        const vs: number[] = p.root ? [nearest(sp.chord.bass, (lo + hi) / 2, lo, hi)] : voice(sp.chord, lo, hi, p.notes ?? 3, prev);
        voicings.set(sp, vs);
        prev = vs;
      }
      for (let b = 0; b < bars; b++) {
        const pn = patFor(b);
        if (!pn) continue;
        const src = def.comp[pn];
        if (src === undefined) throw new Error(`${def.id}: unknown comp pattern ${pn}`);
        for (const tk of parseBar(src)) {
          const T = b * BEATS_PER_BAR + tk.t;
          const sp = spanAt(spans, T);
          const notes = voicings.get(sp)!;
          const v = COMP_VEL[tk.tok];
          if (v === undefined) throw new Error(`${def.id}: bad comp token ${tk.tok}`);
          const short = tk.tok === 's' || tk.tok === 'S';
          const d = short ? Math.min(tk.d, 0.3) : Math.min(tk.d, sp.t + sp.d - T);
          if (tk.tok === 'D' || tk.tok === 'd') notes.forEach((n, i) => evs.push({ t: T + i * strum, d: d - i * strum, n, v: v * (1 - i * 0.05) }));
          else if (tk.tok === 'U' || tk.tok === 'u') [...notes].reverse().slice(0, 3).forEach((n, i) => evs.push({ t: T + i * strum, d: d - i * strum, n, v: v * (1 - i * 0.08) }));
          else for (const n of notes) evs.push({ t: T, d, n, v });
        }
      }
    } else if (p.kind === 'bass') {
      const ref0 = lo + 6;
      const c0 = carry.get(p.id);
      let prevNote: number | null = c0?.prev ?? null;
      let curSpan: Span | null = null;
      let curRoot = 0;
      let forced: number | null = c0?.forced ?? null; // the note an approach just led to
      for (let b = 0; b < bars; b++) {
        const pn = patFor(b);
        if (!pn) continue;
        const src = def.bass[pn];
        if (src === undefined) throw new Error(`${def.id}: unknown bass pattern ${pn}`);
        for (const tk of parseBar(src)) {
          const T = b * BEATS_PER_BAR + tk.t;
          const sp = spanAt(spans, T);
          if (sp !== curSpan) {
            curSpan = sp;
            curRoot = nearest(sp.chord.bass, prevNote ?? ref0, lo, hi);
          }
          if (forced !== null && forced % 12 === sp.chord.bass) curRoot = forced;
          forced = null;
          const ch = sp.chord;
          const m = /^([+-]?)(R|A|a|[2-8]|[A-G][#b]?-?\d)([~']*)$/.exec(tk.tok);
          if (!m) throw new Error(`${def.id}: bad bass token ${tk.tok}`);
          let n: number;
          let alt: number | undefined;
          if (m[2] === 'R') n = curRoot;
          else if (m[2] === 'A' || m[2] === 'a') {
            // Lead into the next chord change (the next section's first chord after the last one).
            // (The form's very first root has no predecessor, so the last approach aims at its default octave.)
            const nextSpan = spans.find((x) => x.t > T + 1e-6);
            const nx = nextSpan ? nextSpan.chord : nextFirst;
            const target = nextSpan || !last ? nearest(nx.bass, prevNote ?? curRoot, lo, hi + 2) : nearest(nx.bass, ref0, lo, hi);
            n = m[2] === 'A' ? target - 1 : target + 1;
            alt = m[2] === 'A' ? target + 1 : target - 1;
            forced = target;
          } else if (/^[2-8]$/.test(m[2])) {
            const chordRoot = curRoot - ((ch.bass - ch.root + 12) % 12);
            if (m[2] === '8') n = chordRoot + 12;
            else {
              // Chord tones take the octave nearest the previous note: smooth lines that stay in range.
              n = nearest((ch.root + degree(ch, m[2])) % 12, prevNote ?? curRoot, lo - 2, hi + 3);
            }
          } else n = noteNum(m[2]);
          if (m[1] === '-') n -= 12;
          if (m[1] === '+') n += 12;
          const staccato = m[3].includes("'");
          const ev: StaticEv = { t: T, d: tk.d * (staccato ? 0.45 : 0.92), n, v: 0.9 };
          if (alt !== undefined) ev.alt = alt + (m[1] === '-' ? -12 : m[1] === '+' ? 12 : 0);
          if (m[3].includes('~') && prevNote !== null) ev.from = prevNote;
          evs.push(ev);
          prevNote = n;
        }
      }
      carry.set(p.id, { prev: prevNote, forced });
    }
    evs.sort((a, b) => a.t - b.t || a.n - b.n);
    parts.set(p.id, evs);
  }
  return { name, bars, spans, parts };
}

export function compileSong(def: SongDef): CompiledSong {
  const hit = compiledCache.get(def);
  if (hit) return hit;
  const sections: CompiledSection[] = [];
  const starts: number[] = [];
  let length = 0;
  const carry: BassCarry = new Map();
  def.form.forEach((name, i) => {
    if (!def.sections[name]) throw new Error(`${def.id}: unknown section ${name}`);
    const next = def.form[(i + 1) % def.form.length];
    const nextFirst = chordSpans(def.sections[next].chords)[0].chord;
    const cs = compileSection(def, name, nextFirst, i === def.form.length - 1, carry);
    starts.push(length);
    sections.push(cs);
    length += cs.bars;
  });
  const song: CompiledSong = { def, sections, starts, length, lines: new Map() };
  compiledCache.set(def, song);
  return song;
}

/** Bars in one pass of the song's form. */
export const formBars = (def: SongDef): number => compileSong(def).length;

/** Chord symbol sounding at a bar/beat (for tests and analysis). */
export function chordAt(def: SongDef, bar: number, beat: number): Chord {
  const s = compileSong(def);
  const pos = ((bar % s.length) + s.length) % s.length;
  let si = s.starts.length - 1;
  while (s.starts[si] > pos) si--;
  return spanAt(s.sections[si].spans, (pos - s.starts[si]) * BEATS_PER_BAR + beat).chord;
}

// ------------------------------------------------------------------ bar generation

function swingT(t: number, s: number, unit: 8 | 16): number {
  if (s === 0.5) return t;
  const span = unit === 8 ? 1 : 0.5;
  const base = Math.floor(t / span + 1e-9) * span;
  const p = (t - base) / span;
  const q = p < 0.5 ? p * (s / 0.5) : s + (p - 0.5) * ((1 - s) / 0.5);
  return base + q * span;
}

const DRUM_VEL: Record<string, number> = { X: 1, x: 0.72, o: 0.38 };

/**
 * All note events of one bar (absolute bar index from the song start), sorted by time.
 * Deterministic: the same (song, bar, seed) always yields the same events.
 */
export function barEvents(def: SongDef, bar: number, seed = def.seed): NoteEvent[] {
  const song = compileSong(def);
  const pass = Math.floor(bar / song.length);
  const pos = bar - pass * song.length;
  let si = song.starts.length - 1;
  while (song.starts[si] > pos) si--;
  const sec = song.sections[si];
  const sdef = def.sections[sec.name];
  const b = pos - song.starts[si];
  const last = b === sec.bars - 1;
  const rnd = prng(mixSeed(seed, bar + 1));
  const secRnd = prng(mixSeed(seed ^ 0x51ed27, pass * 977 + si + 1));
  const varied = pass > 0;
  const beatSec = 60 / def.bpm;
  const t0 = b * BEATS_PER_BAR;
  const t1 = t0 + BEATS_PER_BAR;
  const out: NoteEvent[] = [];

  // Alternate lead bars for this pass of the section (decided once per section instance).
  const altCount = Object.keys(sdef.leadAlt ?? {}).length;
  let mask = 0;
  for (let i = 0; i < altCount; i++) if (secRnd() < (varied ? 0.55 : 0)) mask |= 1 << i;

  // Grace notes on a repeat: shared by every part that plays the same line.
  const graces = new Map<string, Set<number>>();
  for (const line of ['lead', 'counter'] as const) {
    const evs = compileLine(song, sdef, sec.name, line, line === 'lead' ? mask : 0);
    const set = new Set<number>();
    evs.forEach((e, i) => {
      if (e.t >= t0 && e.t < t1 && varied && e.d >= 1 && e.t - t0 >= 0.25 && rnd() < 0.2) set.add(i);
    });
    graces.set(line, set);
  }

  for (const p of def.parts) {
    const vel = p.vel ?? 1;
    if (p.kind === 'line') {
      const line = p.line ?? 'lead';
      const evs = compileLine(song, sdef, sec.name, line, line === 'lead' ? mask : 0);
      const g = graces.get(line)!;
      const oct = 12 * (p.octave ?? 0);
      evs.forEach((e, i) => {
        if (e.t < t0 || e.t >= t1) return;
        const t = e.t - t0;
        const strong = Math.abs(t % 2) < 1e-6 ? 0.1 : Math.abs(t % 1) < 1e-6 ? 0.03 : -0.06;
        if (g.has(i)) out.push({ part: p.id, t: t - 0.125, d: 0.125, n: e.n - 1 + oct, v: 0.55 * vel });
        out.push({ part: p.id, t, d: e.d, n: e.n + oct, v: Math.min(1, (e.v + strong) * vel) });
      });
    } else if (p.kind === 'kit') {
      let name: string | null;
      const list = sdef.pat[p.id];
      if (list) name = list[b % list.length];
      else name = last && p.fill ? p.fill : p.pattern ?? null;
      if (!name || name === '_') continue;
      if (name.includes('|')) {
        const opts = name.split('|');
        name = opts[Math.floor(rnd() * opts.length) % opts.length];
      }
      const pat = def.kits[name];
      if (!pat) throw new Error(`${def.id}: unknown kit pattern ${name}`);
      const plain = !/^(fill|turn|pfill)/.test(name);
      for (const id of DRUM_IDS) {
        const row = pat[id];
        if (!row) continue;
        const step = BEATS_PER_BAR / row.length;
        for (let i = 0; i < row.length; i++) {
          const v = DRUM_VEL[row[i]];
          if (v === undefined) continue;
          out.push({ part: p.id, t: i * step, d: step, n: 0, v: v * vel, drum: id });
        }
      }
      if (p.crash && b === 0 && bar > 0) out.push({ part: p.id, t: 0, d: 4, n: 0, v: 0.8 * vel, drum: 'cr' });
      if (varied && plain) {
        // Light variation on repeats: an extra ghost hat, or a pickup kick into the next bar.
        if (pat.h && rnd() < 0.18) {
          const slot = [3, 7, 11, 15][Math.floor(rnd() * 4) % 4];
          if (pat.h.length === 16 && pat.h[slot] === '.') out.push({ part: p.id, t: slot * 0.25, d: 0.25, n: 0, v: 0.3 * vel, drum: 'h' });
        }
        if (pat.k && pat.k.length === 16 && pat.k[14] === '.' && pat.k[15] === '.' && rnd() < 0.14) out.push({ part: p.id, t: 3.5, d: 0.25, n: 0, v: 0.55 * vel, drum: 'k' });
      }
    } else {
      const evs = sec.parts.get(p.id) ?? [];
      const oct = 12 * (p.octave ?? 0);
      let firstHit = -1;
      for (const e of evs) {
        if (e.t < t0 || e.t >= t1) continue;
        const t = e.t - t0;
        let n = e.n;
        if (varied && e.alt !== undefined && rnd() < 0.3) n = e.alt;
        if (p.kind === 'comp') {
          if (firstHit < 0) firstHit = t;
          // On repeats, occasionally leave out a soft off-beat hit.
          if (varied && t - firstHit > 0.1 && e.v < 0.75 && rnd() < 0.1) continue;
        }
        const ev: NoteEvent = { part: p.id, t, d: e.d, n: n + oct, v: e.v * vel };
        if (e.from !== undefined) ev.from = e.from + oct;
        out.push(ev);
      }
    }
  }

  // Swing, then a few milliseconds of humanised timing and velocity.
  for (const e of out) {
    const end = swingT(e.t + e.d, def.swing, def.swingUnit);
    let t = swingT(e.t, def.swing, def.swingUnit);
    const tight = e.drum === 'k' || e.drum === 's' || e.drum === 'cr';
    const jitter = ((tight ? 0.002 : 0.005) / beatSec) * (rnd() * 2 - 1);
    if (t > 0.01) t += jitter;
    e.t = Math.min(BEATS_PER_BAR - 1e-3, Math.max(0, t));
    e.d = Math.max(0.05, end - e.t);
    e.v = Math.max(0.05, Math.min(1, e.v * (1 + (rnd() * 2 - 1) * 0.05)));
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

/** A bar's written content without any seeded variation (for repeat analysis). */
export function barSignature(def: SongDef, bar: number): string {
  const song = compileSong(def);
  const pos = ((bar % song.length) + song.length) % song.length;
  let si = song.starts.length - 1;
  while (song.starts[si] > pos) si--;
  const sec = song.sections[si];
  const sdef = def.sections[sec.name];
  const b = pos - song.starts[si];
  const t0 = b * BEATS_PER_BAR;
  const parts: string[] = [];
  const inBar = (e: StaticEv) => e.t >= t0 && e.t < t0 + BEATS_PER_BAR;
  for (const line of ['lead', 'counter'] as const) parts.push(compileLine(song, sdef, sec.name, line, 0).filter(inBar).map((e) => `${(e.t - t0).toFixed(2)}:${e.n}:${e.d.toFixed(2)}`).join(','));
  for (const [id, evs] of sec.parts) parts.push(id + '=' + evs.filter(inBar).map((e) => `${(e.t - t0).toFixed(2)}:${e.n}`).join(','));
  for (const [id, list] of Object.entries(sdef.pat)) parts.push(id + '#' + list[b % list.length]);
  return parts.join('/');
}
