import { expect, type Frame, type Page } from '@playwright/test';

export interface WhState {
  fsm: string; pause: string[]; run: string | null; crash: string | null; coins: number; tokens: number; gameplay: boolean;
  mute: string[]; tutorialDone: boolean; health: string; platform: string; env: string; sdk: string[]; progress: number;
  distance: number; items: number; preset: string;
}

export async function openGame(page: Page, q = '?qa=1&platform=standalone', save?: unknown): Promise<Frame> {
  if (save !== undefined) {
    await page.addInitScript(([k, v]) => {
      try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k as string, v as string); sessionStorage.setItem('__seeded', '1'); } } catch { /* frame */ }
    }, ['standalone:wobblehaul.save', JSON.stringify(save)]);
  }
  await page.goto(`/?q=${encodeURIComponent(q)}`);
  const handle = await page.waitForSelector('#game-frame');
  const frame = (await handle.contentFrame())!;
  await frame.waitForFunction(() => (window as unknown as { __wh?: unknown }).__wh !== undefined, null, { timeout: 60_000 });
  return frame;
}

export const state = (f: Frame): Promise<WhState> => f.evaluate(() => (window as unknown as { __wh: { state(): WhState } }).__wh.state());

export async function waitState(f: Frame, pred: string, timeout = 120_000): Promise<void> {
  await f.waitForFunction(`(() => { const s = window.__wh.state(); return ${pred}; })()`, null, { timeout, polling: 500 });
}

export async function autopilot(f: Frame, speed = 8, greed = 0.7): Promise<void> {
  await f.evaluate(([s, g]) => {
    const w = (window as unknown as { __wh: { autopilot(o: boolean, g: number): void; speed(n: number): void } }).__wh;
    w.autopilot(true, g);
    w.speed(s);
  }, [speed, greed]);
}

export async function click(f: Frame, testid: string): Promise<void> {
  await f.locator(`[data-testid=${testid}]`).click({ force: true, timeout: 30_000 });
}

export const baseSave = (o: Record<string, unknown> = {}) => ({ version: 2, tutorialDone: true, coins: 0, ...o });

export async function expectNoErrors(errors: string[]): Promise<void> {
  expect(errors.filter((e) => !/sdk\.crazygames\.com|ERR_|net::|Failed to load resource/.test(e))).toEqual([]);
}
