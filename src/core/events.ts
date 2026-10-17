type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<Events[K]>)(payload);
  }

  listenerCount(): number {
    let n = 0;
    for (const s of this.handlers.values()) n += s.size;
    return n;
  }

  clear(): void {
    this.handlers.clear();
  }
}
