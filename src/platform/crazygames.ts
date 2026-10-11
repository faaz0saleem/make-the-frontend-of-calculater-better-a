import { CrazyDataStorage, type CrazyDataModule, type SaveStorage } from '../progression/storage';
import { SAVE_KEY } from '../progression/save';
import type { AdHooks, AdOutcome, AdType, PlatformAdapter, PlatformSettings, ReleaseStage, SdkLogEntry } from './types';

/** Narrow typing of the documented CrazyGames HTML5 SDK v3 surface used by this game. */
export interface CrazySDK {
  init(): Promise<void>;
  environment: string;
  game: {
    settings: { muteAudio?: boolean };
    addSettingsChangeListener?(fn: (s: { muteAudio?: boolean }) => void): void;
    removeSettingsChangeListener?(fn: (s: { muteAudio?: boolean }) => void): void;
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart?(): void;
    loadingStop?(): void;
  };
  ad: {
    requestAd(type: AdType, cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: { code?: string; message?: string }) => void }): void;
  };
  data?: CrazyDataModule;
  user?: {
    addAuthListener?(fn: (user: unknown) => void): void;
    removeAuthListener?(fn: (user: unknown) => void): void;
    systemInfo?: { locale?: string };
  };
}

export const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export function loadSdkScript(timeoutMs = 9000): Promise<CrazySDK> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { CrazyGames?: { SDK?: CrazySDK } };
    if (w.CrazyGames?.SDK) return resolve(w.CrazyGames.SDK);
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    const timer = setTimeout(() => reject(new Error('SDK script timeout')), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      if (w.CrazyGames?.SDK) resolve(w.CrazyGames.SDK);
      else reject(new Error('SDK global missing after load'));
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error('SDK script failed to load'));
    };
    document.head.appendChild(s);
  });
}

/**
 * Live CrazyGames SDK v3 adapter. Must only be constructed after `SDK.init()` resolved and the
 * environment is not 'disabled'. Gameplay start/stop are de-duplicated here as a safety net.
 */
export class CrazyGamesPlatform implements PlatformAdapter {
  readonly name = 'crazygames' as const;
  readonly log: SdkLogEntry[] = [];
  private playing = false;
  private loading = false;
  private store: SaveStorage;
  private adActive = false;

  constructor(private sdk: CrazySDK, readonly stage: ReleaseStage) {
    if (!sdk.data) throw new Error('Data module unavailable');
    this.store = new CrazyDataStorage(sdk.data, SAVE_KEY);
  }

  get environment(): string {
    return this.sdk.environment;
  }

  get adsAvailable(): boolean {
    // Basic Launch: ads are disabled by the platform; we also show no ad UI at all.
    return this.stage === 'full' && (this.sdk.environment === 'crazygames' || this.sdk.environment === 'local');
  }

  private note(event: string, detail?: string): void {
    this.log.push({ t: performance.now(), event, detail });
    if (this.log.length > 200) this.log.shift();
  }

  async init(): Promise<void> {
    this.note('init', this.sdk.environment);
  }

  storage(): SaveStorage {
    return this.store;
  }

  loadingStart(): void {
    if (this.loading) return;
    this.loading = true;
    this.sdk.game.loadingStart?.();
    this.note('loadingStart');
  }

  loadingStop(): void {
    if (!this.loading) return;
    this.loading = false;
    this.sdk.game.loadingStop?.();
    this.note('loadingStop');
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.sdk.game.gameplayStart();
    this.note('gameplayStart');
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.sdk.game.gameplayStop();
    this.note('gameplayStop');
  }

  settings(): PlatformSettings {
    return { muteAudio: !!this.sdk.game.settings?.muteAudio };
  }

  onSettingsChange(cb: (s: PlatformSettings) => void): () => void {
    const fn = (s: { muteAudio?: boolean }) => {
      this.note('settingsChange', JSON.stringify(s));
      cb({ muteAudio: !!s.muteAudio });
    };
    this.sdk.game.addSettingsChangeListener?.(fn);
    return () => this.sdk.game.removeSettingsChangeListener?.(fn);
  }

  onAuthChange(cb: () => void): () => void {
    const fn = () => {
      this.note('authChange');
      cb();
    };
    this.sdk.user?.addAuthListener?.(fn);
    return () => this.sdk.user?.removeAuthListener?.(fn);
  }

  requestAd(type: AdType, hooks: AdHooks): Promise<AdOutcome> {
    if (!this.adsAvailable) return Promise.resolve({ status: 'error', code: 'adsDisabledBasicLaunch' });
    if (this.adActive) return Promise.resolve({ status: 'error', code: 'busy' });
    this.adActive = true;
    this.note('requestAd', type);
    return new Promise<AdOutcome>((resolve) => {
      let done = false;
      const finish = (o: AdOutcome) => {
        if (done) return; // ignore duplicate/late callbacks
        done = true;
        this.adActive = false;
        this.cancelCurrent = null;
        this.note(o.status === 'finished' ? 'adFinished' : 'adError', o.status === 'error' ? o.code : undefined);
        resolve(o);
      };
      this.cancelCurrent = () => finish({ status: 'error', code: 'timeout' });
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => {
            if (done) return;
            this.note('adStarted');
            hooks.onStarted();
          },
          adFinished: () => finish({ status: 'finished' }),
          adError: (e) => finish({ status: 'error', code: e?.code ?? 'other', message: e?.message }),
        });
      } catch (e) {
        finish({ status: 'error', code: 'exception', message: String(e) });
      }
    });
  }

  private cancelCurrent: (() => void) | null = null;

  cancelAd(): void {
    this.cancelCurrent?.();
  }

  locale(): string {
    return this.sdk.user?.systemInfo?.locale ?? navigator.language ?? 'en';
  }
}
