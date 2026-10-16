// Screenshot tour of the production build (dist/) the way a portal reviewer first meets the game:
//   node scripts/tour.mjs [WxH=1280x720] [tag=desk|phone] [outDir=qa/tmp/tour]
// First launch (title -> tutorial), then a returning player (menu, levels, garage, settings, Canyon and
// Midnight runs with the scripted driver, pause, results). Software GL: stills only, not frame rate.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const PORT = 4331;
const OUT = process.argv[4] ?? 'qa/tmp/tour';
const [W, H] = (process.argv[2] ?? '1280x720').split('x').map(Number);
const tag = process.argv[3] ?? 'desk';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const mk = async (save) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: tag === 'phone', isMobile: tag === 'phone' });
  ctx.setDefaultTimeout(120000);
  if (save) await ctx.addInitScript((v) => localStorage.setItem('standalone:wobblehaul.save', v), JSON.stringify(save));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/index.html?platform=standalone&qa=1`);
  await page.waitForFunction(() => window.__wh !== undefined, null, { timeout: 90000 });
  return { ctx, page };
};
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, timeout: 120000 }); console.log('shot', name); };
// 1. first launch: title, then the tutorial
{
  const { ctx, page } = await mk(null);
  await page.waitForSelector('[data-testid=screen-title]', { state: 'visible' });
  await page.waitForTimeout(1500);
  await shot(page, '01-title');
  await page.click('[data-testid=btn-start]', { force: true });
  await page.waitForTimeout(3500);
  await shot(page, '02-tutorial-start');
  await page.evaluate(() => { window.__wh.autopilot(true, 0.8); });
  await page.waitForTimeout(9000);
  await shot(page, '03-tutorial-mid');
  await page.waitForTimeout(9000);
  await shot(page, '04-tutorial-later');
  await ctx.close();
}
// 2. returning player: menu, levels, garage, settings, a mid-campaign run, pause, results
{
  const { ctx, page } = await mk({ version: 2, tutorialDone: true, coins: 340, settings: { quality: 'high' } });
  await page.waitForFunction(() => window.__wh.state().fsm === 'menu');
  await page.waitForTimeout(2500);
  await shot(page, '05-menu');
  for (const [btn, name] of [['btn-play', '06-levels'], ['btn-garage', '07-garage'], ['btn-settings', '08-settings']]) {
    const el = await page.$(`[data-testid=${btn}]`);
    if (!el) { console.log('missing', btn); continue; }
    await el.click({ force: true });
    await page.waitForTimeout(1500);
    await shot(page, name);
    await page.evaluate(() => window.__wh.game.toMenu());
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => { const w = window.__wh; w.game.startRun({ mode: 'campaign', levelId: 'c5' }); w.autopilot(true, 0.85); });
  await page.waitForTimeout(12000);
  await shot(page, '09-canyon-run');
  await page.evaluate(() => { const w = window.__wh; w.game.startRun({ mode: 'campaign', levelId: 'm4' }); w.autopilot(true, 0.85); });
  await page.waitForTimeout(12000);
  await shot(page, '10-market-run');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(1000);
  await shot(page, '11-pause');
  await page.evaluate(() => { const w = window.__wh; w.game.startRun({ mode: 'campaign', levelId: 'h2' }); w.autopilot(true, 0.85); w.speed(6); });
  await page.waitForFunction(() => ['results', 'crashed'].includes(window.__wh.state().fsm) || window.__wh.state().run !== 'running', null, { timeout: 240000 });
  await page.waitForTimeout(4000);
  await shot(page, '12-results');
  await ctx.close();
}
await browser.close();
server.kill();
