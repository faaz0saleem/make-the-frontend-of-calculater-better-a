import { AudioManager } from '../audio/audio';
import { FixedLoop } from '../core/loop';
import { PauseManager } from '../core/pause';
import { StateMachine, type AppState } from '../core/fsm';
import { utcDateKey } from '../core/time';
import { CARGO } from '../data/cargo';
import { paintById } from '../data/cosmetics';
import { ECONOMY } from '../data/economy';
import { LEVEL_BY_ID, LEVELS } from '../data/levels';
import { TUNING } from '../data/tuning';
import { applyUpgrades, type EffectiveHandling } from '../data/upgrades';
import { VEHICLES, type VehicleKind } from '../data/vehicles';
import { Input } from '../input/input';
import { buildLevel, levelSpeedAt } from '../modes/campaign';
import { dailySpec, type DailySpec } from '../modes/daily';
import { EndlessRoute } from '../modes/endless';
import { AdController } from '../platform/ads';
import type { PlatformAdapter } from '../platform/types';
import type { Reward, RunSummary } from '../progression/rewards';
import type { ProgressStore } from '../progression/store';
import { GameRenderer } from '../render/renderer';
import { Thumbnailer } from '../render/thumbs';
import type { PlacedChunk } from '../sim/builder';
import { RunSession, type RunMode } from '../sim/run';
import { Hud } from '../ui/hud';
import { RunView } from './runView';
import { GameplayGate } from './lifecycle';
import { Autopilot } from '../sim/autopilot';

export interface RunRequest {
  mode: RunMode;
  levelId?: string;
  daily?: DailySpec;
}

export interface UiBridge {
  /** Show a named screen; implemented by ui/screens. */
  show(name: AppState | 'title', data?: unknown): void;
  hideScreens(): void;
  notice(text: string | null): void;
  root: HTMLElement;
  devOverlay?(text: string): void;
}

// Tutorial tips, in the order the tutorial shows them (one idea each; key = keyboard/mouse, touch = touch).
const TIPS: Record<string, { key: string; touch: string }> = {
  cargo: { key: 'Drive into cargo to <b>stack it</b> on your truck. More cargo, more coins!', touch: 'Drive into cargo to <b>stack it</b> on your truck. More cargo, more coins!' },
  steer: { key: 'Steer with <b>A</b> / <b>D</b>, the <b>arrow keys</b> or a mouse <b>drag</b>. Grab the cargo on the right!', touch: '<b>Drag left or right</b> anywhere to steer. Grab the cargo on the right!' },
  wobble: { key: 'Tall stacks lean in corners. <b>Steer smoothly</b> and keep the <b>STABLE</b> meter green.', touch: 'Tall stacks lean in corners. <b>Steer smoothly</b> and keep the <b>STABLE</b> meter green.' },
  shed: { key: 'Low beam ahead and your stack is too tall! Press <b>SPACE</b> to drop the top item.', touch: 'Low beam ahead and your stack is too tall! Tap <b>SHED</b> to drop the top item.' },
  deliver: { key: 'Drive under the depot arch to deliver. <b>Undamaged cargo pays full price.</b>', touch: 'Drive under the depot arch to deliver. <b>Undamaged cargo pays full price.</b>' },
};

export class Game {
  readonly renderer: GameRenderer;
  readonly input: Input;
  readonly audio = new AudioManager();
  readonly pause = new PauseManager();
  readonly fsm = new StateMachine();
  readonly ads: AdController;
  readonly thumbs: Thumbnailer;
  readonly loop: FixedLoop;
  readonly gate: GameplayGate;
  ui!: UiBridge;
  run: RunSession | null = null;
  view: RunView | null = null;
  hud: Hud | null = null;
  endless: EndlessRoute | null = null;
  req: RunRequest | null = null;
  runId = '';
  private runCounter = 0;
  private endTimer = 0;
  private endHandled = false;
  lastReward: Reward | null = null;
  lastSummary: RunSummary | null = null;
  private gameplayActive = false;
  private timeScale = 1;
  private tipShed = false;
  private tipTimer = 0;
  private countdownLeft = 0;
  private sessionStart = performance.now();
  private crashesSinceOffer = 99;
  rewardOfferedThisBreak = false;
  private lastHudT = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  frameMs = 16;
  private slowTime = 0;
  touch = matchMedia('(pointer: coarse)').matches;
  private disposers: (() => void)[] = [];
  backdropWorld: 1 | 2 | 3 = 1;
  private backdropBuilt = '';
  /** Capture mode (media recording) drives the loop manually. */
  manualClock = false;
  /** Garage turntable animation hook. */
  overlayUpdate: ((dt: number) => void) | null = null;
  /** QA/capture: scripted driver replaces player steering (query-gated). */
  autopilot: Autopilot | null = null;
  qaSpeed = 1;

  constructor(canvas: HTMLCanvasElement, readonly platform: PlatformAdapter, readonly store: ProgressStore) {
    const s = store.data.settings;
    this.renderer = new GameRenderer(canvas, s.quality, s.resScale);
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.thumbs = new Thumbnailer(this.renderer.renderer);
    this.input = new Input(canvas);
    this.input.settings.sensitivity = s.sensitivity;
    // Browsers only allow sound after a gesture: the first key/tap anywhere starts the audio (and the menu music).
    this.input.onAnyInput = () => this.audio.unlock();
    this.ads = new AdController(platform, this.pause, this.audio);
    this.gate = new GameplayGate(platform);
    this.loop = new FixedLoop({ step: (dt) => this.step(dt), render: (a, fdt) => this.render(a, fdt) }, TUNING.simHz, 12);
    this.applySettings();
    this.bindLifecycle();
  }

  // ------------------------------------------------------------------ lifecycle wiring
  private bindLifecycle(): void {
    const on = (t: EventTarget, ev: string, fn: EventListener) => {
      t.addEventListener(ev, fn);
      this.disposers.push(() => t.removeEventListener(ev, fn));
    };
    on(document, 'visibilitychange', () => {
      if (document.hidden) {
        this.pause.add('hidden');
        this.audio.addMute('hidden');
        this.input.releaseAll();
      } else {
        this.audio.removeMute('hidden');
        this.audio.resumeIfNeeded();
        // Open the pause menu before dropping 'hidden' so gameplay never resumes for an instant.
        if (this.fsm.state === 'driving') this.openPause();
        this.pause.remove('hidden');
      }
    });
    on(window, 'blur', () => {
      this.pause.add('blur');
      this.input.releaseAll();
    });
    on(window, 'focus', () => {
      if (this.fsm.state === 'driving' && this.run?.state === 'running') this.openPause();
      this.pause.remove('blur');
    });
    // A lost WebGL context freezes the picture: stop the run instead of letting it play on unseen.
    on(this.renderer.canvas, 'webglcontextlost', () => {
      this.openPause();
      this.pause.add('gpu');
      this.input.releaseAll();
    });
    on(this.renderer.canvas, 'webglcontextrestored', () => {
      // Back to a working picture: show the pause menu first so the run only resumes on intent.
      if (this.fsm.state === 'driving') this.openPause();
      this.pause.remove('gpu');
    });
    on(window, 'resize', () => this.renderer.resize(window.innerWidth, window.innerHeight));
    on(window, 'pointerdown', () => this.audio.unlock());
    on(window, 'keydown', () => this.audio.unlock());
    // platform mute (overrides user volume; combined with other mute reasons)
    if (this.platform.settings().muteAudio) this.audio.addMute('platform');
    this.disposers.push(
      this.platform.onSettingsChange((st) => {
        if (st.muteAudio) this.audio.addMute('platform');
        else this.audio.removeMute('platform');
      }),
      this.platform.onAuthChange(() => void this.onAccountChange()),
      this.store.events.on('saveError', () => this.refreshSaveNotice()),
      this.store.events.on('saved', () => this.refreshSaveNotice()),
      this.pause.onChange(() => this.updateGameplayState()),
      this.fsm.onChange(() => this.updateGameplayState()),
    );
  }

  private async onAccountChange(): Promise<void> {
    // Never merge saves across identities: abandon the current run unsettled and reload.
    this.abandonRun();
    await this.store.reload();
    this.applySettings();
    this.toMenu();
    this.ui.notice('Account changed: progress reloaded for this account.');
    setTimeout(() => this.refreshSaveNotice(), 4000);
  }

  refreshSaveNotice(): void {
    const s = this.store;
    if (s.health === 'readFailed') this.ui.notice('Progress could not be loaded. You can keep playing, but this session will not be saved.');
    else if (s.health === 'writeFailed') this.ui.notice('Saving failed. Retrying on your next action.');
    else if (s.health === 'tooLarge') this.ui.notice('Save data too large to store.');
    else this.ui.notice(null);
  }

  applySettings(): void {
    const s = this.store.data.settings;
    this.audio.setVolumes(s.master, s.music, s.sfx);
    if (s.muted) this.audio.addMute('user');
    else this.audio.removeMute('user');
    this.renderer.follow.shakeScale = s.shake;
    this.renderer.follow.reducedMotion = s.reducedMotion;
    if (this.view) this.view.reducedMotion = s.reducedMotion;
    this.input.settings.sensitivity = s.sensitivity;
    if (this.renderer.setting !== s.quality || this.renderer.resolutionScale !== s.resScale) this.renderer.setQuality(s.quality, s.resScale);
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
  }

  /** gameplayStart/Stop strictly mirror real active driving. */
  private updateGameplayState(): void {
    const changed = this.gate.update(this.fsm.state === 'driving', this.pause.paused, !!this.run && this.run.state === 'running');
    if (!changed) return;
    this.gameplayActive = this.gate.active;
    this.input.enabled = this.gameplayActive;
    if (!this.gameplayActive) this.audio.duckDrive(true);
  }

  get isGameplayActive(): boolean {
    return this.gameplayActive;
  }

  // ------------------------------------------------------------------ main loop
  private lastNow = 0;
  start(): void {
    const tick = (now: number) => {
      if (!this.manualClock) this.frame(now);
      requestAnimationFrame(tick);
    };
    this.lastNow = performance.now();
    requestAnimationFrame(tick);
  }

  frame(now: number): void {
    const dtReal = Math.min(0.25, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.fpsAcc += dtReal;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.frameMs = (this.fpsAcc / this.fpsFrames) * 1000;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      // Auto quality: step down after sustained low frame rate while driving.
      if (this.fsm.state === 'driving' && this.fps < 40) this.slowTime++;
      else this.slowTime = Math.max(0, this.slowTime - 1);
      if (this.slowTime >= 5 && this.renderer.degrade()) {
        this.slowTime = 0;
        this.rebuildWorldVisuals();
      }
    }
    this.advance(dtReal);
  }

  /** Advance by a real-time delta (used by rAF and by capture mode). */
  advance(dtReal: number): void {
    const st = this.fsm.state;
    this.loop.running = !!this.run && !this.pause.paused && (st === 'driving' || st === 'crashed' || st === 'results');
    this.loop.advance(dtReal * this.timeScale * this.qaSpeed);
    if (this.countdownLeft > 0) this.tickCountdown(dtReal);
  }

  private step(dt: number): void {
    const run = this.run;
    if (!run) return;
    if (run.state === 'running') {
      if (this.input.consumePause()) {
        this.openPause();
        return;
      }
      let steer = this.input.steer(dt);
      let shed = this.input.consumeShed();
      if (this.autopilot && this.gameplayActive) {
        const a = this.autopilot.input(run, dt);
        steer = a.steer;
        shed = shed || a.shed;
      }
      run.step(dt, { steer, shed });
    } else {
      run.step(dt, { steer: 0, shed: false });
    }
    this.view?.snapshot();
    if (this.endless) {
      const { rebased } = this.endless.update(run.truck.s);
      if (rebased) {
        run.truck.s -= rebased;
        this.view?.rebased(rebased);
      }
      if (this.endless.finishS !== null) run.cfg.finishS = this.endless.finishS;
    }
    // end-of-run handling
    if (run.state !== 'running' && !this.endHandled) {
      this.endTimer += dt;
      const wait = run.state === 'finished' ? 2.0 : 1.3;
      if (this.endTimer >= wait) {
        this.endHandled = true;
        this.onRunEnded();
      }
    }
  }

  private render(alpha: number, frameDt: number): void {
    if (this.overlayUpdate) this.overlayUpdate(frameDt);
    if (this.view && !this.renderer.overlayScene) {
      this.view.frame(frameDt, alpha);
      const run = this.run;
      if (run && this.hud && this.fsm.state === 'driving') {
        const t = performance.now();
        if (t - this.lastHudT > 50) {
          this.lastHudT = t;
          this.updateHud();
        }
        if (this.tipTimer > 0) {
          this.tipTimer -= frameDt;
          if (this.tipTimer <= 0 && !this.tipShed) this.hud.tip(null);
        }
      }
      if (run && this.gameplayActive) {
        const tr = run.truck;
        const slip = Math.min(1, Math.abs(tr.ax) / 25 + (run.truck.maxRatio > 0.6 ? 0.2 : 0));
        this.audio.updateDrive(tr.vs, slip, Math.min(1, tr.itemCount / 8), this.renderer.streaks.windStrength / 4, tr.airborne);
      }
    }
    this.renderer.render();
  }

  private updateHud(): void {
    const run = this.run!;
    const tr = run.truck;
    const st = run.stats;
    let lean = 0;
    for (const c of tr.columns) for (const it of c.items) lean += it.o / 0.2;
    lean = Math.max(-1, Math.min(1, lean / Math.max(1, tr.itemCount) + tr.roll * 3));
    let wind = 0;
    for (const f of run.track.features) {
      if (f.kind === 'gust' && tr.s >= f.s - 20 && tr.s <= f.s + f.len) wind = (f.dir ?? 1) * (f.strength ?? 1);
      if (f.s > tr.s + 30) break;
    }
    this.hud!.update({
      coins: st.coins, items: tr.itemCount, capacity: tr.capacityTotal, value: run.cargoValue,
      progress: this.req?.mode === 'endless' ? null : run.progress,
      distance: this.req?.mode === 'endless' || this.req?.mode === 'daily' ? run.distance : null,
      atRisk: this.req?.mode === 'endless' || this.req?.mode === 'daily' ? run.atRisk : null,
      mult: this.req?.mode === 'endless' || this.req?.mode === 'daily' ? run.multiplier : null,
      stability: tr.stability, lean, wind, tokens: this.store.data.tokens,
    });
  }

  // ------------------------------------------------------------------ runs
  private handlingFor(req: RunRequest): { kind: VehicleKind; h: EffectiveHandling } {
    if (req.mode === 'daily' && req.daily) {
      // Daily Contract: same loaner truck for everyone, no purchased upgrades.
      const kind = req.daily.vehicle;
      return { kind, h: applyUpgrades(VEHICLES[kind].stats, { suspension: 0, grip: 0, supports: 0 }) };
    }
    const kind = this.store.data.garage.equipped;
    return { kind, h: applyUpgrades(VEHICLES[kind].stats, this.store.data.upgrades) };
  }

  startRun(req: RunRequest): void {
    this.abandonRun();
    this.req = req;
    this.runCounter++;
    this.runId = `${Date.now().toString(36)}-${this.runCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const { kind, h } = this.handlingFor(req);
    let chunks: PlacedChunk[] = [];
    let run: RunSession;
    this.endless = null;
    if (req.mode === 'endless' || req.mode === 'daily') {
      const daily = req.daily;
      const seed = daily ? daily.seed : (Date.now() ^ (this.runCounter * 2654435761)) >>> 0;
      const route = new EndlessRoute({
        seed, handling: h, startWorld: daily ? daily.world : 1, fixedWorld: !!daily, finishDist: daily ? daily.distance : undefined,
        windBoost: daily?.windBoost, rainy: daily?.rainy, loadHeight: () => (this.run ? this.run.truck.stackTopAboveRoad() : 0),
      });
      this.endless = route;
      run = new RunSession({
        mode: req.mode, track: route.track, handling: h, seed, speedAt: route.speedAt, finishS: route.finishS,
        windScale: 1, wet: !!daily?.rainy,
      });
      chunks = route.placed;
    } else {
      const level = LEVEL_BY_ID[req.levelId ?? 'h1'];
      const built = buildLevel(level);
      run = new RunSession({
        mode: req.mode, track: built.track, handling: h, seed: 1 + this.runCounter, speedAt: levelSpeedAt(level, built.finishS!),
        finishS: built.finishS, windScale: level.wind ?? 1, wet: !!level.wet,
      });
      chunks = built.chunks;
    }
    this.run = run;
    this.currentChunks = chunks;
    this.crashCargoValue = 0;
    this.renderer.truck.setTruck(kind, paintById(this.store.displayPaint), this.store.data.garage.equippedAcc);
    this.renderer.truck.setVisible(true);
    this.view?.dispose();
    this.view = new RunView(this.renderer, run, chunks);
    this.view.reducedMotion = this.store.data.settings.reducedMotion;
    if (this.endless) {
      const route = this.endless;
      this.view.getChunks = () => route.placed;
      this.view.setRain(req.daily?.rainy ? 1 : 0);
    } else {
      const lv = LEVEL_BY_ID[req.levelId ?? 'h1'];
      this.view.setRain(lv.wet ? 0.8 : 0);
    }
    this.endTimer = 0;
    this.endHandled = false;
    this.tipShed = false;
    this.timeScale = 1;
    this.rewardOfferedThisBreak = false;
    this.lastReward = null;
    this.lastSummary = null;
    this.bindRunEvents(run);
    this.ui.hideScreens();
    this.hud?.destroy();
    this.hud = new Hud(this.ui.root, req.mode, { onPause: () => this.openPause(), onShed: () => this.input.requestShed() }, this.touch);
    this.loop.resetAccumulator();
    this.audio.unlock();
    this.audio.startDriveLoops();
    this.audio.setMusic(run.track.world, 1);
    this.pause.remove('user');
    this.pause.remove('countdown');
    this.goState('driving');
    this.updateGameplayState();
  }

  private bindRunEvents(run: RunSession): void {
    const ev = run.events;
    const a = this.audio;
    ev.on('coin', () => a.play('coin'));
    ev.on('pickup', ({ item }) => {
      a.play('pickup', 1, { height: run.truck.itemCount, cargo: item.def.id });
      if (!this.store.data.album.includes(item.def.id)) this.hud?.toast(`New cargo: ${item.def.name}!`, 'good');
      if (this.store.data.album.includes(item.def.id) && item.def.rare) this.hud?.toast('Golden Gnome!', 'good');
    });
    ev.on('full', () => {
      a.play('full');
      this.hud?.toast('Truck full!', 'bad');
    });
    ev.on('spill', ({ items, reason }) => {
      if (reason === 'crash') return;
      a.play('spill', 1, { count: items.length, cargo: items[0]?.item.def.id });
      const names = items.map((d) => d.item.def.name);
      this.hud?.toast(items.length > 1 ? `Lost ${items.length} items!` : `Lost: ${names[0]}`, 'bad');
    });
    ev.on('shed', ({ hero }) => {
      a.play('shed', 1, { hero });
      if (hero) this.hud?.toast('Smart shed!', 'good');
      if (this.tipShed) {
        this.tipShed = false;
        this.timeScale = 1;
        this.hud?.tip(null);
      }
    });
    ev.on('impact', ({ kind, strength }) => {
      a.play(kind === 'bump' ? 'bump' : 'impact', strength);
      a.rattle(3);
    });
    ev.on('scrape', ({ strength }) => a.play('scrape', strength / 3));
    ev.on('nearMiss', () => {
      a.play('nearMiss');
      this.hud?.toast(`Near miss +${ECONOMY.nearMissBonus}`, 'good');
    });
    ev.on('closeShave', () => {
      a.play('nearMiss');
      this.hud?.toast('Close shave!', 'good');
    });
    ev.on('recovery', () => {
      a.play('recovery');
      this.hud?.toast(`Nice save! +${ECONOMY.recoveryBonus}`, 'good');
    });
    ev.on('launch', () => a.play('launch'));
    ev.on('land', ({ jolt, clean }) => {
      a.play('land', jolt / 5);
      if (clean && jolt > 2) this.hud?.toast('Clean landing!', 'good');
    });
    ev.on('spill', ({ items, reason }) => {
      if (reason !== 'crash') return;
      const mult = run.cfg.mode === 'endless' || run.cfg.mode === 'daily' ? run.multiplier : 1;
      this.crashCargoValue = Math.round(items.reduce((acc, d) => acc + d.item.def.value * d.item.cond, 0) * mult);
    });
    ev.on('crash', ({ reason }) => {
      this.updateGameplayState();
      a.play('crash');
      a.duckDrive(true);
      const label = reason === 'rollover' ? 'Tipped over!' : reason === 'fell' ? 'Off the edge!' : reason === 'lowbridge' ? 'Too low!' : 'Crashed!';
      this.hud?.toast(label, 'big');
      if (this.tipShed) {
        this.tipShed = false;
        this.timeScale = 1;
      }
    });
    ev.on('finish', () => {
      this.updateGameplayState();
      a.play('finish');
      this.hud?.toast('Delivered!', 'big');
    });
    ev.on('bank', ({ value, mult, items }) => {
      if (value <= 0) return;
      a.play('bank', 1, { count: items.length });
      this.hud?.toast(`Banked +${value}${mult > 1 ? ` (×${mult})` : ''}`, 'big');
    });
    ev.on('carry', ({ mult }) => this.hud?.toast(`Carrying on: ×${mult}`, 'good'));
    ev.on('squish', ({ item }) => {
      a.play('squish', 1, { cargo: item.def.id });
      this.hud?.toast(`${item.def.name} squished!`, 'bad');
    });
    ev.on('damage', ({ item }) => {
      a.play('damage', 0.6 + 0.4 * item.def.fragility, { cargo: item.def.id });
      if (item.cond < 0.5 && item.def.fragility > 0.5) this.hud?.toast(`${item.def.name} damaged`, 'bad');
    });
    ev.on('gate', ({ tag }) => {
      if (tag === 'shortcut') this.hud?.toast('Shortcut!', 'good');
      else if (tag === 'rooftop') this.hud?.toast('Rooftop route!', 'good');
    });
    ev.on('rumble', () => a.play('rumble'));
    ev.on('tip', ({ id }) => this.showTip(id));
  }

  private showTip(id: string): void {
    const tutorialRun = this.req?.levelId === 'h1' && (!this.store.data.tutorialDone || (this.store.data.campaign.levels.h1?.plays ?? 0) < 2);
    if (!tutorialRun) return;
    const t = TIPS[id];
    if (!t) return;
    if (id === 'shed') {
      // Only teach shedding if the stack really is too tall for the beam.
      const run = this.run!;
      const beam = run.track.features.find((f) => f.kind === 'overhead' && f.s > run.truck.s);
      if (!beam || run.truck.stackTopAboveRoad() < beam.h) {
        this.hud?.tip('Low beam ahead. Your stack fits, but taller loads would clip it. <b>SPACE</b>/<b>SHED</b> drops the top item.');
        this.tipTimer = 4.5;
        return;
      }
      this.tipShed = true;
      this.timeScale = this.store.data.settings.reducedMotion ? 0.6 : 0.45;
      setTimeout(() => {
        if (this.tipShed) {
          this.tipShed = false;
          this.timeScale = 1;
          this.hud?.tip(null);
        }
      }, 5000);
    }
    this.hud?.tip(this.touch ? t.touch : t.key);
    this.tipTimer = id === 'shed' ? 5 : 4.5;
  }

  private onRunEnded(): void {
    const run = this.run!;
    if (run.state === 'crashed') {
      this.goState('crashed');
      this.ui.show('crashed', this.crashOptions());
    } else {
      this.settleAndShowResults();
    }
  }

  crashOptions(): { reason: string; canToken: boolean; tokens: number; offerAd: boolean; mode: RunMode } {
    const run = this.run!;
    const mode = run.cfg.mode;
    const tokens = this.store.data.tokens;
    const canToken = mode !== 'daily' && tokens > 0 && run.revives === 0;
    this.crashesSinceOffer++;
    // Rewarded continue offer: Full Launch only, not every failure, never in Daily.
    const offerAd = this.ads.available && mode !== 'daily' && run.revives === 0 && tokens === 0 && this.crashesSinceOffer >= 3;
    if (offerAd) {
      this.crashesSinceOffer = 0;
      this.rewardOfferedThisBreak = true;
    }
    return { reason: run.crashReason ?? 'barrier', canToken, tokens, offerAd, mode };
  }

  useTokenContinue(): boolean {
    const run = this.run;
    if (!run || run.state !== 'crashed' || run.cfg.mode === 'daily') return false;
    if (!this.store.useToken(run.cfg.mode)) return false;
    return this.reviveRun();
  }

  async adContinue(): Promise<boolean> {
    const run = this.run;
    if (!run || run.state !== 'crashed' || run.cfg.mode === 'daily') return false;
    const runId = this.runId;
    this.goState('ad');
    const res = await this.ads.show('rewarded');
    // The player may have left the crash screen while the ad was loading (results, menu, retry).
    const stillHere = this.run === run && this.runId === runId && this.fsm.state === 'ad' && !this.store.isSettled(runId);
    if (!stillHere) {
      // They watched it, so keep the reward as a Spare Tire for later instead of reviving this run.
      if (res.granted) this.store.grantAdReward(res.requestId, 'token');
      return false;
    }
    if (!res.granted) {
      this.goState('crashed');
      return false;
    }
    // Grant exactly once per request id, then spend it immediately on the revive.
    if (!this.store.grantAdReward(res.requestId, 'token') || !this.store.useToken(run.cfg.mode)) {
      this.goState('crashed');
      return false;
    }
    return this.reviveRun();
  }

  private reviveRun(): boolean {
    const run = this.run!;
    if (!run.revive()) return false;
    this.renderer.truck.clearDebris();
    this.renderer.follow.reset();
    this.view?.snapshot();
    this.view?.snapshot();
    this.endHandled = false;
    this.endTimer = 0;
    this.crashCargoValue = 0; // cargo lost in the first crash was already counted; start fresh
    this.ui.hideScreens();
    this.audio.startDriveLoops();
    // Hold the countdown reason across the state change so gameplayStart fires only after "go".
    this.pause.add('countdown');
    this.goState('driving');
    this.beginCountdown();
    return true;
  }

  summary(outcome: 'finished' | 'crashed' | 'quit'): RunSummary {
    const run = this.run!;
    const req = this.req!;
    return {
      runId: this.runId, mode: req.mode, levelId: req.levelId, dailyKey: req.daily?.dateKey, outcome,
      crashReason: run.crashReason, stats: run.stats, distance: run.distance,
      forfeited: outcome !== 'finished' && (req.mode === 'endless' || req.mode === 'daily') ? this.forfeitAtCrash() : 0,
      lostCargo: outcome !== 'finished' && req.mode !== 'endless' && req.mode !== 'daily' ? this.lostAtCrash() : 0,
      usedToken: run.revives > 0, vehicle: this.renderer.truck.vehicle,
    };
  }

  private crashCargoValue = 0;
  private forfeitAtCrash(): number {
    return this.crashCargoValue;
  }
  private lostAtCrash(): number {
    return this.crashCargoValue;
  }

  /** The single authoritative reward path. Idempotent per runId. */
  settleAndShowResults(outcome?: 'finished' | 'crashed' | 'quit'): void {
    const run = this.run;
    if (!run || !this.req) return;
    const out = outcome ?? (run.state === 'finished' ? 'finished' : 'crashed');
    const sum = this.summary(out);
    const reward = this.store.settleRun(sum);
    this.lastReward = reward;
    this.lastSummary = sum;
    if (this.req.levelId === 'h1' && (out === 'finished' || (this.store.data.campaign.levels.h1?.plays ?? 0) >= 2)) this.store.markTutorialDone();
    this.audio.stopDriveLoops();
    this.audio.setMusic(run.track.world, 0);
    this.hud?.destroy();
    this.hud = null;
    this.goState('results');
    if (out === 'finished') this.audio.play('finish');
    if (reward.newMedals.some(Boolean)) setTimeout(() => this.audio.play('medal'), 600);
    this.ui.show('results', { reward, summary: sum });
  }

  abandonRun(): void {
    this.backdropBuilt = '';
    this.view?.dispose();
    this.hud?.destroy();
    this.hud = null;
    this.run = null;
    this.endless = null;
    this.audio.stopDriveLoops();
    this.pause.remove('user');
    this.pause.remove('countdown');
    this.clearCountdown();
    this.timeScale = 1;
    this.updateGameplayState();
  }

  // ------------------------------------------------------------------ pause / resume
  openPause(): void {
    if (this.fsm.state !== 'driving' || !this.run || this.run.state !== 'running') return;
    this.pause.add('user');
    this.pause.remove('countdown');
    this.clearCountdown();
    this.goState('paused');
    this.audio.duckDrive(true);
    this.ui.show('paused');
  }

  resume(): void {
    if (this.fsm.state !== 'paused') return;
    this.ui.hideScreens();
    this.goState('driving');
    this.beginCountdown();
  }

  private countdownEl: HTMLElement | null = null;

  /** Stop a countdown early (pause, quit, restart): the big digit must not linger on other screens. */
  private clearCountdown(): void {
    this.countdownLeft = 0;
    this.countdownEl?.remove();
    this.countdownEl = null;
  }
  private beginCountdown(): void {
    this.pause.add('countdown');
    this.pause.remove('user');
    this.countdownLeft = this.store.data.settings.reducedMotion ? 1.2 : 1.8;
    this.renderCountdown();
  }

  private tickCountdown(dt: number): void {
    if (this.pause.has('hidden') || this.pause.has('blur') || this.pause.has('ad') || this.pause.has('gpu') || this.fsm.state !== 'driving') return;
    const before = Math.ceil(this.countdownLeft / 0.6);
    this.countdownLeft -= dt;
    const after = Math.ceil(this.countdownLeft / 0.6);
    if (after !== before) this.renderCountdown();
    if (this.countdownLeft <= 0) {
      this.countdownLeft = 0;
      this.countdownEl?.remove();
      this.countdownEl = null;
      this.pause.remove('countdown');
      this.audio.play('go');
      this.loop.resetAccumulator();
    }
  }

  private renderCountdown(): void {
    if (!this.countdownEl) {
      this.countdownEl = document.createElement('div');
      this.countdownEl.className = 'countdown';
      this.countdownEl.setAttribute('data-testid', 'countdown');
      this.ui.root.append(this.countdownEl);
    }
    const n = Math.max(1, Math.ceil(this.countdownLeft / 0.6));
    this.countdownEl.innerHTML = `<span>${n}</span>`;
    this.audio.play('count');
  }

  /**
   * Midgame ad at a genuine round boundary (Full Launch only): never during play, never from
   * navigation, never in the same break as a rewarded offer, and not in the first minutes.
   */
  async maybeMidgame(): Promise<void> {
    if (!this.ads.available || this.rewardOfferedThisBreak || this.ads.busy) return;
    const now = performance.now();
    if (now - this.sessionStart < 180_000) return;
    // At most one midgame per 3 minutes, and never within 3 minutes of any other ad (e.g. a Garage paint trial).
    if (now - this.ads.lastMidgameAt < 180_000 || now - this.ads.lastAdAt < 180_000) return;
    this.goState('ad');
    await this.ads.show('midgame');
  }

  restartRun(): void {
    if (!this.req) return;
    const req = this.req;
    // Restarting mid-run forfeits the attempt (no rewards are granted for an unfinished run).
    this.startRun(req.mode === 'daily' && req.daily ? { ...req } : req);
  }

  quitToMenu(): void {
    if (this.run && this.run.state === 'running' && this.req) {
      // Keep coins already collected on the road; cargo on board is lost.
      this.crashCargoValue = this.run.cargoValue;
      const sum = this.summary('quit');
      this.store.settleRun(sum);
    }
    this.abandonRun();
    this.toMenu();
  }

  // ------------------------------------------------------------------ navigation
  goState(s: AppState): void {
    if (this.fsm.state === s) return;
    if (!this.fsm.go(s)) {
      // Recover from an unexpected path by routing through the menu.
      if (this.fsm.can('menu')) this.fsm.go('menu');
      this.fsm.go(s);
    }
  }

  toMenu(): void {
    this.abandonRun();
    this.buildBackdrop();
    this.goState('menu');
    this.audio.setMusic(this.backdropWorld, 0);
    this.ui.show('menu');
  }

  /** First launch: tutorial level behind the single "Tap to drive" gesture. */
  showTitle(): void {
    this.buildBackdrop(true);
    this.goState('title');
    this.ui.show('title');
  }

  /** Parked truck on a level start with a slow orbit camera behind the menus. */
  buildBackdrop(force = false): void {
    const next = LEVEL_BY_ID[this.store.nextLevelId()] ?? LEVELS[0];
    const key = `${next.world}:${this.store.data.garage.equipped}:${this.store.displayPaint}:${this.store.data.garage.equippedAcc.join(',')}`;
    if (!force && this.backdropBuilt === key && this.view && !this.run) return;
    this.backdropBuilt = key;
    this.backdropWorld = next.world;
    const lvl = LEVELS.find((l) => l.world === next.world)!;
    const built = buildLevel(lvl);
    const kind = this.store.data.garage.equipped;
    const h = applyUpgrades(VEHICLES[kind].stats, this.store.data.upgrades);
    const parked = new RunSession({ mode: 'campaign', track: built.track, handling: h, seed: 1, speedAt: () => 0, finishS: null });
    this.currentChunks = built.chunks;
    parked.truck.s = 60;
    parked.truck.vs = 0;
    this.renderer.truck.setTruck(kind, paintById(this.store.displayPaint), this.store.data.garage.equippedAcc);
    this.renderer.truck.setVisible(true);
    this.view?.dispose();
    this.view = new RunView(this.renderer, parked, built.chunks);
    this.view.camMode = 'orbit';
    this.view.setRain(0);
  }

  private currentChunks: PlacedChunk[] = [];
  private rebuildWorldVisuals(): void {
    if (!this.view) return;
    const run = this.view.run;
    const chunks = this.endless ? this.endless.placed : this.currentChunks;
    const ox = this.renderer.world.originX, oz = this.renderer.world.originZ;
    this.renderer.world.clear();
    this.renderer.world.rebase(ox, oz);
    for (const c of chunks) this.renderer.world.addChunk(run.track, c);
  }

  dailyToday(): { spec: DailySpec; key: string } {
    const key = utcDateKey(Date.now());
    return { spec: dailySpec(key), key };
  }

  cargoName(id: string): string {
    return CARGO[id as keyof typeof CARGO]?.name ?? id;
  }

  devText(): string {
    if (!__DEV_TOOLS__) return ''; // compiled out of production builds
    const i = this.renderer.info();
    const run = this.run;
    const lines = [
      `FPS ${this.fps.toFixed(0)}  frame ${this.frameMs.toFixed(1)}ms  preset ${this.renderer.preset.name}`,
      `draw calls ${i.calls}  tris ${i.triangles}  geo ${i.geometries}  tex ${i.textures}`,
      `chunks ${this.renderer.world.stats().chunks}  objects ${this.renderer.world.stats().objects}  particles ${this.renderer.particles.active()}/${this.renderer.particles.capacity}  debris ${this.renderer.truck.activeDebris()}`,
      `state ${this.fsm.state}  pause [${this.pause.list().join(',')}]  mute [${this.audio.muteReasons().join(',')}]  gameplay ${this.gameplayActive}`,
      run ? `seed ${run.cfg.seed}  s ${run.truck.s.toFixed(0)} (+${run.track.sOffset})  feats ${run.track.features.length}  segs ${run.track.segments.length}` : '',
      this.endless ? `endless world ${this.endless.world}  rejected ${this.endless.rejected}  fallbacks ${this.endless.fallbacks}` : '',
      `platform ${this.platform.name}/${this.platform.environment} stage ${this.platform.stage}  save ${this.store.storage.kind}/${this.store.health}`,
      `sdk: ${this.platform.log.slice(-4).map((l) => l.event + (l.detail ? `(${l.detail})` : '')).join(' · ')}`,
    ];
    return lines.filter(Boolean).join('\n');
  }
}

