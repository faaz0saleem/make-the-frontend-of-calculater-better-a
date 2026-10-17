export type AppState =
  | 'boot'
  | 'loading'
  | 'title'
  | 'menu'
  | 'levelSelect'
  | 'garage'
  | 'album'
  | 'settings'
  | 'briefing'
  | 'driving'
  | 'paused'
  | 'crashed'
  | 'results'
  | 'ad';

/** Allowed transitions. Anything else throws in dev and is ignored in production. */
const TRANSITIONS: Record<AppState, AppState[]> = {
  boot: ['loading'],
  loading: ['title', 'menu', 'driving', 'briefing'],
  title: ['driving', 'menu', 'settings', 'briefing'],
  menu: ['levelSelect', 'garage', 'album', 'settings', 'briefing', 'driving', 'title', 'loading'],
  levelSelect: ['menu', 'briefing', 'garage'],
  briefing: ['driving', 'levelSelect', 'menu', 'garage', 'ad'],
  garage: ['menu', 'levelSelect', 'briefing', 'results', 'ad'],
  album: ['menu'],
  settings: ['menu', 'title', 'paused', 'driving'],
  driving: ['paused', 'crashed', 'results', 'menu'],
  paused: ['driving', 'menu', 'settings', 'briefing', 'results'],
  crashed: ['driving', 'results', 'ad'],
  results: ['driving', 'briefing', 'menu', 'garage', 'levelSelect', 'ad'],
  ad: ['driving', 'results', 'crashed', 'briefing', 'garage', 'menu'],
};

export class StateMachine {
  private _state: AppState = 'boot';
  private _prev: AppState = 'boot';
  private listeners = new Set<(to: AppState, from: AppState) => void>();
  readonly history: AppState[] = ['boot'];

  get state(): AppState {
    return this._state;
  }

  get previous(): AppState {
    return this._prev;
  }

  can(to: AppState): boolean {
    return TRANSITIONS[this._state].includes(to);
  }

  go(to: AppState): boolean {
    if (to === this._state) return true;
    if (!this.can(to)) {
      const msg = `Invalid state transition ${this._state} -> ${to}`;
      if (__DEV_TOOLS__) console.warn(msg);
      return false;
    }
    this._prev = this._state;
    this._state = to;
    this.history.push(to);
    if (this.history.length > 64) this.history.shift();
    for (const fn of [...this.listeners]) fn(to, this._prev);
    return true;
  }

  onChange(fn: (to: AppState, from: AppState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
