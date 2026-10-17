import { LocalStorageAdapter, type SaveStorage } from '../progression/storage';
import { SAVE_KEY } from '../progression/save';
import type { AdHooks, AdOutcome, AdType, PlatformAdapter, PlatformSettings, ReleaseStage, SdkLogEntry } from './types';

/**
 * DEVELOPMENT ONLY (never selected in production builds). Simulates SDK lifecycle, settings,
 * account changes and ad outcomes so flows can be exercised locally. Ad behaviour is chosen
 * explicitly with ?ads=finish|unfilled|adblock|adCooldown|late|duplicate|never.
 */
export class DevPlatform implements PlatformAdapter {
  readonly name = 'dev' as const;
  readonly environment = 'dev';
  readonly log: SdkLogEntry[] = [];
  private muted = false;
  private settingsCbs = new Set<(s: PlatformSettings) => void>();
  private authCbs = new Set<() => void>();
  private store: SaveStorage;
  adMode: string;
  playing = false;

  constructor(readonly stage: ReleaseStage, params: URLSearchParams) {
    this.adMode = params.get('ads') ?? 'finish';
    this.muted = params.get('muteAudio') === 'true';
    this.store = new LocalStorageAdapter(`dev:${params.get('profile') ?? 'default'}:${SAVE_KEY}`);
    (window as unknown as { __devPlatform: DevPlatform }).__devPlatform = this;
  }

  get adsAvailable(): boolean {
    return this.stage === 'full';
  }

  private note(event: string, detail?: string): void {
    this.log.push({ t: performance.now(), event, detail });
    if (this.log.length > 300) this.log.shift();
  }

  async init(): Promise<void> { this.note('init', 'dev'); }
  storage(): SaveStorage { return this.store; }
  loadingStart(): void { this.note('loadingStart'); }
  loadingStop(): void { this.note('loadingStop'); }
  gameplayStart(): void {
    if (this.playing) this.note('DUPLICATE gameplayStart');
    this.playing = true;
    this.note('gameplayStart');
  }
  gameplayStop(): void {
    if (!this.playing) this.note('DUPLICATE gameplayStop');
    this.playing = false;
    this.note('gameplayStop');
  }
  settings(): PlatformSettings { return { muteAudio: this.muted }; }
  onSettingsChange(cb: (s: PlatformSettings) => void): () => void {
    this.settingsCbs.add(cb);
    return () => this.settingsCbs.delete(cb);
  }
  onAuthChange(cb: () => void): () => void {
    this.authCbs.add(cb);
    return () => this.authCbs.delete(cb);
  }
  /** Test hook: simulate the platform toggling mute. */
  setPlatformMute(m: boolean): void {
    this.muted = m;
    for (const cb of this.settingsCbs) cb({ muteAudio: m });
  }
  /** Test hook: simulate an account change (guest → signed in). */
  simulateAuthChange(): void {
    for (const cb of this.authCbs) cb();
  }
  requestAd(type: AdType, hooks: AdHooks): Promise<AdOutcome> {
    this.note('requestAd', `${type}:${this.adMode}`);
    if (!this.adsAvailable) return Promise.resolve({ status: 'error', code: 'adsDisabledBasicLaunch' });
    return new Promise((resolve) => {
      let done = false;
      const fin = (o: AdOutcome) => {
        if (done) {
          this.note('ignored duplicate callback');
          return;
        }
        done = true;
        this.note(o.status === 'finished' ? 'adFinished' : `adError:${o.status === 'error' ? o.code : ''}`);
        resolve(o);
      };
      const m = this.adMode;
      if (m === 'unfilled' || m === 'adblock' || m === 'adCooldown') return setTimeout(() => fin({ status: 'error', code: m }), 300);
      if (m === 'never') return; // controller timeout path
      setTimeout(() => {
        this.note('adStarted');
        hooks.onStarted();
      }, 250);
      const t = m === 'late' ? 4000 : 1500;
      setTimeout(() => fin({ status: 'finished' }), t);
      if (m === 'duplicate') setTimeout(() => fin({ status: 'finished' }), t + 50);
    });
  }
  locale(): string { return 'en'; }
}
