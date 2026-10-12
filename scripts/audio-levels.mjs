// Measures what the player actually hears: RMS / peak per audio bus in a real browser running the
// production build at the default volume settings, while the scripted driver plays a level.
//   node scripts/audio-levels.mjs [dir=dist]     -> prints a table, writes qa/audio-levels.json
// Taps are ScriptProcessor nodes on the music bus, the effects bus and the final output (after the
// compressor), so every sample is counted (21 ms blocks at 48 kHz). Levels are dBFS (0 = full scale).
// The browser is headless Chromium with a fake audio device: levels are exact, speakers are not involved.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'dist';
const PORT = 4324;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', dir], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
// Default audio settings: only the tutorial flag and the cheapest render preset are set.
await ctx.addInitScript(() => localStorage.setItem('standalone:wobblehaul.save', JSON.stringify({ version: 2, tutorialDone: true, coins: 0, settings: { quality: 'low' } })));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html?platform=standalone&qa=1`);
await page.waitForFunction(() => window.__wh?.state().fsm === 'menu', null, { timeout: 90000 });
await page.waitForTimeout(500);
const out = { dir, errors };
out.menuBeforeGesture = await page.evaluate(() => window.__wh.game.audio.ctx?.state ?? 'no audio context');
await page.mouse.click(5, 5); // a click on the menu background: the first user gesture
await page.waitForTimeout(300);
out.menuAfterGesture = await page.evaluate(() => window.__wh.game.audio.ctx?.state ?? 'no audio context');

const installed = await page.evaluate(() => {
  const a = window.__wh.game.audio;
  if (!a.ctx) return false;
  const c = a.ctx;
  window.__taps = {};
  const sink = c.createGain();
  sink.gain.value = 0;
  sink.connect(c.destination);
  for (const [k, node] of Object.entries({ music: a.music, sfx: a.sfx, out: a.comp })) {
    const sp = c.createScriptProcessor(1024, 1, 1);
    const blocks = (window.__taps[k] = []);
    sp.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let s = 0;
      let p = 0;
      for (let i = 0; i < d.length; i++) {
        s += d[i] * d[i];
        const v = Math.abs(d[i]);
        if (v > p) p = v;
      }
      blocks.push([s / d.length, p]);
    };
    node.connect(sp);
    sp.connect(sink);
    window.__keep = (window.__keep ?? []).concat(sp); // keep the nodes alive
  }
  return true;
});

const db = (x) => (x > 1e-12 ? +(10 * Math.log10(x)).toFixed(1) : -120);
const dbA = (x) => (x > 1e-6 ? +(20 * Math.log10(x)).toFixed(1) : -120);
async function grab() {
  return page.evaluate(() => {
    const r = {};
    for (const k of Object.keys(window.__taps)) r[k] = window.__taps[k].splice(0);
    return r;
  });
}
function stats(blocks) {
  if (!blocks.length) return { rms: -120, peak: -120, median: -120, maxWin: -120, blocks: 0 };
  const ms = blocks.map((b) => b[0]);
  const sorted = [...ms].sort((x, y) => x - y);
  return {
    rms: db(ms.reduce((a, b) => a + b, 0) / ms.length),
    median: db(sorted[Math.floor(sorted.length / 2)]),
    maxWin: db(Math.max(...ms)), // loudest 21 ms block
    peak: dbA(Math.max(...blocks.map((b) => b[1]))),
    blocks: blocks.length,
  };
}
async function measure(ms) {
  await grab();
  await page.waitForTimeout(ms);
  const g = await grab();
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, stats(v)]));
}

if (installed) {
  await page.waitForTimeout(1500);
  out.menu = await measure(4000);
  await page.evaluate(() => {
    const w = window.__wh;
    w.game.startRun({ mode: 'campaign', levelId: 'h3' });
    w.autopilot(true, 0.8);
  });
  await page.waitForTimeout(3000);
  out.driving = await measure(8000);
  // Effects bed while cruising (engine/tyres/wind) with the music bus muted for the measurement.
  await page.evaluate(() => {
    const m = window.__wh.game.audio.music.gain;
    m.cancelScheduledValues(0);
    m.value = 0;
  });
  await page.waitForTimeout(300);
  const bed = await measure(2500);
  out.engineBed = { median: bed.sfx.median, rms: bed.sfx.rms };
  // Each one-shot fired on top of the running engine; margin = loudest 21 ms block minus the bed's median.
  out.oneShots = {};
  for (const name of ['pickup', 'spill', 'shed', 'bank', 'coin', 'full', 'land', 'impact', 'squish', 'nearMiss']) {
    await page.waitForTimeout(250);
    await grab();
    await page.evaluate((n) => window.__wh.game.audio.play(n), name);
    await page.waitForTimeout(700);
    const s = stats((await grab()).sfx);
    out.oneShots[name] = { maxWin: s.maxWin, peak: s.peak, marginOverEngine: +(s.maxWin - out.engineBed.median).toFixed(1) };
  }
  await page.evaluate(() => window.__wh.game.applySettings?.());
}
await browser.close();
server.kill();

mkdirSync('qa', { recursive: true });
writeFileSync('qa/audio-levels.json', JSON.stringify(out, null, 2));
const row = (label, s) => console.log(`${label.padEnd(24)} music ${String(s.music.rms).padStart(6)}  effects ${String(s.sfx.rms).padStart(6)}  output ${String(s.out.rms).padStart(6)} (peak ${s.out.peak})`);
console.log(`audio context before any gesture: ${out.menuBeforeGesture}; after one click: ${out.menuAfterGesture}`);
if (out.menu) row('menu (after a click)', out.menu);
if (out.driving) row('driving Harbor 3', out.driving);
if (out.engineBed) console.log(`engine/tyre/wind bed     median ${out.engineBed.median} dBFS`);
if (out.oneShots) for (const [k, v] of Object.entries(out.oneShots)) console.log(`  ${k.padEnd(9)} loudest ${String(v.maxWin).padStart(6)} dBFS, peak ${String(v.peak).padStart(6)}, ${v.marginOverEngine >= 0 ? '+' : ''}${v.marginOverEngine} dB over engine`);
if (errors.length) console.log('page errors:', errors);
