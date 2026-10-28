import { describe, it, expect } from 'vitest';
import { RateLimiter, isInPauseWindow } from '../src/upstream/rate-limiter';

function fake(startMs = Date.parse('2026-10-28T22:00:00Z')) {
  let t = startMs;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}
const mk = (c: ReturnType<typeof fake>) =>
  new RateLimiter({ minIntervalMs: 1000, pauseStartHour: 12, pauseEndHour: 14, now: c.now, sleep: c.sleep });

describe('isInPauseWindow', () => {
  it('handles PDT and PST', () => {
    expect(isInPauseWindow(new Date('2026-10-28T19:30:00Z'))).toBe(true);
    expect(isInPauseWindow(new Date('2026-10-28T22:00:00Z'))).toBe(false);
    expect(isInPauseWindow(new Date('2026-11-01T20:30:00Z'))).toBe(true);
  });
  it('end hour is exclusive', () => {
    expect(isInPauseWindow(new Date('2026-10-28T21:00:00Z'))).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('spaces starts by minInterval', async () => {
    const c = fake();
    const l = mk(c);
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => l.schedule(async () => void starts.push(c.now()))));
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
    expect(l.requestCount).toBe(3);
  });

  it('backs off after failures and resets on success', async () => {
    const c = fake();
    const l = mk(c);
    const starts: number[] = [];
    const rec = async () => void starts.push(c.now());
    await l.schedule(rec);
    l.reportFailure();
    l.reportFailure();
    await l.schedule(rec);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(21000);
    l.reportSuccess();
    await l.schedule(rec);
    expect(starts[2] - starts[1]).toBeLessThan(2000);
  });

  it('sleeps through the pause window using injected clock', async () => {
    const c = fake(Date.parse('2026-10-28T19:30:00Z'));
    const l = mk(c);
    let started = 0;
    await l.schedule(async () => void (started = c.now()));
    expect(isInPauseWindow(new Date(started))).toBe(false);
    expect(started).toBeGreaterThanOrEqual(Date.parse('2026-10-28T21:00:00Z'));
    expect(c.sleeps.every((s) => s === 60000)).toBe(true);
  });

  it('keeps going after a rejected task', async () => {
    const c = fake();
    const l = mk(c);
    await expect(
      l.schedule(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    await expect(l.schedule(async () => 5)).resolves.toBe(5);
  });

  it('starts task N+1 only after task N settles', async () => {
    const c = fake();
    const l = mk(c);
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p1 = l.schedule(async () => {
      events.push('start1');
      await gate;
      events.push('end1');
    });
    const p2 = l.schedule(async () => void events.push('start2'));
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(['start1']);
    release();
    await Promise.all([p1, p2]);
    expect(events).toEqual(['start1', 'end1', 'start2']);
  });
});
