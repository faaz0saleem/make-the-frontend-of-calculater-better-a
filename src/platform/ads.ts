import type { PauseManager } from '../core/pause';
import type { AdOutcome, AdType, PlatformAdapter } from './types';

export interface MuteTarget {
  addMute(reason: string): void;
  removeMute(reason: string): void;
}

/**
 * Serialises ad requests (one at a time, unique request ids), pauses the game while an ad is
 * requested, mutes only when the ad actually starts, and always releases exactly its own pause
 * and mute reasons. Rewards are granted by the caller only on a 'finished' outcome.
 */
export class AdController {
  private seq = 0;
  private active = 0;
  timeoutMs = 60_000;
  lastMidgameAt = -Infinity;

  constructor(private platform: PlatformAdapter, private pause: PauseManager, private audio: MuteTarget, private now: () => number = () => performance.now()) {}

  get busy(): boolean {
    return this.active !== 0;
  }

  get available(): boolean {
    return this.platform.adsAvailable;
  }

  async show(type: AdType): Promise<{ requestId: string; outcome: AdOutcome; granted: boolean }> {
    const requestId = `ad-${++this.seq}`;
    if (!this.platform.adsAvailable) return { requestId, outcome: { status: 'error', code: 'unavailable' }, granted: false };
    if (this.active) return { requestId, outcome: { status: 'error', code: 'busy' }, granted: false };
    const my = this.seq;
    this.active = my;
    this.pause.add('ad');
    let started = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<AdOutcome>((res) => {
      timer = setTimeout(() => res({ status: 'error', code: 'timeout' }), this.timeoutMs);
    });
    let outcome: AdOutcome;
    try {
      outcome = await Promise.race([
        this.platform.requestAd(type, {
          onStarted: () => {
            if (this.active !== my) return; // late start after timeout: ignore
            started = true;
            this.audio.addMute('ad');
          },
        }),
        timeout,
      ]);
    } catch (e) {
      outcome = { status: 'error', code: 'exception', message: String(e) };
    }
    if (timer) clearTimeout(timer);
    if (started) this.audio.removeMute('ad');
    this.pause.remove('ad');
    this.active = 0;
    if (type === 'midgame') this.lastMidgameAt = this.now();
    return { requestId, outcome, granted: type === 'rewarded' && outcome.status === 'finished' };
  }
}
