import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { mkChar, seed } from './helpers/meta-seed';
import { loadConfig } from '../src/config';
import { createApp, cacheKeyFrom } from '../src/api/app';
import * as cohort from '../src/api/meta/cohort';
import { META_SLOTS } from '../src/core/static-data';

const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const api = '/api/v1';
let pool: Pool;
let app: Express;

beforeAll(async () => {
  pool = await freshDb();
  await seed(pool, [
    mkChar({ name: 'P1', skills: [['Blessed Hammer', 20], ['Vigor', 5]], items: [{ name: 'Harlequin Crest', quality: 'Unique', slot: 'Helm' }] }),
    mkChar({ name: 'P2', skills: [['Blessed Hammer', 20]], items: [{ name: 'Harlequin Crest', quality: 'Unique', slot: 'Helm' }] }),
    mkChar({ name: 'P3', skills: [['Smite', 15]] }),
    mkChar({ name: 'S1', className: 'Sorceress', skills: [['Blizzard', 20]] }),
  ]);
  await pool.query(
    `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
     values ('softcore', 'Unique', 'Harlequin Crest', 0.3, 5, 'sold', now())`,
  );
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

const get = (qs: string) => request(app).get(`${api}/meta${qs}`);
const skillsParam = (name: string, minLevel: number) => encodeURIComponent(JSON.stringify([{ name, minLevel }]));

describe('GET /meta', () => {
  it('returns the class cohort', async () => {
    const r = await get('?gameMode=softcore&classes=Paladin');
    expect(r.status).toBe(200);
    expect(r.body.poolSize).toBe(3);
    expect(r.body.className).toBe('Paladin');
    expect(Array.isArray(r.body.skillUsage)).toBe(true);
    for (const s of META_SLOTS) {
      expect(r.body.topItemsBySlot).toHaveProperty(s);
      expect(r.body.affixModsBySlot).toHaveProperty(s);
    }
    expect(JSON.stringify(r.body).length).toBeLessThan(200000);
    expect(r.body.topItemsBySlot.helm[0].price).toMatchObject({ medianHr: 0.3 });
  });

  it('without classes: className and skillUsage are null', async () => {
    const r = await get('?gameMode=softcore');
    expect(r.body).toMatchObject({ className: null, skillUsage: null, poolSize: 4 });
  });

  it('empty cohort has no NaN and an empty skillUsage', async () => {
    const r = await get('?gameMode=softcore&classes=Druid');
    expect(r.body.poolSize).toBe(0);
    expect(r.body.skillUsage).toEqual([]);
    expect(JSON.stringify(r.body)).not.toContain('NaN');
  });

  it('cache key separates different skills', async () => {
    const a = await get(`?classes=Paladin&skills=${skillsParam('Blessed Hammer', 20)}`);
    const b = await get(`?classes=Paladin&skills=${skillsParam('Smite', 10)}`);
    expect(a.body.poolSize).toBe(2);
    expect(b.body.poolSize).toBe(1);
  });

  it('invalid skills equal no skills; items param is ignored', async () => {
    const none = await get('?classes=Paladin');
    expect((await get('?classes=Paladin&skills=notjson')).body.poolSize).toBe(none.body.poolSize);
    expect((await get('?classes=Paladin&items=Spirit')).body.poolSize).toBe(none.body.poolSize);
  });

  it('warm-up fills the exact keys a request uses', async () => {
    expect(await app.locals.warmMeta()).toBe(16);
    const spy = vi.spyOn(cohort, 'metaCohort');
    const r = await get('?gameMode=softcore&classes=Paladin');
    expect(r.status).toBe(200);
    expect(r.body.poolSize).toBe(3);
    expect(spy).not.toHaveBeenCalled();
    await get('?gameMode=softcore&classes=Paladin&minLevel=80&items=Spirit&mercTypes=x&maxGearHr=3&_=1');
    expect(spy).not.toHaveBeenCalled();
    await get('?gameMode=softcore&classes=Sorceress&minLevel=85');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('cacheKeyFrom is order independent and includes char', () => {
    expect(cacheKeyFrom('/meta', { classes: 'B,A' })).toBe(cacheKeyFrom('/meta', { classes: 'A,B' }));
    expect(cacheKeyFrom('/x', { char: 'Foo' })).not.toBe(cacheKeyFrom('/x', { char: 'Bar' }));
  });

  it('leaves item-usage unchanged', async () => {
    const r = await request(app).get(`${api}/characters/stats/item-usage?gameMode=softcore&classes=Paladin`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
