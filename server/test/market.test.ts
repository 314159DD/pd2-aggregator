import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { toListingRow } from '../src/core/price';
import { markGone, upsertListings } from '../src/db/market-repo';
import { fullSweep, pollIncremental } from '../src/collector/market-poller';
import fx from './fixtures/listings.json';

const data = (fx as any).data as any[];
let pool: Pool;
beforeEach(async () => { pool = await freshDb(); });
afterEach(async () => { await pool.end(); });

const gone = async (id: string) =>
  (await pool.query('select gone_at from market_listings where id = $1', [id])).rows[0].gone_at;

const fakeClient = (pages: any[][], total: number, calls: number[] = []) =>
  ({
    listings: async (q: { skip: number }) => {
      calls.push(q.skip);
      return { total, data: pages[Math.floor(q.skip / 240)] ?? [] };
    },
  }) as any;

describe('market repo', () => {
  it('upserts a page in one go and is idempotent', async () => {
    const rows = data.map(toListingRow);
    await upsertListings(pool, [...rows, rows[0]], new Date('2026-10-29T10:00:00Z'));
    await upsertListings(pool, rows, new Date('2026-10-29T11:00:00Z'));
    const r = (await pool.query('select count(*)::int n, min(first_seen_at) f, max(last_seen_at) l from market_listings')).rows[0];
    expect(r.n).toBe(new Set(rows.map((x) => x.id)).size);
    expect(r.f.toISOString()).toBe('2026-10-29T10:00:00.000Z');
    expect(r.l.toISOString()).toBe('2026-10-29T11:00:00.000Z');
    const p = (await pool.query('select price_hr from market_listings where id = $1', [data[4]._id])).rows[0];
    expect(Number(p.price_hr)).toBe(0.5);
  });

  it('a re-sighting between misses resets the miss count', async () => {
    const rows = data.map(toListingRow);
    await upsertListings(pool, rows, new Date('2026-10-29T10:00:00Z'));
    await markGone(pool, new Date('2026-10-29T12:00:00Z'));
    await upsertListings(pool, rows, new Date('2026-10-29T12:30:00Z'));
    await markGone(pool, new Date('2026-10-29T18:00:00Z'));
    expect(await gone(rows[0].id)).toBeNull();
    // counted from scratch: one miss, not two
    expect((await pool.query('select max(miss_count)::int m from market_listings')).rows[0].m).toBe(1);
  });

  it('markGone marks unseen listings and a later upsert clears it', async () => {
    const rows = data.map(toListingRow);
    await upsertListings(pool, rows, new Date('2026-10-29T10:00:00Z'));
    const sweepStart = new Date('2026-10-29T12:00:00Z');
    await upsertListings(pool, rows.slice(1), new Date('2026-10-29T12:01:00Z'));
    expect(await markGone(pool, sweepStart)).toBe(0);
    expect(await gone(rows[0].id)).toBeNull();
    // second completed sweep misses it again -> gone
    const sweep2 = new Date('2026-10-29T18:00:00Z');
    await upsertListings(pool, rows.slice(1), new Date('2026-10-29T18:01:00Z'));
    expect(await markGone(pool, sweep2)).toBe(1);
    expect(await gone(rows[0].id)).not.toBeNull();
    expect(await gone(rows[1].id)).toBeNull();
    await upsertListings(pool, [rows[0]], new Date('2026-10-29T13:00:00Z'));
    expect(await gone(rows[0].id)).toBeNull();
  });
});

describe('market poller', () => {
  it('incremental poll upserts the first page', async () => {
    await pollIncremental(pool, fakeClient([data], data.length));
    expect((await pool.query('select count(*)::int n from market_listings')).rows[0].n).toBe(data.length);
  });

  it('full sweep pages until skip >= total and marks gone', async () => {
    const rows = data.map(toListingRow);
    await upsertListings(pool, rows, new Date('2020-01-01T00:00:00Z'));
    const calls: number[] = [];
    const ok = await fullSweep(pool, fakeClient([data.slice(1, 20), data.slice(20)], 300, calls), () => false);
    expect(ok).toBe(true);
    expect(calls).toEqual([0, 240]);
    // first completed sweep only counts a miss
    expect(await gone(rows[0].id)).toBeNull();
    await fullSweep(pool, fakeClient([data.slice(1, 20), data.slice(20)], 300), () => false);
    expect(await gone(rows[0].id)).not.toBeNull();
    expect(await gone(rows[1].id)).toBeNull();
  });

  it('empty page before total aborts the sweep without marking gone', async () => {
    const rows = data.map(toListingRow);
    await upsertListings(pool, rows, new Date('2020-01-01T00:00:00Z'));
    await pool.query('update market_listings set miss_count = 1');
    const ok = await fullSweep(pool, fakeClient([data.slice(1)], 500), () => false);
    expect(ok).toBe(false);
    expect((await pool.query('select count(*)::int n from market_listings where gone_at is not null')).rows[0].n).toBe(0);
  });

  it('interrupted or failed sweep does not mark gone', async () => {
    const rows = data.map(toListingRow);
    await upsertListings(pool, rows, new Date('2020-01-01T00:00:00Z'));
    let n = 0;
    expect(await fullSweep(pool, fakeClient([data.slice(1), data], 500), () => n++ >= 1)).toBe(false);
    const failing = { listings: async () => { throw new Error('boom'); } } as any;
    await expect(fullSweep(pool, failing, () => false)).rejects.toThrow('boom');
    expect((await pool.query('select count(*)::int n from market_listings where gone_at is not null')).rows[0].n).toBe(0);
  });
});
