import { describe, expect, it, vi } from 'vitest';
import { PauseManager } from '../../src/core/pause';
import { StateMachine } from '../../src/core/fsm';
import { GameplayGate } from '../../src/game/lifecycle';
import { AdController } from '../../src/platform/ads';
import { CrazyGamesPlatform, type CrazySDK } from '../../src/platform/crazygames';
import { StandalonePlatform } from '../../src/platform/standalone';
import type { AdOutcome, AdType, PlatformAdapter } from '../../src/platform/types';
import { AudioManager } from '../../src/audio/audio';
import { ProgressStore } from '../../src/progression/store';

/** Fake of the documented SDK v3 surface (local simulation, not the real SDK). */
function fakeSdk(env = 'crazygames') {
  const calls: string[] = [];
  let settingsFn: ((s: { muteAudio?: boolean }) => void) | null = null;
  let authFn: (() => void) | null = null;
  const data = new Map<string, string>();
  let adBehaviour: (cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: { code: string }) => void }) => void = (cb) => {
    cb.adStarted?.();
    cb.adFinished?.();
  };
  const sdk: CrazySDK = {
    init: async () => {},
    environment: env,
    game: {
      settings: { muteAudio: false },
      addSettingsChangeListener: (fn) => { settingsFn = fn; },
      removeSettingsChangeListener: () => { settingsFn = null; },
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
    },
    ad: { requestAd: (_t: AdType, cb) => { calls.push('requestAd'); adBehaviour(cb as never); } },
    data: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } },
    user: { addAuthListener: (fn) => { authFn = fn as () => void; }, removeAuthListener: () => { authFn = null; } },
  };
  return {
    sdk, calls, data,
    setAd: (b: typeof adBehaviour) => (adBehaviour = b),
    emitSettings: (m: boolean) => settingsFn?.({ muteAudio: m }),
    emitAuth: () => authFn?.(),
    hasSettingsListener: () => settingsFn !== null,
  };
}

const muteSpy = () => {
  const reasons = new Set<string>();
  return { reasons, addMute: (r: string) => reasons.add(r), removeMute: (r: string) => reasons.delete(r) };
};

describe('CrazyGames SDK v3 adapter', () => {
  it('de-duplicates gameplayStart/Stop and loading events', () => {
    const f = fakeSdk();
    const p = new CrazyGamesPlatform(f.sdk, 'basic');
    p.loadingStart(); p.loadingStart(); p.loadingStop(); p.loadingStop();
    p.gameplayStart(); p.gameplayStart(); p.gameplayStop(); p.gameplayStop(); p.gameplayStart();
    expect(f.calls).toEqual(['loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'gameplayStart']);
  });

  it('reads muteAudio at init and follows the settings listener; unsubscribe removes it', () => {
    const f = fakeSdk();
    f.sdk.game.settings.muteAudio = true;
    const p = new CrazyGamesPlatform(f.sdk, 'basic');
    expect(p.settings().muteAudio).toBe(true);
    const seen: boolean[] = [];
    const off = p.onSettingsChange((s) => seen.push(s.muteAudio));
    f.emitSettings(false);
    f.emitSettings(true);
    expect(seen).toEqual([false, true]);
    off();
    expect(f.hasSettingsListener()).toBe(false);
  });

  it('uses the Data module as storage', async () => {
    const f = fakeSdk();
    const p = new CrazyGamesPlatform(f.sdk, 'basic');
    const st = new ProgressStore(p.storage(), () => 1);
    await st.init();
    st.data.coins = 42;
    await st.flush();
    expect(JSON.parse(f.data.get('wobblehaul.save')!).coins).toBe(42);
  });

  it('Basic Launch build never requests ads', async () => {
    const f = fakeSdk();
    const p = new CrazyGamesPlatform(f.sdk, 'basic');
    expect(p.adsAvailable).toBe(false);
    const r = await p.requestAd('rewarded', { onStarted: () => {} });
    expect(r).toEqual({ status: 'error', code: 'adsDisabledBasicLaunch' });
    expect(f.calls).not.toContain('requestAd');
  });

  it('maps adFinished / adError and ignores duplicate or late callbacks', async () => {
    const f = fakeSdk();
    const p = new CrazyGamesPlatform(f.sdk, 'full');
    f.setAd((cb) => { cb.adStarted?.(); cb.adFinished?.(); cb.adFinished?.(); cb.adError?.({ code: 'other' }); });
    expect(await p.requestAd('rewarded', { onStarted: () => {} })).toEqual({ status: 'finished' });
    for (const code of ['unfilled', 'adblock', 'adCooldown', 'adsDisabledBasicLaunch', 'other']) {
      f.setAd((cb) => cb.adError?.({ code }));
      const r = await p.requestAd('midgame', { onStarted: () => {} });
      expect(r).toEqual({ status: 'error', code, message: undefined });
    }
  });

  it('an SDK that throws on requestAd resolves to an error instead of hanging', async () => {
    const f = fakeSdk();
    const p = new CrazyGamesPlatform(f.sdk, 'full');
    f.setAd(() => { throw new Error('boom'); });
    const r = await p.requestAd('rewarded', { onStarted: () => {} });
    expect(r.status).toBe('error');
  });
});

describe('AdController', () => {
  const platformWith = (impl: (t: AdType, h: { onStarted(): void }) => Promise<AdOutcome>): PlatformAdapter => {
    const p = new StandalonePlatform('full', 'test', false) as unknown as PlatformAdapter & { adsAvailable: boolean };
    Object.defineProperty(p, 'adsAvailable', { value: true });
    (p as unknown as { requestAd: typeof impl }).requestAd = impl;
    return p;
  };

  it('pauses while requested, mutes only after the ad starts, then releases only its own reasons', async () => {
    const pause = new PauseManager();
    const mute = muteSpy();
    pause.add('user');
    mute.addMute('platform');
    let resolve!: (o: AdOutcome) => void;
    let started!: () => void;
    const ads = new AdController(platformWith((_t, h) => { started = h.onStarted; return new Promise((r) => (resolve = r)); }), pause, mute);
    const p = ads.show('rewarded');
    expect(pause.has('ad')).toBe(true);
    expect(mute.reasons.has('ad')).toBe(false); // requested, not started
    started();
    expect(mute.reasons.has('ad')).toBe(true);
    resolve({ status: 'finished' });
    const r = await p;
    expect(r.granted).toBe(true);
    expect(pause.has('ad')).toBe(false);
    expect(pause.has('user')).toBe(true);
    expect(mute.reasons.has('ad')).toBe(false);
    expect(mute.reasons.has('platform')).toBe(true);
  });

  it('never grants a reward on error and rejects overlapping requests', async () => {
    const pause = new PauseManager();
    let resolve!: (o: AdOutcome) => void;
    const ads = new AdController(platformWith(() => new Promise((r) => (resolve = r))), pause, muteSpy());
    const first = ads.show('rewarded');
    const second = await ads.show('rewarded');
    expect(second.outcome).toEqual({ status: 'error', code: 'busy' });
    expect(second.granted).toBe(false);
    resolve({ status: 'error', code: 'unfilled' });
    const r = await first;
    expect(r.granted).toBe(false);
    expect(pause.paused).toBe(false);
  });

  it('times out instead of stranding the player, and ignores a late start', async () => {
    vi.useFakeTimers();
    const pause = new PauseManager();
    const mute = muteSpy();
    let started!: () => void;
    const ads = new AdController(platformWith((_t, h) => { started = h.onStarted; return new Promise(() => {}); }), pause, mute);
    ads.timeoutMs = 1000;
    const p = ads.show('rewarded');
    vi.advanceTimersByTime(1100);
    const r = await p;
    expect(r.outcome).toEqual({ status: 'error', code: 'timeout' });
    expect(r.granted).toBe(false);
    started();
    expect(mute.reasons.has('ad')).toBe(false);
    expect(pause.paused).toBe(false);
    vi.useRealTimers();
  });

  it('an ad that starts in time is not cut off by the request timeout while it plays', async () => {
    vi.useFakeTimers();
    const pause = new PauseManager();
    const mute = muteSpy();
    let started!: () => void;
    let resolve!: (o: AdOutcome) => void;
    const ads = new AdController(platformWith((_t, h) => { started = h.onStarted; return new Promise((r) => (resolve = r)); }), pause, mute);
    ads.timeoutMs = 1000;
    ads.playTimeoutMs = 10_000;
    const p = ads.show('rewarded');
    vi.advanceTimersByTime(800);
    started();
    vi.advanceTimersByTime(2000); // well past the request timeout, ad still playing
    expect(pause.paused).toBe(true);
    expect(mute.reasons.has('ad')).toBe(true);
    resolve({ status: 'finished' });
    const r = await p;
    expect(r.outcome.status).toBe('finished');
    expect(r.granted).toBe(true);
    expect(pause.paused).toBe(false);
    expect(mute.reasons.has('ad')).toBe(false);
    vi.useRealTimers();
  });

  it('a playing ad that never reports an end is released by the playback safety timeout', async () => {
    vi.useFakeTimers();
    const pause = new PauseManager();
    const mute = muteSpy();
    let started!: () => void;
    const ads = new AdController(platformWith((_t, h) => { started = h.onStarted; return new Promise(() => {}); }), pause, mute);
    ads.timeoutMs = 1000;
    ads.playTimeoutMs = 5000;
    const p = ads.show('rewarded');
    started();
    vi.advanceTimersByTime(5100);
    const r = await p;
    expect(r.outcome).toEqual({ status: 'error', code: 'timeout' });
    expect(r.granted).toBe(false);
    expect(pause.paused).toBe(false);
    expect(mute.reasons.has('ad')).toBe(false);
    vi.useRealTimers();
  });

  it('records the end time of every ad so midgame pacing also counts rewarded ads', async () => {
    let t = 1000;
    const ads = new AdController(platformWith(() => Promise.resolve({ status: 'finished' } as AdOutcome)), new PauseManager(), muteSpy(), () => t);
    await ads.show('rewarded');
    expect(ads.lastAdAt).toBe(1000);
    expect(ads.lastMidgameAt).toBe(-Infinity);
    t = 5000;
    await ads.show('midgame');
    expect(ads.lastAdAt).toBe(5000);
    expect(ads.lastMidgameAt).toBe(5000);
  });

  it('after a timed-out ad that never answered, the SDK adapter accepts new requests', async () => {
    vi.useFakeTimers();
    const f = fakeSdk();
    f.setAd(() => {}); // the SDK never calls back
    const p = new CrazyGamesPlatform(f.sdk, 'full');
    const ads = new AdController(p, new PauseManager(), muteSpy());
    ads.timeoutMs = 1000;
    const first = ads.show('rewarded');
    vi.advanceTimersByTime(1100);
    expect((await first).outcome).toEqual({ status: 'error', code: 'timeout' });
    f.setAd((cb) => { cb.adStarted?.(); cb.adFinished?.(); });
    const second = await ads.show('rewarded');
    expect(second.outcome.status).toBe('finished');
    expect(second.granted).toBe(true);
    vi.useRealTimers();
  });

  it('is a no-op when the build has no ad provider', async () => {
    const pause = new PauseManager();
    const ads = new AdController(new StandalonePlatform('basic', 'x', false), pause, muteSpy());
    const r = await ads.show('midgame');
    expect(r.outcome.status).toBe('error');
    expect(pause.paused).toBe(false);
  });

  it('a duplicate reward grant for the same request id is ignored', async () => {
    const { MemoryStorage } = await import('../../src/progression/storage');
    const st = new ProgressStore(new MemoryStorage(), () => 1);
    await st.init();
    expect(st.grantAdReward('ad-1', 'token')).toBe(true);
    expect(st.grantAdReward('ad-1', 'token')).toBe(false);
    expect(st.data.tokens).toBe(1);
  });
});

describe('gameplay lifecycle and audio mute precedence', () => {
  it('gameplayStart/Stop follow real driving only (menus, pause, ads, results excluded)', () => {
    const calls: string[] = [];
    const gate = new GameplayGate({ gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') });
    const fsm = new StateMachine();
    const pause = new PauseManager();
    let running = false;
    const sync = () => gate.update(fsm.state === 'driving', pause.paused, running);
    fsm.onChange(sync);
    pause.onChange(sync);
    fsm.go('loading'); fsm.go('menu');
    expect(calls).toEqual([]);
    running = true;
    fsm.go('driving');
    expect(calls).toEqual(['start']);
    pause.add('hidden'); // tab hidden
    pause.add('user');
    pause.remove('hidden');
    expect(calls).toEqual(['start', 'stop']); // still paused by user
    pause.add('countdown');
    pause.remove('user');
    expect(calls).toEqual(['start', 'stop']);
    pause.remove('countdown');
    expect(calls).toEqual(['start', 'stop', 'start']);
    running = false; // crash
    sync();
    fsm.go('crashed');
    fsm.go('results');
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
    fsm.go('ad');
    expect(calls.length).toBe(4);
  });

  it('platform mute overrides user volume and ending one mute reason keeps the others', () => {
    const a = new AudioManager();
    a.setVolumes(1, 1, 1);
    a.addMute('platform');
    a.addMute('ad');
    a.removeMute('ad');
    expect(a.muted).toBe(true);
    a.addMute('hidden');
    a.removeMute('platform');
    expect(a.muted).toBe(true);
    a.removeMute('hidden');
    expect(a.muted).toBe(false);
  });
});
