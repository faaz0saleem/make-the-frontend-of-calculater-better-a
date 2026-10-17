import { TUNING as T } from '../data/tuning';

export interface InputSettings {
  sensitivity: number; // 0.5..2
  deadZonePx: number;
}

/**
 * Unified steering input: keyboard (A/D, arrows — physical key codes so AZERTY works),
 * mouse drag and touch drag on the play surface (relative "virtual stick" with a dead zone
 * and an anchor that follows the finger so reversing is instant).
 * Edge-triggered actions (shed / pause) are latched until consumed by the simulation.
 */
export class Input {
  private left = false;
  private right = false;
  private keySteer = 0;
  private pointerId: number | null = null;
  private anchorX = 0;
  private pointerSteer = 0;
  private shedLatch = false;
  private pauseLatch = false;
  private active = false;
  /** True only while the player is actually driving; turning it off drops any queued shed/pause. */
  get enabled(): boolean {
    return this.active;
  }
  set enabled(on: boolean) {
    this.active = on;
    if (!on) this.shedLatch = this.pauseLatch = false;
  }
  lastDevice: 'keyboard' | 'mouse' | 'touch' = 'keyboard';
  settings: InputSettings = { sensitivity: 1, deadZonePx: 6 };
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];
  onAnyInput: (() => void) | null = null;

  constructor(private surface: HTMLElement) {
    this.on(window, 'keydown', (e) => this.key(e as KeyboardEvent, true));
    this.on(window, 'keyup', (e) => this.key(e as KeyboardEvent, false));
    this.on(window, 'blur', () => this.releaseAll());
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    this.on(surface, 'pointerdown', (e) => this.down(e as PointerEvent), { passive: false });
    this.on(window, 'pointermove', (e) => this.move(e as PointerEvent), { passive: false });
    this.on(window, 'pointerup', (e) => this.up(e as PointerEvent));
    this.on(window, 'pointercancel', (e) => this.up(e as PointerEvent));
    this.on(surface, 'lostpointercapture', (e) => this.up(e as PointerEvent));
    // Stop page scrolling / zoom gestures on the play surface only.
    this.on(surface, 'touchmove', (e) => e.preventDefault(), { passive: false });
    this.on(surface, 'contextmenu', (e) => e.preventDefault());
  }

  private on(t: EventTarget, type: string, fn: EventListener, opts: AddEventListenerOptions | boolean = false): void {
    t.addEventListener(type, fn, opts);
    this.listeners.push([t, type, fn, opts]);
  }

  dispose(): void {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.listeners = [];
  }

  get listenerCount(): number {
    return this.listeners.length;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const c = e.code;
    const isGameKey = c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD' || c === 'Space' || c === 'KeyP';
    if (!isGameKey) return;
    // Leave browser/OS shortcuts (Ctrl/Cmd/Alt + key) alone. Key-ups always count so steering never sticks.
    if (down && (e.ctrlKey || e.metaKey || e.altKey)) return;
    // Don't steal keys from form controls (settings sliders etc.).
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (this.enabled && (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'Space')) e.preventDefault();
    if (c === 'ArrowLeft' || c === 'KeyA') this.left = down;
    if (c === 'ArrowRight' || c === 'KeyD') this.right = down;
    if (down && !e.repeat) {
      if (c === 'Space' && this.enabled) this.shedLatch = true;
      if (c === 'KeyP' && this.enabled) this.pauseLatch = true;
      this.onAnyInput?.();
    }
    if (down) this.lastDevice = 'keyboard';
  }

  private down(e: PointerEvent): void {
    if (this.pointerId !== null) return; // ignore extra touches: first finger steers
    if (e.button !== undefined && e.button > 0) return;
    this.pointerId = e.pointerId;
    this.anchorX = e.clientX;
    this.pointerSteer = 0;
    this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers throw for synthetic events */
    }
    if (this.enabled) e.preventDefault();
    this.onAnyInput?.();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const range = this.rangePx();
    let dx = e.clientX - this.anchorX;
    // anchor follows the finger beyond full deflection
    if (dx > range) {
      this.anchorX = e.clientX - range;
      dx = range;
    } else if (dx < -range) {
      this.anchorX = e.clientX + range;
      dx = -range;
    }
    const dz = this.settings.deadZonePx;
    const mag = Math.max(0, Math.abs(dx) - dz) / (range - dz);
    this.pointerSteer = Math.sign(dx) * Math.min(1, mag);
    if (this.enabled) e.preventDefault();
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.pointerSteer = 0;
  }

  private rangePx(): number {
    const w = Math.max(320, Math.min(window.innerWidth, 1400));
    return Math.max(40, (w * 0.11) / this.settings.sensitivity);
  }

  releaseAll(): void {
    this.left = this.right = false;
    this.keySteer = 0;
    this.pointerId = null;
    this.pointerSteer = 0;
  }

  /** Called once per simulation step. */
  steer(dt: number): number {
    const target = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const rate = target === 0 || Math.sign(target) !== Math.sign(this.keySteer) ? T.steerRampDown : T.steerRampUp;
    const d = target - this.keySteer;
    this.keySteer += Math.max(-rate * dt, Math.min(rate * dt, d));
    if (this.pointerId !== null) return this.pointerSteer;
    return this.keySteer;
  }

  requestShed(): void {
    if (this.enabled) this.shedLatch = true;
  }

  consumeShed(): boolean {
    const v = this.shedLatch;
    this.shedLatch = false;
    return v;
  }

  consumePause(): boolean {
    const v = this.pauseLatch;
    this.pauseLatch = false;
    return v;
  }

  get dragging(): boolean {
    return this.pointerId !== null;
  }
}
