import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { limitedPool } from '../src/api/meta/cohort';

function fakePool(fail: (n: number) => boolean) {
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  const pool = {
    query: async () => {
      const n = calls++;
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (fail(n)) throw new Error('boom');
      return { rows: [] };
    },
  } as unknown as Pool;
  return { pool, peak: () => peak, inFlight: () => inFlight };
}

describe('limitedPool', () => {
  it('never runs more than 4 queries at once', async () => {
    const f = fakePool(() => false);
    const lp = limitedPool(f.pool);
    await Promise.all(Array.from({ length: 12 }, () => lp.query('select 1')));
    expect(f.peak()).toBe(4);
    expect(f.inFlight()).toBe(0);
  });

  it('frees the slot after a rejected query', async () => {
    const f = fakePool((n) => n < 4);
    const lp = limitedPool(f.pool);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => lp.query('select 1')));
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(8);
    expect(f.peak()).toBeLessThanOrEqual(4);
  });
});
