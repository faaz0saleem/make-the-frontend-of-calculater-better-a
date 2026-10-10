import type { PlatformAdapter } from '../platform/types';

/**
 * Pairs SDK gameplayStart/gameplayStop with real active driving: in the driving state, not
 * paused for any reason, and the run still in progress. Duplicate transitions are suppressed.
 */
export class GameplayGate {
  active = false;
  starts = 0;
  stops = 0;
  constructor(private platform: Pick<PlatformAdapter, 'gameplayStart' | 'gameplayStop'>) {}

  update(driving: boolean, paused: boolean, runInProgress: boolean): boolean {
    const want = driving && !paused && runInProgress;
    if (want === this.active) return false;
    this.active = want;
    if (want) {
      this.starts++;
      this.platform.gameplayStart();
    } else {
      this.stops++;
      this.platform.gameplayStop();
    }
    return true;
  }
}
