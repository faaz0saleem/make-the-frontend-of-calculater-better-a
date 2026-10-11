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
  /** Waiting for an ad to start. */
  timeoutMs = 60_000;
  /** Safety net once an ad is playing; normally adFinished/adError ends it first. */
  playTimeoutMs = 180_000;
  lastMidgameAt = -Infinity;
  /** End time of the most recent ad of any type (midgame pacing counts rewarded ads too). */
  lastAdAt = -Infinity;

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
    let expire: (o: AdOutcome) => void = () => {};
    const timeout = new Promise<AdOutcome>((res) => (expire = res));
    const arm = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => expire({ status: 'error', code: 'timeout' }), ms);
    };
    arm(this.timeoutMs);
    let outcome: AdOutcome;
    try {
      outcome = await Promise.race([
        this.platform.requestAd(type, {
          onStarted: () => {
            if (this.active !== my) return; // late start after timeout: ignore
            started = true;
            this.audio.addMute('ad');
            arm(this.playTimeoutMs); // never cut a playing ad short at the request timeout
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
    this.lastAdAt = this.now();
    if (type === 'midgame') this.lastMidgameAt = this.lastAdAt;
    return { requestId, outcome, granted: type === 'rewarded' && outcome.status === 'finished' };
  }
}
