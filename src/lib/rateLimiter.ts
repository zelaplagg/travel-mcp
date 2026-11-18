/** Spaces calls so that at least `intervalMs` passes between two consecutive calls. */
export class MinIntervalLimiter {
  private nextAllowed = 0;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    intervalMs: number,
    deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.intervalMs = intervalMs;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async wait(): Promise<void> {
    const current = this.now();
    const start = Math.max(current, this.nextAllowed);
    // Reserve the slot synchronously so concurrent callers are queued, not bunched up.
    this.nextAllowed = start + this.intervalMs;
    const delay = start - current;
    if (delay > 0) await this.sleep(delay);
  }
}

export interface ConsumeResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Allows at most `maxRequests` per key in each fixed time window. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(maxRequests: number, windowMs: number, now: () => number = Date.now) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.now = now;
  }

  tryConsume(key: string): ConsumeResult {
    const current = this.now();
    this.evictExpired(current);

    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + this.windowMs };
      this.windows.set(key, entry);
    }
    if (entry.count >= this.maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - current) / 1000) };
    }
    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private evictExpired(current: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= current) this.windows.delete(key);
    }
  }
}
