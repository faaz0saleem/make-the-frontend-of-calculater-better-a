// Media capture from the real game (capture build: `npx vite build --mode capture`).
// Frames are produced by stepping the game's own clock at exactly 1/fps per frame, so playback
// speed equals real game speed (no fast-forward). Usage:
//   node scripts/capture.mjs covers
//   node scripts/capture.mjs video landscape|portrait [seconds=19]   (19 = CrazyGames preview; other lengths -> media/clip-<s>s-*.mp4)
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'covers';
const variant = process.argv[3] ?? 'landscape';
const PORT = 4190;
const server = spawn('node', ['scripts/serve-nested.mjs', 'dist-capture', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const save = JSON.stringify({ version: 2, tutorialDone: true, coins: 0, settings: { quality: 'high', shake: 0.6, music: 0, sfx: 0, master: 0 } });

async function open(w, h, scale = 1, params = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  ctx.setDefaultTimeout(240000);
  await ctx.addInitScript((v) => localStorage.setItem('standalone:wobblehaul.save', v), save);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/games/wobble-haul/index.html?platform=standalone${params}`);
  await page.waitForFunction(() => window.__wh !== undefined, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** Stage a run: start a level, let the scripted driver play `seconds` of simulated time (unrendered). */
async function stage(page, opts) {
  await page.evaluate((o) => {
    const g = window.__wh.game;
    g.startRun(o.req);
    window.__wh.manual(true);
    g.autopilot = new (window.__wh.Autopilot)({ greed: o.greed ?? 0.9, shedForBeams: true });
    const run = g.run;
    for (let i = 0; i < o.seconds * 120 && run.state === 'running'; i++) {
      const inp = g.autopilot.input(run, 1 / 120);
      run.step(1 / 120, inp);
      if (g.endless) { const { rebased } = g.endless.update(run.truck.s); if (rebased) { run.truck.s -= rebased; } }
      g.view.snapshot();
    }
    for (const c of o.cargo ?? []) run.truck.addCargo(window.__wh.cargo[c], []);
    // covers only: keep loose coins out of the foreground of the composition
    if (o.clearCoinsAhead) for (const f of run.track.features) if (f.kind === 'coin' && f.s > run.truck.s - 40 && f.s < run.truck.s + o.clearCoinsAhead) f.collected = true;
    if (o.hideHud) document.getElementById('ui').style.visibility = 'hidden';
    if (o.cam) g.renderer.follow.override = o.cam;
    g.renderer.follow.reset();
    window.__wh.tick(1 / 30, o.settle ?? 8);
  }, opts);
}

const OUT = 'media';
mkdirSync(OUT, { recursive: true });

if (mode === 'covers') {
  // Staged in-engine compositions: real renderer and models; the cargo tower and camera are placed by script.
  const tower = ['crate', 'armchair', 'buoy', 'cake', 'plant', 'gnome'];
  const shots = [
    { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, s: 1, logo: { x: '22%', y: '7%', size: 120 },
      cam: { back: -7.8, side: 4.4, up: 1.0, lookAhead: 0, lookUp: 2.7, lookSide: -0.9 } },
    { name: 'cover-portrait-800x1200', w: 800, h: 1200, s: 2, logo: { x: '50%', y: '4.5%', size: 96 },
      cam: { back: -8.6, side: 3.4, up: 0.9, lookAhead: 0, lookUp: 3.1, lookSide: -0.3 } },
    { name: 'cover-square-800x800', w: 800, h: 800, s: 2, logo: { x: '50%', y: '5%', size: 92 },
      cam: { back: -8.4, side: 3.8, up: 0.9, lookAhead: 0, lookUp: 2.4, lookSide: 0.3 } },
  ].filter((sh) => !process.argv[3] || sh.name.includes(process.argv[3]));
  for (const sh of shots) {
    const { ctx, page } = await open(sh.w, sh.h, sh.s, '&capture=1');
    await stage(page, { req: { mode: 'campaign', levelId: 'h10' }, seconds: 2.2, greed: 0, hideHud: true, cargo: tower, cam: sh.cam, settle: 40, clearCoinsAhead: 120 });
    await page.evaluate((l) => {
      const ui = document.getElementById('ui');
      ui.style.visibility = 'visible';
      ui.innerHTML = '';
      const logo = document.createElement('div');
      logo.className = 'logo';
      logo.innerHTML = 'WOBBLE<b>HAUL</b>';
      logo.style.cssText = `position:absolute;left:${l.x};top:${l.y};transform:translateX(-50%) rotate(-3deg);font-size:${l.size}px;white-space:nowrap`;
      ui.append(logo);
    }, sh.logo);
    await page.waitForTimeout(400);
    const tmp = `${OUT}/${sh.name}${sh.s > 1 ? '@2x' : ''}.png`;
    await page.screenshot({ path: tmp, timeout: 240000 });
    if (sh.s > 1) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', `scale=${sh.w}:${sh.h}:flags=lanczos`, `${OUT}/${sh.name}.png`]);
      rmSync(tmp);
    }
    console.log('wrote', sh.name);
    await ctx.close();
  }
} else {
  const portrait = variant === 'portrait';
  const W = portrait ? 1080 : 1920, H = portrait ? 1620 : 1080;
  const fps = 30;
  // Total length in seconds (default 19: the CrazyGames preview). 2 frames of it are the cover.
  const total = Number(process.argv[4] ?? 19);
  const frames = `${OUT}/tmp-${variant}-${total}`;
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  let n = 0;
  const clips = [
    { req: { mode: 'campaign', levelId: 'h6' }, seconds: 16, dur: 6.5 },
    { req: { mode: 'campaign', levelId: 'c7' }, seconds: 9.5, dur: 6.5 },
    { req: { mode: 'campaign', levelId: 'm4' }, seconds: 11.5, dur: 6 },
  ];
  // Share the gameplay frames between the clips in proportion to their nominal lengths.
  const gameplayFrames = Math.round(total * fps) - 2;
  const nominal = clips.reduce((a, c) => a + c.dur, 0);
  let left = gameplayFrames;
  clips.forEach((c, i) => {
    c.frames = i === clips.length - 1 ? left : Math.round((gameplayFrames * c.dur) / nominal);
    left -= c.frames;
  });
  // first frame: the matching cover image
  const cover = portrait ? `${OUT}/cover-portrait-800x1200.png` : `${OUT}/cover-landscape-1920x1080.png`;
  if (!existsSync(cover)) throw new Error('render covers first');
  const { ctx, page } = await open(W, H, 1, '&capture=1');
  for (const c of clips) {
    await stage(page, { ...c, greed: 0.9, hideHud: true });
    for (let i = 0; i < c.frames; i++) {
      // Read the WebGL canvas directly (the HUD is hidden anyway): ~2.5x faster than page screenshots.
      const b64 = await page.evaluate((dt) => {
        window.__wh.tick(dt, 1);
        return document.getElementById('game').toDataURL('image/jpeg', 0.95).slice(23);
      }, 1 / fps);
      writeFileSync(`${frames}/f${String(n++).padStart(5, '0')}.jpg`, Buffer.from(b64, 'base64'));
    }
    console.log('clip done', c.req.levelId, n);
  }
  await ctx.close();
  const out = total === 19 ? `${OUT}/preview-${variant}-${W}x${H}.mp4` : `${OUT}/clip-${total}s-${variant}-${W}x${H}.mp4`;
  // cover as the first frame (2 frames), then gameplay; no audio track
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-loop', '1', '-t', `${2 / fps}`, '-framerate', String(fps), '-i', cover,
    '-framerate', String(fps), '-i', `${frames}/f%05d.jpg`,
    '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}[c];[1:v]scale=${W}:${H},setsar=1,fps=${fps}[g];[c][g]concat=n=2:v=1:a=0,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', out]);
  rmSync(frames, { recursive: true, force: true });
  console.log('wrote', out);
}
await browser.close();
server.kill();
