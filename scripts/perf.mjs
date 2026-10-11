// Browser performance + soak measurements against the production build (dist/) in a nested iframe.
// Writes qa/perf.json. The numbers are only as good as the browser they run in: in a headless
// SwiftShader (software GL) container they say nothing about frame rate on real GPUs.
//   node scripts/perf.mjs boot            boot-to-menu timing (3 cold loads)
//   node scripts/perf.mjs fps             per-preset FPS / draw calls / triangles during Long Haul
//   node scripts/perf.mjs soak <minutes>  real-time Long Haul soak at 4x sim speed (default 8 min); resource counters over time
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const mode = process.argv[2] ?? 'boot';
const PORT = 4195;
const OUT = 'qa/perf.json';
const W = 1280, H = 720;
const server = spawn('node', ['scripts/serve-nested.mjs', 'dist', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const gpu = { renderer: '' };

async function open(quality = 'low') {
  const save = JSON.stringify({ version: 2, tutorialDone: true, coins: 0, settings: { quality, music: 0, sfx: 0, master: 0 } });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  ctx.setDefaultTimeout(180000);
  await ctx.addInitScript((v) => { try { localStorage.setItem('standalone:wobblehaul.save', v); } catch { /* host page */ } }, save);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?q=${encodeURIComponent('?qa=1&platform=standalone')}`);
  const frame = await (await page.waitForSelector('#game-frame')).contentFrame();
  await frame.waitForFunction(() => window.__wh?.state().fsm === 'menu', null, { polling: 50 });
  const wall = Date.now() - t0;
  const inFrame = await frame.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const gl = document.querySelector('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      menuAtMs: Math.round(performance.now()),
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      loadEventMs: Math.round(nav?.loadEventEnd ?? 0),
      transferKB: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    };
  });
  gpu.renderer = inFrame.gpu;
  return { ctx, page, frame, boot: { wallMs: wall, ...inFrame } };
}

/** Install a per-frame sampler (runs after the game's own rAF callback each frame). */
async function installSampler(frame) {
  await frame.evaluate(() => {
    const r = window.__wh.game.renderer.renderer;
    r.info.autoReset = false;
    const s = (window.__perf = { frames: 0, t0: performance.now(), calls: 0, tris: 0, maxCalls: 0, worst: 0, last: performance.now() });
    const tick = () => {
      const now = performance.now();
      s.frames++;
      s.worst = Math.max(s.worst, now - s.last);
      s.last = now;
      s.calls += r.info.render.calls;
      s.tris += r.info.render.triangles;
      s.maxCalls = Math.max(s.maxCalls, r.info.render.calls);
      r.info.reset();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readSampler(frame) {
  return frame.evaluate(() => {
    const s = window.__perf;
    const g = window.__wh.game;
    const r = g.renderer.renderer;
    const dt = (performance.now() - s.t0) / 1000;
    const out = {
      seconds: +dt.toFixed(1), fps: +(s.frames / dt).toFixed(2), avgDrawCalls: Math.round(s.calls / Math.max(1, s.frames)), maxDrawCalls: s.maxCalls,
      avgTriangles: Math.round(s.tris / Math.max(1, s.frames)), worstFrameMs: Math.round(s.worst),
      geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? null,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      preset: g.renderer.preset.name,
    };
    Object.assign(s, { frames: 0, t0: performance.now(), calls: 0, tris: 0, maxCalls: 0, worst: 0 });
    return out;
  });
}

async function startEndless(frame, speed = 1) {
  await frame.evaluate((sp) => {
    const w = window.__wh;
    w.game.startRun({ mode: 'endless' });
    w.autopilot(true, 0.6);
    w.speed(sp);
  }, speed);
  await frame.waitForFunction(() => window.__wh.state().gameplay === true, null, { polling: 100 });
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const result = { ...prev, environment: { browser: `Chromium ${browser.version()} headless`, gl: 'ANGLE SwiftShader (software rasteriser)', viewport: `${W}x${H} @1x`, node: process.version } };

if (mode === 'boot') {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const { ctx, boot } = await open('low');
    runs.push(boot);
    await ctx.close();
  }
  result.boot = { note: 'Cold context each time, local HTTP server, no network latency, no CrazyGames SDK (standalone platform).', runs };
} else if (mode === 'fps') {
  const presets = {};
  for (const q of ['low', 'medium', 'high']) {
    const { ctx, frame } = await open(q);
    await startEndless(frame, 1);
    await installSampler(frame);
    await frame.waitForTimeout(5000);
    await readSampler(frame); // discard warm-up
    await frame.waitForTimeout(20000);
    presets[q] = await readSampler(frame);
    await ctx.close();
  }
  result.fps = { note: 'Long Haul with the scripted driver, 20 s sample after 5 s warm-up. Software GL: FPS is not representative of player hardware; draw calls / triangles are.', presets };
} else if (mode === 'soak') {
  const minutes = Number(process.argv[3] ?? 8);
  const { ctx, frame } = await open('low');
  await startEndless(frame, 4);
  await installSampler(frame);
  const samples = [];
  let restarts = 0;
  let simDone = 0; // simulated seconds of runs that already ended
  let longestRun = 0;
  const t0 = Date.now();
  const end = t0 + minutes * 60000;
  while (Date.now() < end) {
    await frame.waitForTimeout(15000);
    const st = await frame.evaluate(() => {
      const g = window.__wh.game;
      const run = g.run;
      const world = g.renderer.world;
      let sceneObjects = 0;
      g.renderer.scene.traverse(() => sceneObjects++);
      return {
        fsm: g.fsm.state, runState: run?.state ?? null, simSeconds: run ? +run.t.toFixed(1) : 0, distance: run ? Math.round(run.distance) : null,
        features: run?.track.features.length ?? null, segments: run?.track.segments?.length ?? null,
        chunkViews: world.chunks.size, chunkObjects: world.stats().objects, sceneObjects,
        particles: g.renderer.particles.active(), debris: g.renderer.truck.activeDebris(),
        runListeners: run?.events.listenerCount() ?? null, inputListeners: g.input.listenerCount,
      };
    });
    const perf = await readSampler(frame);
    longestRun = Math.max(longestRun, st.simSeconds);
    const totalSim = simDone + st.simSeconds;
    samples.push({ atRealS: Math.round((Date.now() - t0) / 1000), totalSimMin: +(totalSim / 60).toFixed(2), restarts, ...st, ...perf });
    console.log(JSON.stringify(samples[samples.length - 1]));
    if (st.runState !== 'running') {
      simDone += st.simSeconds;
      restarts++;
      await startEndless(frame, 4);
    }
  }
  await ctx.close();
  const last = samples[samples.length - 1];
  const totalSimMin = last ? last.totalSimMin : 0;
  const keys = ['features', 'segments', 'chunkViews', 'chunkObjects', 'sceneObjects', 'geometries', 'textures', 'programs', 'heapMB', 'runListeners', 'inputListeners'];
  const range = Object.fromEntries(keys.map((k) => {
    const v = samples.map((x) => x[k]).filter((x) => typeof x === 'number');
    return [k, v.length ? [Math.min(...v), Math.max(...v)] : null];
  }));
  result.soak = {
    note: `Real-time soak of ${minutes} min with the simulation at 4x (Low preset), driven by the scripted driver. A crash starts a fresh Long Haul run (counted as restarts), so run setup and teardown are exercised too.`,
    realMinutes: minutes, totalSimMinutes: totalSimMin, longestRunSimMinutes: +(longestRun / 60).toFixed(2), restarts, range, samples,
  };
}
result.environment.gpu = gpu.renderer;
mkdirSync('qa', { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result[mode], null, 2).slice(0, 3000));
await browser.close();
server.kill();
