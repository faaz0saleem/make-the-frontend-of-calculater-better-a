import { test, expect, type Frame } from '@playwright/test';
import { baseSave, expectNoErrors, openGame, waitState } from './util';

/**
 * Audio checks on the production build: what the player hears at default volume settings,
 * measured sample-exact with ScriptProcessor taps on the music bus, the effects bus and the
 * final output (after the compressor). Headless Chromium uses a fake audio device, so the
 * levels are exact; speakers are not involved.
 */

type Bus = 'music' | 'sfx' | 'out';

async function installTaps(f: Frame): Promise<void> {
  await f.evaluate(() => {
    const w = window as unknown as { __wh: { game: { audio: Record<string, unknown> & { ctx: AudioContext } } }; __taps: Record<string, number[][]>; __keep: AudioNode[] };
    const a = w.__wh.game.audio;
    const c = a.ctx;
    w.__taps = {};
    w.__keep = [];
    const sink = c.createGain();
    sink.gain.value = 0;
    sink.connect(c.destination);
    for (const [k, node] of Object.entries({ music: a.music, sfx: a.sfx, out: a.comp }) as [string, AudioNode][]) {
      const sp = c.createScriptProcessor(1024, 1, 1);
      const blocks: number[][] = (w.__taps[k] = []);
      sp.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        let s = 0;
        let p = 0;
        for (let i = 0; i < d.length; i++) {
          s += d[i] * d[i];
          p = Math.max(p, Math.abs(d[i]));
        }
        blocks.push([s / d.length, p]);
      };
      node.connect(sp);
      sp.connect(sink);
      w.__keep.push(sp);
    }
  });
}

interface Level { rms: number; median: number; maxWin: number; peak: number; blocks: number }

async function measure(f: Frame, ms: number, before?: () => Promise<unknown>): Promise<Record<Bus, Level>> {
  const drain = () => f.evaluate(() => {
    const t = (window as unknown as { __taps: Record<string, number[][]> }).__taps;
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.splice(0)]));
  });
  await drain();
  if (before) await before();
  await f.waitForTimeout(ms);
  const raw = (await drain()) as Record<Bus, number[][]>;
  const db = (x: number) => (x > 1e-12 ? 10 * Math.log10(x) : -120);
  const out = {} as Record<Bus, Level>;
  for (const k of Object.keys(raw) as Bus[]) {
    const ms2 = raw[k].map((b) => b[0]);
    const sorted = [...ms2].sort((x, y) => x - y);
    out[k] = {
      rms: db(ms2.reduce((a, b) => a + b, 0) / Math.max(1, ms2.length)),
      median: db(sorted[Math.floor(sorted.length / 2)] ?? 0),
      maxWin: db(Math.max(0, ...ms2)),
      peak: db(Math.max(0, ...raw[k].map((b) => b[1] * b[1]))),
      blocks: ms2.length,
    };
  }
  return out;
}

const audioState = (f: Frame) => f.evaluate(() => (window as unknown as { __wh: { game: { audio: { ctx: AudioContext | null } } } }).__wh.game.audio.ctx?.state ?? 'none');

test('menu is silent before the first gesture and has audible music after it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const f = await openGame(page, '?qa=1&platform=standalone', baseSave({ settings: { quality: 'low' } }));
  await waitState(f, "s.fsm === 'menu'");
  expect(await audioState(f)).toBe('none');
  await f.locator('#ui').click({ position: { x: 4, y: 4 }, force: true });
  await expect.poll(() => audioState(f)).toBe('running');
  await installTaps(f);
  await f.waitForTimeout(1500);
  const menu = await measure(f, 4000);
  console.log('menu', JSON.stringify(menu));
  expect(menu.music.rms).toBeGreaterThan(-31);
  expect(menu.music.rms).toBeLessThan(-18);
  expect(menu.out.peak).toBeLessThan(-0.5);
  await expectNoErrors(errors);
});

test('driving: music is audible, the engine sits under it, pickup/drop sounds stand out, ads silence everything', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const f = await openGame(page, '?qa=1&platform=standalone', baseSave({ settings: { quality: 'low' } }));
  await waitState(f, "s.fsm === 'menu'");
  await f.locator('#ui').click({ position: { x: 4, y: 4 }, force: true });
  await expect.poll(() => audioState(f)).toBe('running');
  await installTaps(f);
  await f.evaluate(() => {
    const w = (window as unknown as { __wh: { game: { startRun(r: unknown): void }; autopilot(on: boolean, g: number): void } }).__wh;
    w.game.startRun({ mode: 'campaign', levelId: 'h3' });
    w.autopilot(true, 0.8);
  });
  await waitState(f, 's.gameplay === true');
  await f.waitForTimeout(2500);
  const drive = await measure(f, 6000);
  console.log('driving', JSON.stringify(drive));
  expect(drive.music.rms).toBeGreaterThan(-27);
  expect(drive.music.rms).toBeLessThan(-17);
  expect(drive.out.peak).toBeLessThan(-0.5);

  // Engine/tyre/wind bed alone (music bus muted for the measurement).
  await f.evaluate(() => {
    const g = (window as unknown as { __wh: { game: { audio: { music: GainNode } } } }).__wh.game.audio.music.gain;
    g.cancelScheduledValues(0);
    g.value = 0;
  });
  await f.waitForTimeout(300);
  const bed = await measure(f, 2000);
  console.log('engine bed', JSON.stringify(bed.sfx));
  expect(bed.sfx.median).toBeLessThan(-26);

  for (const name of ['pickup', 'spill', 'shed', 'bank']) {
    await f.waitForTimeout(250);
    const shot = await measure(f, 700, () => f.evaluate((n) => (window as unknown as { __wh: { game: { audio: { play(n: string): void } } } }).__wh.game.audio.play(n), name));
    const margin = shot.sfx.maxWin - bed.sfx.median;
    console.log(name, 'margin over engine', margin.toFixed(1), 'dB');
    expect(margin, `${name} must stand out over the engine`).toBeGreaterThan(8);
  }

  // An ad (or any other mute reason) silences the whole output.
  await f.evaluate(() => (window as unknown as { __wh: { game: { audio: { addMute(r: string): void } } } }).__wh.game.audio.addMute('ad'));
  await f.waitForTimeout(400);
  const muted = await measure(f, 1500);
  expect(muted.out.maxWin).toBeLessThan(-70);
  await f.evaluate(() => (window as unknown as { __wh: { game: { audio: { removeMute(r: string): void } } } }).__wh.game.audio.removeMute('ad'));
  await expectNoErrors(errors);
});
