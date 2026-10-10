/**
 * Save storage adapters. On CrazyGames the Data module is the single authoritative store
 * (guests and signed-in users). The local adapter is only for standalone/dev hosting and uses
 * a namespaced key so it never collides with anything else on the origin.
 */
export type LoadResult = { ok: true; raw: string | null } | { ok: false; error: string };

export interface SaveStorage {
  readonly kind: 'crazygames' | 'local' | 'memory';
  load(): Promise<LoadResult>;
  save(raw: string): Promise<void>;
  /** Keep a copy of unreadable data instead of silently destroying it. */
  backupCorrupt(raw: string): Promise<void>;
}

export class MemoryStorage implements SaveStorage {
  readonly kind = 'memory' as const;
  raw: string | null = null;
  saves = 0;
  failNextLoad: string | null = null;
  failSaves = false;
  backups: string[] = [];

  constructor(initial: string | null = null) {
    this.raw = initial;
  }

  async load(): Promise<LoadResult> {
    if (this.failNextLoad) {
      const e = this.failNextLoad;
      this.failNextLoad = null;
      return { ok: false, error: e };
    }
    return { ok: true, raw: this.raw };
  }

  async save(raw: string): Promise<void> {
    if (this.failSaves) throw new Error('simulated save failure');
    this.raw = raw;
    this.saves++;
  }

  async backupCorrupt(raw: string): Promise<void> {
    this.backups.push(raw);
  }
}

export class LocalStorageAdapter implements SaveStorage {
  readonly kind = 'local' as const;
  constructor(private key: string) {}

  async load(): Promise<LoadResult> {
    try {
      return { ok: true, raw: window.localStorage.getItem(this.key) };
    } catch (e) {
      return { ok: false, error: `localStorage unavailable: ${String(e)}` };
    }
  }

  async save(raw: string): Promise<void> {
    window.localStorage.setItem(this.key, raw);
  }

  async backupCorrupt(raw: string): Promise<void> {
    try {
      window.localStorage.setItem(`${this.key}.corrupt.${Date.now()}`, raw.slice(0, 200_000));
    } catch {
      /* ignore */
    }
  }
}

/** Minimal shape of the CrazyGames SDK v3 Data module (same API as localStorage). */
export interface CrazyDataModule {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

export class CrazyDataStorage implements SaveStorage {
  readonly kind = 'crazygames' as const;
  constructor(private data: CrazyDataModule, private key: string) {}

  async load(): Promise<LoadResult> {
    try {
      const v = await this.data.getItem(this.key);
      return { ok: true, raw: typeof v === 'string' ? v : null };
    } catch (e) {
      return { ok: false, error: `Data module read failed: ${String(e)}` };
    }
  }

  async save(raw: string): Promise<void> {
    await this.data.setItem(this.key, raw);
  }

  async backupCorrupt(raw: string): Promise<void> {
    try {
      await this.data.setItem(`${this.key}.corrupt`, raw.slice(0, 200_000));
    } catch {
      /* ignore */
    }
  }
}
