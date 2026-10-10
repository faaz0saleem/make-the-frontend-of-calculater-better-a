import { LocalStorageAdapter, MemoryStorage, type SaveStorage } from '../progression/storage';
import { SAVE_KEY } from '../progression/save';
import type { AdOutcome, PlatformAdapter, PlatformSettings, ReleaseStage, SdkLogEntry } from './types';

/**
 * No SDK (self-hosted / SDK unavailable outside CrazyGames). Uses a namespaced localStorage key
 * when `persist` is true; when running on a CrazyGames host whose SDK failed to load we must not
 * create a competing local save, so `persist` is false and progress lives in memory only.
 */
export class StandalonePlatform implements PlatformAdapter {
  readonly name = 'standalone' as const;
  readonly adsAvailable = false;
  readonly log: SdkLogEntry[] = [];
  private store: SaveStorage;

  constructor(readonly stage: ReleaseStage, readonly environment: string, persist: boolean) {
    this.store = persist ? new LocalStorageAdapter(`standalone:${SAVE_KEY}`) : new MemoryStorage();
  }

  async init(): Promise<void> {
    this.log.push({ t: performance.now(), event: 'init', detail: this.environment });
  }
  storage(): SaveStorage { return this.store; }
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void { this.log.push({ t: performance.now(), event: 'gameplayStart' }); }
  gameplayStop(): void { this.log.push({ t: performance.now(), event: 'gameplayStop' }); }
  settings(): PlatformSettings { return { muteAudio: false }; }
  onSettingsChange(): () => void { return () => {}; }
  onAuthChange(): () => void { return () => {}; }
  async requestAd(): Promise<AdOutcome> { return { status: 'error', code: 'unavailable', message: 'No ad provider in this build' }; }
  locale(): string { return navigator.language || 'en'; }
}
