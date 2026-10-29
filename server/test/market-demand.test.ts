import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { toListingRow } from '../src/core/price';
import { markGone, upsertListings } from '../src/db/market-repo';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';

let pool: Pool;
beforeEach(async () => { pool = await freshDb(); });
afterEach(async () => { await pool.end(); });

const raw = (id: string, name: string, quantity: unknown, extra: Record<string, unknown> = {}) =>
  ({
    _id: id, is_ladder: true, is_hardcore: false, price: '1', created_at: '2026-10-29T08:00:00Z',
    item: { name, base: { name }, quality: { name: 'Normal' }, quantity },
    ...extra,
  }) as any;

const t = (h: number) => new Date(Date.UTC(2026, 9, 29, h));

describe('quantity mapping', () => {
  it('maps item.quantity to an int or null', () => {
    expect(toListingRow(raw('a', 'Zakarum Orb', 50)).quantity).toBe(50);
    expect(toListingRow(raw('b', 'Jewel', 1)).quantity).toBe(1);
    expect(toListingRow(raw('c', 'Jewel', undefined)).quantity).toBeNull();
    expect(toListingRow(raw('d', 'Jewel', '5')).quantity).toBeNull();
  });
});

describe('qty_dropped', () => {
  const row = async (id: string) =>
    (await pool.query('select quantity, first_quantity, qty_dropped from market_listings where id = $1', [id])).rows[0];

  it('accumulates drops, ignores increases and keeps first_quantity', async () => {
    await upsertListings(pool, [toListingRow(raw('a', 'Zakarum Orb', 50))], t(10));
    await upsertListings(pool, [toListingRow(raw('a', 'Zakarum Orb', 40))], t(11));
    await upsertListings(pool, [toListingRow(raw('a', 'Zakarum Orb', 45))], t(12));
    await upsertListings(pool, [toListingRow(raw('a', 'Zakarum Orb', 30))], t(13));
    expect(await row('a')).toEqual({ quantity: 30, first_quantity: 50, qty_dropped: 25 });
  });

  it('does not count a drop when either quantity is null', async () => {
    await upsertListings(pool, [toListingRow(raw('n', 'Zakarum Orb', null))], t(10));
    await upsertListings(pool, [toListingRow(raw('n', 'Zakarum Orb', 20))], t(11));
    await upsertListings(pool, [toListingRow(raw('n', 'Zakarum Orb', null))], t(12));
    expect((await row('n')).qty_dropped).toBe(0);
  });
});

describe('GET /market/demand', () => {
  const app = () => createApp({ pool, cfg: loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any) });

  it('returns the documented shape', async () => {
    const now = new Date();
    const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
    await upsertListings(pool, [
      toListingRow(raw('open', 'Zakarum Orb', 50)),
      toListingRow(raw('sold', 'Zakarum Orb', 20, { created_at: ago(30).toISOString() })),
      toListingRow(raw('bulk', 'Zakarum Orb', 100)),
      toListingRow(raw('other', 'Jewel', 1)),
    ], ago(30));
    await upsertListings(pool, [toListingRow(raw('open', 'Zakarum Orb', 50)), toListingRow(raw('bulk', 'Zakarum Orb', 100))], ago(20));
    await upsertListings(pool, [toListingRow(raw('open', 'Zakarum Orb', 50)), toListingRow(raw('bulk', 'Zakarum Orb', 70))], ago(10));
    await markGone(pool, ago(15));
    await markGone(pool, ago(5));
    const r = await request(app()).get('/api/v1/market/demand?items=Zakarum Orb,Horadrim Orb&gameMode=softcore&days=7');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['days', 'items', 'trackingSince']);
    expect(r.body.days).toBe(7);
    expect(new Date(r.body.trackingSince).getTime()).toBeLessThanOrEqual(ago(29).getTime());
    const [z, h] = r.body.items;
    expect(z).toMatchObject({ name: 'Zakarum Orb', openListings: 2, openQty: 120, goneListings: 1, goneQty: 20, droppedQty: 30 });
    expect(z.medianHoursListed).toBeGreaterThan(0);
    expect(h).toEqual({
      name: 'Horadrim Orb', openListings: 0, openQty: 0, goneListings: 0, goneQty: 0, droppedQty: 0, medianHoursListed: null,
    });
    expect((await request(app()).get('/api/v1/market/demand?items=Zakarum Orb&gameMode=hardcore')).body.items[0].openListings).toBe(0);
  });

  it('caps items at 10 and clamps days', async () => {
    const names = Array.from({ length: 14 }, (_, i) => `Item ${i}`).join(',');
    const r = await request(app()).get(`/api/v1/market/demand?items=${names}&days=99`);
    expect(r.body.items).toHaveLength(10);
    expect(r.body.days).toBe(30);
    expect((await request(app()).get('/api/v1/market/demand?items=A&days=0')).body.days).toBe(1);
    expect((await request(app()).get('/api/v1/market/demand?items=A')).body.days).toBe(7);
    expect((await request(app()).get('/api/v1/market/demand')).body.items).toEqual([]);
  });
});
