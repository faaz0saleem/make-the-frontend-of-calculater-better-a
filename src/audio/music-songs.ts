import type { SongDef } from './music-theory';

/**
 * The three world songs, written out as note data. Each has A and B themes (each with a second
 * ending), a bridge and a closing A: 48 bars before the form comes round again, with drum fills at
 * every phrase end. Parts with mix [x, 0] form the softer menu arrangement (no kick); parts with
 * [0, x] only join while driving.
 *
 * Notation: bars are separated by '|'; the tokens of a bar split it evenly. Lines use note names
 * ('.' rest, '-' hold). Bass tokens are chord degrees (R 2 3 4 5 6 7 8, A/a = chromatic approach
 * from below/above to the next chord, ' = staccato, ~ = slide in, -/+ = octave). Comp tokens:
 * D/d down-strum, U/u up-strum, X/x block chord, S/s short stab. Drum rows: X accent, x hit, o ghost.
 */

// ------------------------------------------------------------------ 1. Sunlit Harbor
// C major, light shuffle: marimba hook, ukulele island strum, walking upright bass, woodblock jokes.
const HARBOR: SongDef = {
  id: 'harbor',
  title: 'Sunlit Harbor',
  bpm: 116,
  swing: 0.6,
  swingUnit: 8,
  seed: 0x4a11,
  trim: 1.06,
  echo: { beats: 0.75, feedback: 0.25, tone: 2600, wet: 0.6 },
  kitTone: { kick: [190, 50, 0.34], snare: [1100, 0.26], hat: 6500 },
  parts: [
    { id: 'lead', kind: 'line', line: 'lead', voice: 'marimba', mix: [0, 1], pan: 0.1, echo: 0.12 },
    { id: 'flute', kind: 'line', line: 'lead', voice: 'flute', mix: [0.9, 0], pan: 0.1, echo: 0.2 },
    { id: 'glock', kind: 'line', line: 'counter', voice: 'glock', mix: [0.7, 0.8], pan: -0.4, echo: 0.3 },
    { id: 'uke', kind: 'comp', voice: 'uke', mix: [0, 1], pan: -0.32, range: [60, 76], notes: 3, lowpass: 5000 },
    { id: 'ukeSoft', kind: 'comp', voice: 'uke', mix: [1.2, 0], pan: -0.32, range: [60, 76], notes: 3, lowpass: 3600, pattern: 'lilt' },
    { id: 'pad', kind: 'pad', voice: 'pad', mix: [0.7, 0.25], range: [53, 67], notes: 4, lowpass: 1800 },
    { id: 'bass', kind: 'bass', voice: 'upright', mix: [0, 1], range: [36, 55], lowpass: 1400 },
    { id: 'bassSoft', kind: 'bass', voice: 'upright', mix: [0.7, 0], range: [36, 55], lowpass: 1000, pattern: 'two' },
    { id: 'kit', kind: 'kit', mix: [0, 1], crash: true },
    { id: 'perc', kind: 'kit', mix: [0.9, 0], pan: 0.3, pattern: 'shaker', fill: 'pfill' },
  ],
  bass: {
    walk1: 'R 3 5 A',
    walk2: 'R 5 3 A',
    walk3: 'R 5 3 a',
    walk4: 'R 3 5 a',
    walk5: 'R 5 6 A',
    pair: 'R 5 R A',
    pair2: 'R 3 R A',
    end: 'R 3 5 .',
    two: 'R - 5 -',
  },
  comp: {
    strum: 'D . D U . U D U',
    strum2: 'D . D U . U D .',
    chop: '. s . s . s . s',
    hold: 'D - - - - - - -',
    lilt: 'D - - U - - D -',
  },
  kits: {
    groove: { k: 'X.......X.....x.', s: '....X.......X...', h: 'x.o.x.o.x.o.x.o.' },
    groove2: { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.o.x.o.x.o.x.o.' },
    drive: { k: 'X.......X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x...', o: '..............x.' },
    half: { k: 'X.........x.....', s: '........X.......', h: 'x.o.x.o.x.o.x.o.' },
    turn: { k: 'X.......X.......', s: '....X.......X...', h: 'x.o.x.o.x.o.....', wh: '..............x.', wl: '...............x' },
    fill1: { k: 'X.......X.......', s: '....X.......XoXX', h: 'x.o.x.o.x.o.....' },
    fill2: { k: 'X.......X.......', s: '....X...........', h: 'x.o.x.o.........', tH: '........X.X.....', tM: '............X...', tL: '..............XX' },
    fill3: { k: 'X.......X.......', s: '....X...........', h: 'x.o.x.o.........', wh: '........X...X...', wl: '..........X...X.' },
    shaker: { sh: 'x.X.x.X.x.X.x.X.', wl: '....x.......x...' },
    pfill: { sh: 'x.X.x.X.x.X.....', wh: '............x.x.' },
  },
  sections: {
    A: {
      chords: 'C | Am7 | Dm7 | G7 | C | A7 | Dm7 G7 | C',
      lead: 'E5 . G5 E5 . C5 D5 E5 | C5 . A4 . . . D5 E5 | F5 . A5 F5 . D5 E5 F5 | D5 . B4 . G4 . C5 D5 | E5 . G5 E5 . C5 D5 E5 | C#5 . E5 C#5 . A4 B4 C#5 | D5 . F5 A5 G5 . F5 D5 | E5 - - - . . . .',
      leadAlt: { 3: 'D5 . B4 . G4 B4 C5 D5', 7: 'E5 - - - C5 . D5 .' },
      pat: {
        bass: ['walk1', 'walk2', 'walk1', 'walk3', 'walk1', 'walk4', 'pair', 'walk1'],
        uke: ['strum', 'strum2', 'strum', 'strum2', 'strum', 'strum2', 'strum', 'hold'],
        kit: ['groove', 'groove2', 'groove', 'groove2|turn', 'groove', 'groove2', 'groove', 'fill1|fill2|fill3'],
      },
    },
    A2: {
      chords: 'C | Am7 | Dm7 | G7 | E7 | Am7 | D7 G7 | C',
      lead: 'E5 . G5 E5 . C5 D5 E5 | C5 . A4 . . . D5 E5 | F5 . A5 F5 . D5 E5 F5 | G5 - F5 . D5 . B4 . | B4 . E5 G#5 . E5 F#5 G#5 | A5 . E5 C5 . A4 B4 C5 | D5 . F#5 A5 G5 . F5 D5 | C5 - - - . . . .',
      leadAlt: { 3: 'G5 . F5 . D5 . B4 G4', 7: 'C5 . G4 . C5 - - .' },
      pat: {
        bass: ['walk1', 'walk2', 'walk1', 'walk3', 'walk4', 'walk2', 'pair', 'end'],
        uke: ['strum', 'strum2', 'strum', 'strum2', 'strum', 'strum2', 'strum', 'hold'],
        kit: ['groove', 'groove2', 'groove', 'groove2|turn', 'groove', 'groove2', 'groove', 'fill1|fill2|fill3'],
      },
    },
    B: {
      chords: 'F | C/E | Dm7 | G7 | F | C/E | D7 | G7',
      lead: 'C6 - A5 . F5 . A5 C6 | G5 - E5 . C5 . . . | D5 . F5 . A5 . C6 . | B5 - - - A5 . G5 . | C6 - A5 . F5 . A5 C6 | E6 - D6 C6 . G5 E5 . | F#5 . A5 . C6 . A5 F#5 | G5 - - - . A5 B5 .',
      counter: '. . . . . . . . | . . . . . . E6 G6 | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . .',
      pat: {
        bass: ['walk3', 'walk5', 'walk1', 'walk1', 'walk3', 'walk5', 'walk4', 'walk1'],
        uke: ['chop', 'chop', 'chop', 'chop', 'chop', 'chop', 'chop', 'strum'],
        kit: ['drive', 'drive', 'drive', 'drive|turn', 'drive', 'drive', 'drive', 'fill1|fill2'],
      },
    },
    B2: {
      chords: 'F | E7 | Am7 | C7 | F | Fm6 | C/G G7 | C',
      lead: 'C6 - A5 . F5 . A5 C6 | B5 - G#5 . E5 . D5 . | C5 . E5 . A5 . G5 . | Bb5 - - - G5 . E5 . | F5 . A5 . C6 . A5 F5 | Ab5 - - - F5 . D5 . | E5 . G5 . F5 . D5 . | C5 - - - . . . .',
      counter: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . C6 D6 | . . . . . . . . | . . . . G6 E6 C6 .',
      pat: {
        bass: ['walk3', 'walk4', 'walk1', 'walk1', 'walk2', 'walk1', 'pair2', 'end'],
        uke: ['chop', 'chop', 'chop', 'chop', 'chop', 'chop', 'strum', 'hold'],
        kit: ['drive', 'drive', 'drive', 'drive|turn', 'drive', 'drive', 'drive', 'fill2|fill3'],
      },
    },
    C: {
      chords: 'Am | F | C | G | Am | F | D7 | G7',
      lead: 'A4 . C5 . E5 . . . | . . . . . . . . | G4 . C5 . E5 . . . | . . . . . . . . | A4 . C5 . E5 . A5 . | . . . . . . . . | D5 . F#5 . A5 . C6 . | B5 - - - G5 . D5 .',
      counter: '. . . . . . . . | F6 . E6 . C6 . A5 . | . . . . . . . . | D6 . C6 . B5 . G5 . | . . . . . . . . | F6 . E6 . C6 . A5 C6 | . . . . . . . . | . . . . . . . .',
      pat: {
        bass: ['walk2', 'walk1', 'walk1', 'walk1', 'walk2', 'walk1', 'walk4', 'walk3'],
        uke: ['hold', 'hold', 'hold', 'hold', 'strum', 'strum2', 'strum', 'strum'],
        kit: ['half', 'half', 'half', 'half|turn', 'groove', 'groove2', 'groove', 'fill1|fill2|fill3'],
      },
    },
  },
  form: ['A', 'A2', 'B', 'B2', 'C', 'A2'],
};

// ------------------------------------------------------------------ 2. Canyon Express
// E minor western surf: galloping palm-muted power chords, twangy lead through a slap-back echo,
// boom-chick bass, train-beat drums; the menu has a whistled melody over a campfire guitar.
const CANYON: SongDef = {
  id: 'canyon',
  title: 'Canyon Express',
  bpm: 124,
  swing: 0.5,
  swingUnit: 8,
  seed: 0x7c22,
  trim: 1.06,
  echo: { beats: 0.75, feedback: 0.38, tone: 2400, wet: 0.7 },
  kitTone: { kick: [180, 48, 0.32], snare: [1400, 0.22], hat: 7000 },
  parts: [
    { id: 'lead', kind: 'line', line: 'lead', voice: 'twang', mix: [0, 1], pan: 0.12, echo: 0.42 },
    { id: 'whistle', kind: 'line', line: 'lead', voice: 'whistle', mix: [0.85, 0], pan: 0.08, echo: 0.35 },
    { id: 'gallop', kind: 'comp', voice: 'power', root: true, mix: [0, 1], pan: -0.32, range: [47, 58], lowpass: 1700 },
    { id: 'steel', kind: 'comp', voice: 'steel', mix: [0.75, 0.7], pan: 0.36, range: [52, 69], notes: 4, lowpass: 3200 },
    { id: 'pad', kind: 'pad', voice: 'pad', mix: [0.8, 0.2], range: [50, 66], notes: 3, lowpass: 1500 },
    { id: 'bass', kind: 'bass', voice: 'pickbass', mix: [0, 1], range: [38, 54], lowpass: 1500 },
    { id: 'bassSoft', kind: 'bass', voice: 'pickbass', mix: [0.7, 0], range: [38, 54], lowpass: 900, pattern: 'two' },
    { id: 'kit', kind: 'kit', mix: [0, 1], crash: true },
    { id: 'perc', kind: 'kit', mix: [0.9, 0], pan: -0.25, pattern: 'gallopSh', fill: 'pfill' },
  ],
  bass: {
    boom: 'R . 5 . R . 5 .',
    boomA: 'R . 5 . R . A .',
    run: "R' R' 5' 5' R' R' 5' A'",
    end: "R' . . . R' . . .",
    two: 'R - 5 -',
  },
  comp: {
    gallop: 'x . x x x . x x x . x x x . x x',
    gallopX: 'X . x x X . x x X . x x X . x x',
    gallopEnd: 'X . x x X . x x X . . . . . . .',
    stopA: 'X . . . . . . . X . . . . . . .',
    ring: 'D - - - - - - -',
    ring2: 'D - - - D - - -',
    ringUp: 'D - - - - - U -',
  },
  kits: {
    train: { k: 'X.......X.......', s: '....X.......X...', h: '..x...x...x...x.', tb: '....x.......x...' },
    train2: { k: 'X.....x.X.......', s: '....X.......X...', h: '..x...x...x...xx' },
    drive: { k: 'X.......X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', tb: '....x.......x...' },
    half: { k: 'X.......X.......', r: '....x.......x...', h: '..x...x...x...x.' },
    turn: { k: 'X.......X.......', s: '....X.......X.XX', h: '..x...x...x.....' },
    fill1: { k: 'X.......X.......', s: '....X...XoXoXXXX', h: '..x...x.........' },
    fill2: { k: 'X.......X.......', s: '....X...........', h: '..x...x.........', tH: '........XX......', tM: '..........XX....', tL: '............XXXX' },
    gallopSh: { sh: 'X.ooX.ooX.ooX.oo', r: '....o.......o...' },
    pfill: { sh: 'X.ooX.ooX.ooX...', r: '....o.......o.o.' },
  },
  sections: {
    A: {
      chords: 'Em | Em | C | D | Em | Em | C B7 | Em',
      lead: 'B4 . E5 . G5 . F#5 E5 | B5 - - - - . G5 A5 | G5 . E5 . C5 . E5 G5 | F#5 - - - - . D5 E5 | B4 . E5 . G5 . F#5 E5 | B5 - A5 G5 F#5 . E5 D5 | E5 . C5 E5 D#5 . B4 D#5 | E5 - - - - . . .',
      leadAlt: { 1: 'B5 - - - A5 B5 G5 A5', 7: 'E5 - - - B4 . E5 .' },
      pat: {
        bass: ['boom', 'boomA', 'boom', 'boomA', 'boom', 'boom', 'boomA', 'boomA'],
        gallop: ['gallopX', 'gallop', 'gallopX', 'gallop', 'gallopX', 'gallop', 'gallopX', 'gallopEnd'],
        steel: ['ring', '_', 'ring', '_', 'ring', '_', 'ring2', '_'],
        kit: ['train', 'train2', 'train', 'train2|turn', 'train', 'train2', 'train', 'fill1|fill2'],
      },
    },
    A2: {
      chords: 'Em | Em | Am | D | G | B7 | C B7 | Em',
      lead: 'B4 . E5 . G5 . F#5 E5 | B5 - - - - . A5 B5 | C6 - B5 A5 E5 . A5 C6 | D6 - C6 B5 A5 . F#5 A5 | G5 . D5 . G5 . B5 G5 | F#5 - D#5 . B4 . D#5 F#5 | E5 . G5 E5 D#5 . F#5 D#5 | E5 - - - - . . .',
      leadAlt: { 7: 'E5 . B4 . E5 . . .' },
      pat: {
        bass: ['boom', 'boomA', 'boomA', 'boomA', 'boomA', 'boom', 'boomA', 'end'],
        gallop: ['gallopX', 'gallop', 'gallopX', 'gallop', 'gallopX', 'gallop', 'gallopX', 'gallopEnd'],
        steel: ['ring', '_', 'ring', 'ring', 'ring', 'ring', 'ring2', '_'],
        kit: ['train', 'train2', 'train', 'train2|turn', 'train', 'train2', 'train', 'fill1|fill2'],
      },
    },
    B: {
      chords: 'Am | Am | Em | Em | C | D | B7 | B7',
      lead: 'A5 - - - C6 - B5 A5 | E5 - - - - . . . | G5 - - - B5 - A5 G5 | E5 - - - - . . . | E5 - G5 - C6 - B5 A5 | F#5 - A5 - D6 - C6 A5 | B5 - A5 - F#5 - D#5 - | B4 - - - - . . .',
      pat: {
        bass: ['run', 'boomA', 'run', 'boomA', 'run', 'boomA', 'run', 'boomA'],
        gallop: ['gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopEnd'],
        steel: ['ring2', 'ring2', 'ring2', 'ring2', 'ring2', 'ring2', 'ring2', 'ring2'],
        kit: ['drive', 'drive', 'drive', 'drive|turn', 'drive', 'drive', 'drive', 'fill1|fill2'],
      },
    },
    B2: {
      chords: 'Am | D | G | Em | C | Am | B7 | B7',
      lead: 'A5 - - - C6 - B5 A5 | F#5 - - - A5 - G5 F#5 | G5 - - - B5 - D6 B5 | E6 - - - B5 . G5 E5 | E5 - G5 - C6 - B5 A5 | C6 - B5 - A5 - E5 - | D#5 - F#5 - A5 - B5 - | B5 - A5 F#5 D#5 . B4 .',
      pat: {
        bass: ['boomA', 'boomA', 'boomA', 'boomA', 'boomA', 'boomA', 'run', 'end'],
        gallop: ['gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopX', 'gallopEnd'],
        steel: ['ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring2', 'ringUp'],
        kit: ['drive', 'drive', 'drive', 'drive|turn', 'drive', 'drive', 'drive', 'fill2|fill1'],
      },
    },
    C: {
      chords: 'G | D | Em | Em | G | D | C | B7',
      lead: 'D5 - - - B4 - G4 - | F#5 - - - D5 - A4 - | G5 - - - E5 - B4 - | . . . . G5 F#5 E5 D5 | D5 - - - G5 - B5 - | A5 - - - F#5 - D5 - | E5 - G5 - C6 - B5 - | B5 - A5 - F#5 - D#5 -',
      pat: {
        bass: ['two', 'two', 'two', 'two', 'boomA', 'boomA', 'boomA', 'boomA'],
        gallop: ['stopA', 'stopA', 'stopA', 'stopA', 'gallop', 'gallop', 'gallopX', 'gallopEnd'],
        steel: ['ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring'],
        kit: ['half', 'half', 'half', 'half', 'train', 'train2', 'train', 'fill1|fill2'],
      },
    },
  },
  form: ['A', 'A2', 'B', 'B2', 'C', 'A2'],
};

// ------------------------------------------------------------------ 3. Midnight Market
// D dorian lo-fi funk: swung 16ths, electric-piano chords with a gentle tremolo, round sub bass
// with slides, snappy snare and claps; the menu trades the synth lead for soft vibes.
const MARKET: SongDef = {
  id: 'market',
  title: 'Midnight Market',
  bpm: 100,
  swing: 0.58,
  swingUnit: 16,
  seed: 0x3e93,
  trim: 1,
  echo: { beats: 0.75, feedback: 0.32, tone: 2000, wet: 0.6 },
  kitTone: { kick: [150, 42, 0.4], snare: [1800, 0.17], hat: 7500 },
  parts: [
    { id: 'lead', kind: 'line', line: 'lead', voice: 'synth', mix: [0, 1], pan: 0.1, echo: 0.28, lowpass: 2800 },
    { id: 'vibes', kind: 'line', line: 'lead', voice: 'vibes', mix: [0.85, 0], pan: 0.1, echo: 0.3 },
    { id: 'ep', kind: 'comp', voice: 'ep', mix: [0, 1], range: [52, 70], notes: 4, lowpass: 3000, autopan: [4.5, 0.35] },
    { id: 'epSoft', kind: 'comp', voice: 'ep', mix: [0.85, 0], range: [52, 70], notes: 4, lowpass: 2400, pattern: 'soft', autopan: [4.5, 0.35] },
    { id: 'pad', kind: 'pad', voice: 'pad', mix: [0.75, 0.25], range: [50, 65], notes: 4, lowpass: 1300 },
    { id: 'bass', kind: 'bass', voice: 'sub', mix: [0, 1], range: [33, 45], lowpass: 900 },
    { id: 'bassSoft', kind: 'bass', voice: 'sub', mix: [0.7, 0], range: [33, 45], lowpass: 700, pattern: 'two' },
    { id: 'kit', kind: 'kit', mix: [0, 1] },
    { id: 'perc', kind: 'kit', mix: [0.9, 0], pan: 0.25, pattern: 'night', fill: 'pfill' },
  ],
  bass: {
    funk1: "R - - . . . R' . 8' . . R' . . 5 .",
    funk2: "R - - . . . 5' . 7 - . 8' . . A .",
    slide: "R - - . . . R' . 8~ - - . 5' . A .",
    pair: "R - - . . . 5' . R - - . . . A .",
    long: "R - - - - - - - . . 5' . 8' . A .",
    end: 'R - - . . . . . R - - - - - - .',
    two: 'R - 5 -',
  },
  comp: {
    comp1: 'x - - - - - . x - - x - - - . .',
    comp2: 'x - - - . . x - . . . x - - - .',
    hold: 'x - - - - - - - - - - - - - - -',
    soft: 'x - - - - - - - x - - - - - - -',
  },
  kits: {
    beat1: { k: 'X......x..X.....', s: '....X.......X...', h: 'x.x.x.xox.x.x.x.' },
    beat2: { k: 'X.....x...X..x..', s: '....X.......X..o', h: 'x.x.x.x.x.x.x...', o: '..............x.' },
    beatB: { k: 'X......x..X.....', s: '....X.......X...', c: '....x.......x...', h: 'x.xox.x.x.xox.x.' },
    brk: { k: 'X.........X.....', r: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    turn: { k: 'X......x..X.....', s: '....X.......X.oX', h: 'x.x.x.x.x.x.....' },
    fill1: { k: 'X......x..X.....', s: '....X.......XoXX', h: 'x.x.x.x.x.x.....' },
    fill2: { k: 'X......x........', s: '....X...........', h: 'x.x.x.x.........', tH: '........X.X.....', tM: '............X...', tL: '..............XX' },
    night: { h: 'o.o.o.o.o.o.o.o.', r: '....x.......x...' },
    pfill: { h: 'o.o.o.o.o.o.....', r: '....x.......x.x.' },
  },
  sections: {
    A: {
      chords: 'Dm9 | G9 | Dm9 | G9 | Bbmaj7 | A7 | Dm9 | Dm9',
      lead: '. . A5 . G5 . F5 G5 | A5 - - - . . . . | . . A5 . G5 . F5 D5 | F5 . E5 - D5 . . . | . . D6 . C6 . A5 . | G5 - E5 - C#5 . . . | D5 . F5 . A5 . C6 . | A5 - - - . . . .',
      leadAlt: { 1: 'A5 - - - . . G5 F5', 7: 'A5 - G5 - E5 . . .' },
      pat: {
        bass: ['funk1', 'funk2', 'funk1', 'slide', 'funk1', 'funk2', 'funk1', 'long'],
        ep: ['comp1', 'comp2', 'comp1', 'comp2', 'comp1', 'comp2', 'comp1', 'hold'],
        kit: ['beat1', 'beat2', 'beat1', 'beat2|turn', 'beat1', 'beat2', 'beat1', 'fill1|fill2'],
      },
    },
    A2: {
      chords: 'Dm9 | G9 | Dm9 | G9 | Bbmaj7 | Am7 | Gm7 A7 | Dm9',
      lead: '. . A5 . G5 . F5 G5 | A5 - - - . . G5 A5 | C6 . A5 . G5 . F5 D5 | F5 . E5 . D5 . B4 . | D5 . F5 . A5 . . . | G5 . E5 . C5 . . . | Bb4 . D5 . C#5 . E5 . | D5 - - - . . . .',
      leadAlt: { 7: 'D5 - - - A4 . D5 .' },
      pat: {
        bass: ['funk1', 'funk2', 'funk1', 'slide', 'funk1', 'funk2', 'pair', 'end'],
        ep: ['comp1', 'comp2', 'comp1', 'comp2', 'comp1', 'comp2', 'comp1', 'hold'],
        kit: ['beat1', 'beat2', 'beat1', 'beat2|turn', 'beat1', 'beat2', 'beat1', 'fill1|fill2'],
      },
    },
    B: {
      chords: 'Gm9 | C9 | Fmaj7 | Dm9 | Gm9 | C9 | Ebmaj7 | A7',
      lead: 'Bb5 - A5 - G5 . F5 . | E5 - - - D5 . E5 . | F5 . A5 . C6 . E6 . | D6 - - - C6 . A5 . | Bb5 - A5 - G5 . F5 . | E5 - G5 - Bb5 . A5 . | G5 - - - Bb5 . D6 . | C#6 - - - A5 . G5 .',
      pat: {
        bass: ['funk1', 'funk2', 'funk1', 'funk2', 'funk1', 'funk2', 'slide', 'funk2'],
        ep: ['comp2', 'comp1', 'comp2', 'comp1', 'comp2', 'comp1', 'comp2', 'comp1'],
        kit: ['beatB', 'beatB', 'beatB', 'beatB|turn', 'beatB', 'beatB', 'beatB', 'fill1|fill2'],
      },
    },
    B2: {
      chords: 'Gm9 | C9 | Fmaj7 | Bbmaj7 | Em7b5 | A7 | Dm9 | A7',
      lead: 'Bb5 - A5 - G5 . F5 . | E5 - - - D5 . E5 . | F5 . A5 . C6 . A5 . | D6 - - - . . A5 . | G5 - - - Bb5 . G5 . | E5 . G5 . C#5 . E5 . | F5 . E5 . D5 . A4 . | E5 - - - C#5 . . .',
      pat: {
        bass: ['funk1', 'funk2', 'funk1', 'funk2', 'funk1', 'funk2', 'funk1', 'long'],
        ep: ['comp2', 'comp1', 'comp2', 'comp1', 'comp2', 'comp1', 'comp2', 'hold'],
        kit: ['beatB', 'beatB', 'beatB', 'beatB|turn', 'beatB', 'beatB', 'beatB', 'fill2|fill1'],
      },
    },
    C: {
      chords: 'Bbmaj7 | Bbmaj7 | Am7 | Am7 | Gm9 | Gm9 | A7sus4 | A7',
      lead: '. . . . . . . . | . . F5 . A5 . D6 . | C6 - - - . . . . | . . E5 . G5 . C6 . | Bb5 - - - A5 . F5 . | G5 - - - . . . . | . . A5 . D5 . E5 . | C#5 - - - E5 . G5 .',
      pat: {
        bass: ['long', 'long', 'long', 'long', 'long', 'long', 'funk1', 'funk2'],
        ep: ['hold', 'hold', 'hold', 'hold', 'comp1', 'comp2', 'comp1', 'comp2'],
        kit: ['brk', 'brk', 'brk', 'brk', 'beat1', 'beat2', 'beat1', 'fill1|fill2'],
      },
    },
  },
  form: ['A', 'A2', 'B', 'B2', 'C', 'A2'],
};

/** Songs by world id. */
export const SONGS: Record<number, SongDef> = { 1: HARBOR, 2: CANYON, 3: MARKET };
