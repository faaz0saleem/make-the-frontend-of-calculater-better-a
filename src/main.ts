import './ui/base.css';
import './ui/styles.css';
import { Game } from './game/game';
import { selectPlatform } from './platform/select';
import { ProgressStore } from './progression/store';
import { UiRoot } from './ui/screens';
import { Autopilot } from './sim/autopilot';
import { CARGO } from './data/cargo';

const params = new URLSearchParams(location.search);
const bootFill = document.getElementById('boot-fill') as HTMLElement | null;
const progress = (p: number) => {
  if (bootFill) bootFill.style.width = `${Math.round(p * 100)}%`;
};

function fatal(msg: string): void {
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.remove('hidden');
    boot.innerHTML = `<div class="boot-logo">WOBBLE<span>HAUL</span></div><p style="max-width:420px;text-align:center;font-weight:600">${msg}</p>`;
  }
}

async function boot(): Promise<void> {
  progress(0.15);
  const { platform, note } = await selectPlatform(__RELEASE_STAGE__, params);
  platform.loadingStart();
  progress(0.4);
  // Read existing progress before anything can write defaults.
  const store = new ProgressStore(platform.storage());
  await store.init();
  progress(0.6);
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fonts optional */
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  let game: Game;
  try {
    game = new Game(canvas, platform, store);
  } catch (e) {
    platform.loadingStop();
    fatal('Your browser could not start WebGL. Please enable hardware acceleration or try another browser.');
    console.error(e);
    return;
  }
  const ui = new UiRoot(document.getElementById('ui') as HTMLElement, game);
  game.ui = ui;
  progress(0.85);
  game.fsm.go('loading');
  if (!store.data.tutorialDone) game.showTitle();
  else game.toMenu();
  game.refreshSaveNotice();
  progress(1);
  platform.loadingStop();
  game.start();
  setTimeout(() => document.getElementById('boot')?.classList.add('hidden'), 120);

  // Development overlay (compiled out of production builds).
  if (__DEV_TOOLS__) {
    let on = params.get('dev') === '1';
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') on = !on;
    });
    setInterval(() => {
      if (on) ui.devOverlay(`${game.devText()}\n${note}`);
    }, 250);
  }
  // Query-gated QA hooks for automated browser tests (read-mostly; no reward grants).
  if (params.get('qa') === '1' || __DEV_TOOLS__) {
    (window as unknown as Record<string, unknown>).__wh = {
      game,
      state: () => ({
        fsm: game.fsm.state, pause: game.pause.list(), run: game.run?.state ?? null, crash: game.run?.crashReason ?? null,
        coins: store.coins, tokens: store.data.tokens, gameplay: game.isGameplayActive, mute: game.audio.muteReasons(),
        tutorialDone: store.data.tutorialDone, health: store.health, platform: platform.name, env: platform.environment,
        sdk: platform.log.map((l) => l.event), progress: game.run?.progress ?? 0, distance: game.run?.distance ?? 0,
        items: game.run?.truck.itemCount ?? 0, preset: game.renderer.preset.name,
      }),
      autopilot: (on: boolean, greed = 0.7) => {
        game.autopilot = on ? new Autopilot({ greed }) : null;
      },
      speed: (n: number) => {
        game.qaSpeed = Math.max(0.1, Math.min(12, n));
        // allow proportionally more catch-up so slow (software-rendered) test browsers keep up
        game.loop.maxSteps = Math.ceil(12 * Math.max(1, game.qaSpeed) * 4);
        game.loop.maxFrameDt = 0.25 * Math.max(1, game.qaSpeed) * 2;
      },
      manual: (on: boolean) => {
        game.manualClock = on;
      },
      tick: (dt: number, n = 1) => {
        for (let i = 0; i < n; i++) game.advance(dt);
      },
      note,
      ...(__CAPTURE_MODE__ ? { Autopilot, cargo: CARGO } : {}),
    };
  }
}

boot().catch((e) => {
  console.error(e);
  fatal('Something went wrong while loading. Please reload the page.');
});
