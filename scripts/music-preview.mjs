// Offline previews of the procedural music, rendered by the real MusicEngine in headless Chromium:
//   node scripts/music-preview.mjs [outDir=media/audio] [--parts]
// Bundles src/audio/music.ts (rolldown, which ships with vite), renders each world song at driving
// intensity (30 s) and the menu arrangement (20 s) in an OfflineAudioContext through a gain of 0.55
// (the default music volume, i.e. what the music bus carries in game), and writes 128 kbps MP3s
// with ffmpeg. Printed RMS uses the same mono downmix as the in-game level taps; peak is the
// largest sample of either channel. --parts also prints each part's level soloed (for mixing).
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const showParts = args.includes('--parts');
const OUT = args.find((a) => !a.startsWith('--')) ?? 'media/audio';
const MUSIC_VOLUME = 0.55; // AudioManager default music setting
const SR = 44100;
const JOBS = [
  { file: 'music-harbor.mp3', title: 'Sunlit Harbor (driving)', world: 1, intensity: 1, seconds: 30 },
  { file: 'music-canyon.mp3', title: 'Canyon Express (driving)', world: 2, intensity: 1, seconds: 30 },
  { file: 'music-market.mp3', title: 'Midnight Market (driving)', world: 3, intensity: 1, seconds: 30 },
  { file: 'music-menu.mp3', title: 'Sunlit Harbor (menu)', world: 1, intensity: 0, seconds: 20 },
];

const bundle = await rolldown({ input: 'src/audio/music.ts', logLevel: 'warn' });
const { output } = await bundle.generate({ format: 'iife', name: 'Music' });
await bundle.close();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><title>music preview</title>');
await page.addScriptTag({ content: output[0].code });

/** Runs in the page: render one arrangement offline and return levels (+ a 16-bit WAV as base64). */
async function render({ world, intensity, seconds, volume, sr, solo, drum, wav }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  // Same white-noise buffer as AudioManager.build().
  const noise = ctx.createBuffer(1, sr * 2, sr);
  const d = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  const bus = ctx.createGain();
  bus.gain.value = volume;
  bus.connect(ctx.destination);
  const engine = new Music.MusicEngine(ctx, bus, noise);
  engine.setSong(world, intensity);
  const player = engine.players[0];
  const parts = [...player.layers.keys()];
  if (solo) {
    for (const [id, layer] of player.layers) {
      if (id === solo) continue;
      layer.fader.fade(0, 0, 0.001);
      layer.silentAfter = -Infinity;
    }
  }
  if (drum) {
    const play = engine.play;
    engine.play = function (p, ev, t) {
      if (ev.drum === drum) play.call(this, p, ev, t);
    };
  }
  engine.scheduleUntil(seconds);
  const nodes = engine.stats.nodes;
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const m = 0.5 * (L[i] + R[i]);
    sum += m * m;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const drums = [...new Set(Object.values(player.song.kits).flatMap((k) => Object.keys(k)))];
  const res = { parts, drums, kits: player.song.parts.filter((p) => p.kind === 'kit').map((p) => p.id), rms: 10 * Math.log10(sum / L.length + 1e-20), peak: 20 * Math.log10(peak + 1e-12), nodesPerSecond: nodes / seconds };
  if (!wav) return res;
  // 1.5 s fade at the end of the preview file, then 16-bit PCM WAV.
  const fade = Math.floor(sr * 1.5);
  const n = L.length;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const g = i > n - fade ? (n - i) / fade : 1;
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * g)) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * g)) * 32767, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  res.wav = btoa(bin);
  return res;
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'music-preview-'));
let failed = false;
try {
  for (const job of JOBS) {
    const r = await page.evaluate(render, { ...job, volume: MUSIC_VOLUME, sr: SR, solo: null, wav: true });
    const wavPath = join(tmp, job.file.replace(/\.mp3$/, '.wav'));
    writeFileSync(wavPath, Buffer.from(r.wav, 'base64'));
    const outPath = join(OUT, job.file);
    const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '128k', '-metadata', `title=${job.title}`, '-metadata', 'artist=Overloaded (procedural)', outPath], { encoding: 'utf8' });
    if (enc.status !== 0) {
      console.error(`ffmpeg failed for ${job.file}: ${enc.stderr}`);
      failed = true;
      continue;
    }
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate', '-of', 'default=nw=1', outPath], { encoding: 'utf8' });
    const info = Object.fromEntries(probe.stdout.trim().split('\n').map((l) => l.split('=')));
    console.log(
      `${outPath.padEnd(28)} ${Number(info.duration).toFixed(2)} s  ${Math.round(Number(info.bit_rate) / 1000)} kbps  RMS ${r.rms.toFixed(1)} dBFS  peak ${r.peak.toFixed(1)} dBFS  (${r.nodesPerSecond.toFixed(1)} nodes/s)  ${job.title}`,
    );
    if (showParts) {
      for (const part of r.parts) {
        const s = await page.evaluate(render, { ...job, seconds: 20, volume: MUSIC_VOLUME, sr: SR, solo: part, wav: false });
        if (s.rms < -150) continue;
        console.log(`    ${part.padEnd(9)} RMS ${s.rms.toFixed(1).padStart(6)}  peak ${s.peak.toFixed(1).padStart(6)}`);
        if (!r.kits.includes(part)) continue;
        for (const drum of r.drums) {
          const k = await page.evaluate(render, { ...job, seconds: 20, volume: MUSIC_VOLUME, sr: SR, solo: part, drum, wav: false });
          if (k.rms > -150) console.log(`      ${drum.padEnd(7)} RMS ${k.rms.toFixed(1).padStart(6)}  peak ${k.peak.toFixed(1).padStart(6)}`);
        }
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await browser.close();
}
if (failed) process.exit(1);
