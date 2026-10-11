import type { SaveStorage } from '../progression/storage';

export type AdType = 'midgame' | 'rewarded';
export type AdOutcome = { status: 'finished' } | { status: 'error'; code: string; message?: string };
export interface AdHooks {
  /** Called when the ad actually starts playing (mute audio here, not on request). */
  onStarted(): void;
}

export interface PlatformSettings {
  muteAudio: boolean;
}

export interface SdkLogEntry {
  t: number;
  event: string;
  detail?: string;
}

export type ReleaseStage = 'basic' | 'full';

/**
 * Single seam between the game and the hosting platform. Implementations:
 * CrazyGamesPlatform (SDK v3), StandalonePlatform (no SDK) and DevPlatform (dev builds only).
 */
export interface PlatformAdapter {
  readonly name: 'crazygames' | 'standalone' | 'dev';
  /** SDK environment string ('crazygames' | 'local' | 'disabled') or 'standalone'/'dev'. */
  readonly environment: string;
  readonly stage: ReleaseStage;
  /** True only for an approved Full Launch build running where the SDK can serve ads. */
  readonly adsAvailable: boolean;
  readonly log: SdkLogEntry[];
  init(): Promise<void>;
  storage(): SaveStorage;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  settings(): PlatformSettings;
  onSettingsChange(cb: (s: PlatformSettings) => void): () => void;
  onAuthChange(cb: () => void): () => void;
  requestAd(type: AdType, hooks: AdHooks): Promise<AdOutcome>;
  /** Give up on the ad in flight (the caller timed out); later callbacks for it are ignored. */
  cancelAd?(): void;
  /** Locale hint for future translations; the game ships English. */
  locale(): string;
}
