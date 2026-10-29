const PAUSE_STEP_MS = 60_000;
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 300_000;

export function isInPauseWindow(
  d: Date,
  startHour = 12,
  endHour = 14,
  tz = 'America/Los_Angeles',
): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return hour >= startHour && hour < endHour;
}

export interface RateLimiterOptions {
  minIntervalMs: number;
  pauseStartHour: number;
  pauseEndHour: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly pauseStartHour: number;
  private readonly pauseEndHour: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart: number | null = null;
  private failures = 0;
  private count = 0;

  constructor(opts: RateLimiterOptions) {
    this.minIntervalMs = opts.minIntervalMs;
    this.pauseStartHour = opts.pauseStartHour;
    this.pauseEndHour = opts.pauseEndHour;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get requestCount(): number {
    return this.count;
  }

  reportFailure(): void {
    this.failures += 1;
  }

  reportSuccess(): void {
    this.failures = 0;
  }

  private backoffMs(): number {
    if (this.failures === 0) return 0;
    return Math.min(2 ** this.failures * BACKOFF_BASE_MS, BACKOFF_MAX_MS);
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      if (this.lastStart !== null) {
        const wait = this.lastStart + this.minIntervalMs + this.backoffMs() - this.now();
        if (wait > 0) await this.sleep(wait);
      }
      while (isInPauseWindow(new Date(this.now()), this.pauseStartHour, this.pauseEndHour)) {
        await this.sleep(PAUSE_STEP_MS);
      }
      this.lastStart = this.now();
      this.count += 1;
      return fn();
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
