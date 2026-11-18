/** Small in-memory cache with per-entry expiry and a size cap (oldest entry is evicted first). */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(ttlMs: number, options: { maxEntries?: number; now?: () => number } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}
