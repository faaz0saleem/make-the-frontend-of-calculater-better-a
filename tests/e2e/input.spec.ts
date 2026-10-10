import { expect, test } from '@playwright/test';
import { baseSave, click, openGame, state, waitState } from './util';

const truckX = (f: import('@playwright/test').Frame) => f.evaluate(() => (window as unknown as { __wh: { game: { run: { truck: { x: number } } } } }).__wh.game.run.truck.x);

test('keyboard steering, Space shed, P pause', async ({ page }) => {
  const f = await openGame(page, undefined, baseSave());
  await click(f, 'mode-endless');
  await waitState(f, 's.gameplay');
  await f.locator('#game').focus();
  const x0 = await truckX(f);
  // software-rendered CI browsers simulate slowly; poll while the key is held
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => truckX(f), { timeout: 20_000 }).toBeGreaterThan(x0 + 0.5);
  await page.keyboard.up('ArrowRight');
  const x1 = await truckX(f);
  await page.keyboard.down('KeyA'); // physical A key (works for AZERTY 'Q' too)
  await expect.poll(() => truckX(f), { timeout: 20_000 }).toBeLessThan(x1 - 0.5);
  await page.keyboard.up('KeyA');
  // give the truck some cargo and shed it
  await f.evaluate(() => {
    const g = (window as unknown as { __wh: { game: { run: { truck: { addCargo(d: unknown, c: unknown[]): void } } } } }).__wh.game;
    g.run.truck.addCargo({ id: 'parcel', name: 'Parcel', desc: '', world: 1, mass: 4, height: 0.55, width: 0.9, value: 6, fragility: 0.1, grip: 0.8, crushLimit: Infinity }, []);
  });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(f)).items).toBe(0);
  await page.keyboard.press('KeyP');
  await expect.poll(async () => (await state(f)).fsm).toBe('paused');
});

test('mouse drag steers; releasing stops steering', async ({ page }) => {
  const f = await openGame(page, undefined, baseSave());
  await click(f, 'mode-endless');
  await waitState(f, 's.gameplay');
  const x0 = await truckX(f);
  await page.mouse.move(480, 300);
  await page.mouse.down();
  await page.mouse.move(600, 300, { steps: 5 });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  expect(await truckX(f)).toBeGreaterThan(x0 + 0.5);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
  test('horizontal touch drag steers and the SHED button works', async ({ page }) => {
    const f = await openGame(page, undefined, baseSave());
    await click(f, 'mode-endless');
    await waitState(f, 's.gameplay');
    const x0 = await truckX(f);
    // synthesize a touch drag via CDP-backed pointer events in the frame
    await f.evaluate(async () => {
      const c = document.getElementById('game')!;
      const ev = (type: string, x: number) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: 200, bubbles: true, isPrimary: true }));
      ev('pointerdown', 400);
      for (let i = 1; i <= 10; i++) { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: 400 + i * 10, clientY: 200, bubbles: true })); await new Promise((r) => setTimeout(r, 30)); }
    });
    await page.waitForTimeout(1500);
    await f.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', bubbles: true })));
    expect(await truckX(f)).toBeGreaterThan(x0 + 0.4);
    await f.evaluate(() => {
      const g = (window as unknown as { __wh: { game: { run: { truck: { addCargo(d: unknown, c: unknown[]): void } } } } }).__wh.game;
      g.run.truck.addCargo({ id: 'parcel', name: 'Parcel', desc: '', world: 1, mass: 4, height: 0.55, width: 0.9, value: 6, fragility: 0.1, grip: 0.8, crushLimit: Infinity }, []);
    });
    await f.locator('[data-testid=btn-shed]').tap();
    await expect.poll(async () => (await state(f)).items).toBe(0);
  });
});
