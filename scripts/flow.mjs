// Ad-hoc flow runner: node scripts/flow.mjs <url> <outPrefix> <w> <h> <steps-json>
import { chromium } from '@playwright/test';
const [url, out, w = '1280', h = '720', stepsJson = '[]'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
let n = 0;
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) { try { await page.click(s.click, { timeout: 15000, force: !!s.force }); } catch (e) { console.log('CLICK FAILED', s.click); await page.screenshot({ path: `${out}-fail.png` }); break; } }
  if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
  if (s.key) await page.keyboard.press(s.key);
  if (s.shot) { await page.screenshot({ path: `${out}-${s.shot}.png` }); n++; }
  if (s.waitFor) {
    try { await page.waitForSelector(s.waitFor, { timeout: s.timeout ?? 20000 }); }
    catch (e) {
      console.log('WAIT FAILED', s.waitFor, JSON.stringify(await page.evaluate(() => window.__wh?.state())));
      await page.screenshot({ path: `${out}-fail.png` });
      break;
    }
  }
}
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
