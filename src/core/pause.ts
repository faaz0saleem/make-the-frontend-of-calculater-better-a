export type PauseReason = 'user' | 'hidden' | 'blur' | 'ad' | 'menu' | 'countdown' | 'tutorial' | 'crash' | 'platform';

/**
 * Centralized pause reasons. Simulation runs only when no reason is active.
 * Removing one reason never clears another.
 */
export class PauseManager {
  private reasons = new Set<PauseReason>();
  private listeners = new Set<(paused: boolean, reasons: ReadonlySet<PauseReason>) => void>();

  add(r: PauseReason): void {
    const was = this.paused;
    this.reasons.add(r);
    if (!was) this.notify();
    else this.notifyReasons();
  }

  remove(r: PauseReason): void {
    if (!this.reasons.has(r)) return;
    this.reasons.delete(r);
    this.notify();
  }

  has(r: PauseReason): boolean {
    return this.reasons.has(r);
  }

  clearAll(): void {
    if (this.reasons.size === 0) return;
    this.reasons.clear();
    this.notify();
  }

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  list(): PauseReason[] {
    return [...this.reasons];
  }

  onChange(fn: (paused: boolean, reasons: ReadonlySet<PauseReason>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn(this.paused, this.reasons);
  }

  private notifyReasons(): void {
    this.notify();
  }
}
