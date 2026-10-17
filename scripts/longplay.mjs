// Long gameplay recording (default 15:00) from the real game, driven by the scripted test driver.
// Needs the capture build: `npx vite build --mode capture`.
//   node scripts/longplay.mjs [minutes=15] [quality=low] [WxH=1280x720]
// Every video frame advances the game's own clock by exactly 1/30 s, so playback is real game speed.
// Frames are read straight from the WebGL canvas (much faster than page screenshots in a
// software-rendered browser) and piped into ffmpeg, one part per level, so an interrupted run
// resumes at the first missing part. The DOM HUD is not part of the canvas and is not shown;
// each part opens with a short level-title caption. No audio track.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const minutes = Number(process.argv[2] ?? 15);
const quality = process.argv[3] ?? 'low';
const [W, H] = (process.argv[4] ?? '1280x720').split('x').map(Number);
const FPS = 30;
const TOTAL = Math.round(minutes * 60 * FPS);
const OUT_DIR = 'media/longplay';
const PARTS = `${OUT_DIR}/parts`;
const FONT = '/usr/share/fonts/opentype/inter/Inter-Bold.otf';
mkdirSync(PARTS, { recursive: true });

// Level names straight from the level data (so captions never drift from the game).
const levelsSrc = readFileSync('src/data/levels.ts', 'utf8');
const NAMES = Object.fromEntries([...levelsSrc.matchAll(/id: '([hcm]\d+)', world: (\d), name: '([^']+)'/g)].map((m) => [m[1], { world: Number(m[2]), name: m[3] }]));
const WORLD = { 1: 'Sunlit Harbor', 2: 'Canyon Express', 3: 'Midnight Market' };

// Set list: a tour through all three worlds, then Long Haul. Longer than needed; trimmed to the target.
const PLAYLIST = [
  ...['h2', 'h3', 'h5', 'h6', 'h8', 'h10', 'c1', 'c3', 'c5', 'c7', 'c10', 'm2', 'm4', 'm7', 'm10'].map((id) => ({ req: { mode: 'campaign', levelId: id }, cap: 110 })),
  { req: { mode: 'endless' }, cap: 240 },
];
const caption = (req) => {
  if (req.mode === 'endless') return 'Long Haul · endless road';
  const l = NAMES[req.levelId];
  const n = Number(req.levelId.slice(1));
  return `${WORLD[l.world]} ${n} · ${l.name}`;
};

const probeFrames = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]).toString().trim());

const PORT = 4197;
const server = spawn('node', ['scripts/serve-nested.mjs', 'dist-capture', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
ctx.setDefaultTimeout(300000);
const save = JSON.stringify({ version: 2, tutorialDone: true, coins: 0, settings: { quality, shake: 0.6, master: 0, music: 0, sfx: 0 } });
await ctx.addInitScript((v) => localStorage.setItem('standalone:wobblehaul.save', v), save);
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/games/overloaded/index.html?platform=standalone&capture=1`);
await page.waitForFunction(() => window.__wh !== undefined, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; window.__wh.manual(true); });

let done = 0; // frames already in finished parts
const parts = [];
const t0 = Date.now();
for (let i = 0; i < PLAYLIST.length && done < TOTAL; i++) {
  const item = PLAYLIST[i];
  const file = `${PARTS}/part-${String(i).padStart(2, '0')}.mp4`;
  if (existsSync(file)) {
    const n = probeFrames(file);
    done += n;
    parts.push(file);
    console.log(`skip ${file} (${n} frames, total ${done})`);
    continue;
  }
  const capFile = `${PARTS}/caption-${i}.txt`;
  writeFileSync(capFile, caption(item.req));
  const tmp = `${file}.tmp.mp4`;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `drawtext=fontfile=${FONT}:textfile=${capFile}:fontsize=${Math.round(H * 0.045)}:fontcolor=white:box=1:boxcolor=0x24304acc:boxborderw=${Math.round(H * 0.018)}:x=(w-text_w)/2:y=h*0.08:enable='lt(t,3.2)',format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', String(FPS), '-movflags', '+faststart', '-an', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));

  await page.evaluate((o) => {
    const g = window.__wh.game;
    g.startRun(o.req);
    g.autopilot = new (window.__wh.Autopilot)({ greed: 0.85, shedForBeams: true });
    g.renderer.follow.reset();
  }, item);
  let frames = 0;
  let after = -1; // frames left to keep after the run ends (finish or crash)
  let retried = false;
  const maxFrames = item.cap * FPS;
  while (done + frames < TOTAL && frames < maxFrames) {
    const st = await page.evaluate(() => {
      window.__wh.tick(1 / 30, 1);
      const run = window.__wh.game.run;
      return { b64: document.getElementById('game').toDataURL('image/jpeg', 0.9).slice(23), state: run ? run.state : 'none' };
    });
    await write(Buffer.from(st.b64, 'base64'));
    frames++;
    if (after < 0 && st.state !== 'running') after = st.state === 'crashed' ? 75 : 90;
    if (after >= 0 && after-- === 0) {
      // one honest retry after a crash, then move on
      if (st.state === 'crashed' && !retried) {
        retried = true;
        after = -1;
        await page.evaluate(() => {
          const g = window.__wh.game;
          g.restartRun();
          g.autopilot = new (window.__wh.Autopilot)({ greed: 0.85, shedForBeams: true });
          g.renderer.follow.reset();
        });
        continue;
      }
      break;
    }
    if (frames % 300 === 0) {
      const rate = (Date.now() - t0) / 1000 / (done + frames);
      console.log(`part ${i} ${caption(item.req)}: ${frames} frames; total ${done + frames}/${TOTAL}; ${rate.toFixed(2)} s/frame; ~${(((TOTAL - done - frames) * rate) / 3600).toFixed(1)} h left`);
    }
  }
  ff.stdin.end();
  await ffDone;
  renameSync(tmp, file);
  done += frames;
  parts.push(file);
  console.log(`wrote ${file}: ${frames} frames (${caption(item.req)}), total ${done}/${TOTAL}`);
}
await browser.close();
server.kill();

if (done < TOTAL) throw new Error(`playlist too short: ${done} of ${TOTAL} frames`);
const list = `${OUT_DIR}/parts.txt`;
writeFileSync(list, parts.map((p) => `file '${p.replace(`${OUT_DIR}/`, '')}'`).join('\n'));
const final = `${OUT_DIR}/overloaded-gameplay-${minutes}min-${W}x${H}.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
console.log(`wrote ${final}`);
