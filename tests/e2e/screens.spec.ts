import { test } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { baseSave, click, openGame, waitState } from './util';

// CrazyGames-documented sizes (devicePixelRatio 1) + phone portrait/landscape
const SIZES: [number, number][] = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [1280, 720], [800, 450], [1080, 607]];
const PHONES: [number, number][] = [[390, 844], [844, 390]];
const OUT = 'qa/screenshots';
const REPORT = 'qa/layout-report.json';

type Issue = { size: string; screen: string; problem: string; el: string };

async function audit(page: import('@playwright/test').Page, frame: import('@playwright/test').Frame, size: string, screen: string, issues: Issue[]): Promise<void> {
  // measure settled layout, not mid pop-in animation
  await frame.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
  const found = await frame.evaluate(() => {
    const out: { problem: string; el: string }[] = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
    };
    const label = (e: Element) => (e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40);
    const btns = [...document.querySelectorAll('#ui button')].filter(vis);
    // inside a scroll container is fine; otherwise must be inside the viewport
    const scroller = (e: Element) => e.closest('.sheet-body, .item-list, .lines');
    // the part of a button actually visible through its scroll container
    const visibleRect = (e: Element) => {
      const r = e.getBoundingClientRect();
      const sc = scroller(e);
      if (!sc) return r;
      const c = sc.getBoundingClientRect();
      return new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left)), Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)));
    };
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (!scroller(b) && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1)) out.push({ problem: 'outside viewport', el: label(b) });
      if (b.scrollWidth > b.clientWidth + 2) out.push({ problem: 'text overflows button', el: label(b) });
      if ((r.height < 36 || r.width < 36) && !b.classList.contains('tab')) out.push({ problem: `small target ${Math.round(r.width)}x${Math.round(r.height)}`, el: label(b) });
    }
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = visibleRect(btns[i]), b = visibleRect(btns[j]);
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 3 && iy > 3 && !btns[i].contains(btns[j]) && !btns[j].contains(btns[i])) out.push({ problem: 'buttons overlap', el: `${label(btns[i])} / ${label(btns[j])}` });
    }
    for (const t of [...document.querySelectorAll('#ui h2, #ui .hud-pill, #ui .mc-title, #ui .play-sub')].filter(vis)) {
      const r = t.getBoundingClientRect();
      if (!scroller(t) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1)) out.push({ problem: 'text clipped by viewport', el: label(t) });
    }
    return out;
  });
  for (const f of found) issues.push({ size, screen, ...f });
  await page.screenshot({ path: `${OUT}/${size}-${screen}.png` });
}

for (const [w, h] of [...SIZES, ...PHONES]) {
  const size = `${w}x${h}`;
  test(`screens at ${size}`, async ({ page, browser }) => {
    test.setTimeout(480_000);
    mkdirSync(OUT, { recursive: true });
    const issues: Issue[] = [];
    const phone = PHONES.some(([a, b]) => a === w && b === h);
    const ctx = phone ? await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }) : null;
    const pg = ctx ? await ctx.newPage() : page;
    if (!ctx) await pg.setViewportSize({ width: w, height: h });
    const f = await openGame(pg, undefined, baseSave({ coins: 1234, settings: { quality: 'low' }, campaign: { levels: { h1: { done: true, medals: [true, true, false], bestValue: 42, plays: 1 } } } }));
    await waitState(f, "s.fsm === 'menu'", 30_000);
    await pg.waitForTimeout(800);
    await audit(pg, f, size, 'menu', issues);
    await click(f, 'mode-campaign');
    await pg.waitForTimeout(600);
    await audit(pg, f, size, 'levels', issues);
    await click(f, 'lvl-h2');
    await pg.waitForTimeout(600);
    await audit(pg, f, size, 'briefing', issues);
    await click(f, 'btn-drive');
    await waitState(f, 's.gameplay');
    await f.evaluate(() => (window as unknown as { __wh: { autopilot(o: boolean): void; speed(n: number): void } }).__wh.autopilot(true));
    await f.evaluate(() => (window as unknown as { __wh: { speed(n: number): void } }).__wh.speed(4));
    await f.waitForFunction(() => (window as unknown as { __wh: { state(): { items: number } } }).__wh.state().items >= 2, null, { timeout: 120_000, polling: 300 });
    await audit(pg, f, size, 'hud', issues);
    await click(f, 'btn-pause');
    await pg.waitForTimeout(500);
    await audit(pg, f, size, 'pause', issues);
    await click(f, 'btn-resume');
    await pg.waitForTimeout(300);
    await f.evaluate(() => (window as unknown as { __wh: { game: { run: { finish(): void } } } }).__wh.game.run.finish());
    await f.waitForSelector('[data-testid=screen-results]', { timeout: 60_000 });
    await pg.waitForTimeout(1800);
    await audit(pg, f, size, 'results', issues);
    await click(f, 'btn-res-garage');
    await pg.waitForTimeout(1200);
    await audit(pg, f, size, 'garage', issues);
    await click(f, 'gtab-upgrades');
    await pg.waitForTimeout(500);
    await audit(pg, f, size, 'garage-upgrades', issues);
    await click(f, 'btn-garage-back');
    await pg.waitForTimeout(500);
    await click(f, 'btn-res-menu');
    await pg.waitForTimeout(500);
    await click(f, 'btn-settings');
    await pg.waitForTimeout(500);
    await audit(pg, f, size, 'settings', issues);
    const prev: Issue[] = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')).filter((i: Issue) => i.size !== size) : [];
    writeFileSync(REPORT, JSON.stringify([...prev, ...issues], null, 2));
    await ctx?.close();
  });
}
