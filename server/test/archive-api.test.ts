import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { mkChar } from './helpers/meta-seed';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter } from '../src/db/characters-repo';
import { recomputeGearValues } from '../src/db/prices-repo';
import { rebuildMetaRollup } from '../src/db/meta-rollup';
import { writeArchivePage } from '../src/archive/write';
import { loadConfig, SEASON_NAMES } from '../src/config';
import { createApp } from '../src/api/app';
import { parseFilter } from '../src/api/filters';
import { rollupScope } from '../src/api/meta/rollup';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const api = '/api/v1';
let pool: Pool;
let app: Express;
let fxNames: string[] = [];

const gear = () => [
  { name: 'Harlequin Crest', quality: 'Unique', slot: 'Helm' },
  { name: 'Spirit', quality: 'Runeword', runeword: true, slot: 'Left Hand' },
];

beforeAll(async () => {
  pool = await freshDb();
  const archive = async (season: number, c: ReturnType<typeof mkChar>, raw: object) => {
    await writeArchivePage(pool, {
      season, mode: 'softcore', pass: 1, page: 1, upstreamTotal: 1,
      rows: [{ compact: c, raw, lastUpdated: new Date('2025-06-01T00:00:00Z') }],
      counts: { received: 1, belowMin: 0, invalid: 0 }, done: true, rollup: false,
    });
  };
  // Live S14 and archive S13 Paladins with the same gear.
  await upsertCharacter(pool, 14, mkChar({ name: 'LiveRef', items: gear() }), { character: { name: 'LiveRef' } });
  await archive(13, mkChar({ name: 'ArchRef', items: gear() }), { character: { name: 'ArchRef' } });
  // Fixture characters give the detail endpoints a parseable raw.
  const live = structuredClone(fx);
  live.character.name = 'FxLive';
  await upsertCharacter(pool, 14, toCompact(live, 'A1'), enrichRaw(live, 'A1'));
  const arch = structuredClone(fx);
  arch.character.name = 'FxArch';
  await archive(13, toCompact(arch, 'A2'), enrichRaw(arch, 'A2'));
  fxNames = [...new Set(toCompact(live, 'A1').items.filter((i) => i.owner === 'player' && (i.isRuneword || i.quality === 'Unique' || i.quality === 'Set')).map((i) => i.name))];
  const price = (type: string, name: string, hr: number) =>
    pool.query(
      `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
       values ('softcore', $1, $2, $3, 5, 'sold', now()) on conflict do nothing`,
      [type, name, hr],
    );
  await price('Unique', 'Harlequin Crest', 0.3);
  await price('Runeword', 'Spirit', 0.1);
  for (const n of fxNames) {
    const it = toCompact(live, 'A1').items.find((i) => i.name === n)!;
    await price(it.isRuneword ? 'Runeword' : it.quality, n, 1);
  }
  await recomputeGearValues(pool, { season: 14 });
  await rebuildMetaRollup(pool);
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

const get = (path: string) => request(app).get(`${api}${path}`);

describe('archive seasons in the API', () => {
  it('lists S13 as Betrayal under the live season and names S11 Prosperity', async () => {
    const r = await get('/builds/seasons');
    expect(r.body.seasons.map((s: any) => s.season)).toEqual([14, 13]);
    expect(r.body.seasons[1].name).toBe('Betrayal');
    expect(r.body.seasons.map((s: any) => s.current)).toEqual([true, false]);
    expect(SEASON_NAMES[11]).toBe('Prosperity');
  });

  it('usage has no prices for S13 and prices for S14', async () => {
    const a = await get('/builds/usage?season=13');
    expect(a.status).toBe(200);
    expect(a.body.items.length).toBeGreaterThan(0);
    expect(a.body.items.every((i: any) => i.medianHr === null)).toBe(true);
    const l = await get('/builds/usage?season=14');
    expect(l.body.items.some((i: any) => typeof i.medianHr === 'number')).toBe(true);
  });

  it('ignores maxGearHr for S13 but applies it to S14', async () => {
    const a0 = await get('/builds/usage?season=13&maxGearHr=0');
    const a = await get('/builds/usage?season=13');
    expect(a0.body.total).toBe(a.body.total);
    expect(a.body.total).toBe(2);
    const l0 = await get('/builds/usage?season=14&maxGearHr=0');
    const l = await get('/builds/usage?season=14');
    expect(l0.body.total).toBeLessThan(l.body.total);
  });

  it('build preview has no prices for S13', async () => {
    const a = await get('/builds/characters/ArchRef?season=13');
    expect(a.status).toBe(200);
    expect(a.body.gear.length).toBeGreaterThan(0);
    expect(a.body.gear.every((g: any) => g.medianHr === null)).toBe(true);
    expect(a.body.gearValueHr).toBeNull();
    const l = await get('/builds/characters/LiveRef?season=14');
    expect(l.body.gear.some((g: any) => typeof g.medianHr === 'number')).toBe(true);
  });

  it('character detail is archive with null prices for S13', async () => {
    const a = await get('/characters/FxArch?season=13');
    expect(a.status).toBe(200);
    expect(a.body.archive).toBe(true);
    const vals = Object.values(a.body.prices);
    expect(vals.length).toBeGreaterThan(0);
    expect(vals.every((v) => v === null)).toBe(true);
    expect(a.body.gear.valueHr).toBeNull();
    const l = await get('/characters/FxLive?season=14');
    expect(l.body.archive).toBe(false);
    expect(Object.values(l.body.prices).some((v) => v !== null)).toBe(true);
  });

  it('meta has no prices for S13 and keeps them for S14', async () => {
    const a = await get('/meta?season=13&classes=Paladin');
    expect(a.status).toBe(200);
    expect(a.body.poolSize).toBe(2); // ArchRef plus the Paladin fixture character
    expect(a.body.pricesComputedAt).toBeNull();
    const tops = Object.values(a.body.topItemsBySlot).flat() as any[];
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.every((t) => t.price === null)).toBe(true);
    expect(tops.find((t) => t.itemName === 'Spirit').runeCostHr).toBeNull();
    expect(JSON.stringify(a.body)).not.toContain('NaN');
    const l = await get('/meta?season=14&classes=Paladin');
    expect(l.body.pricesComputedAt).not.toBeNull();
    const lt = Object.values(l.body.topItemsBySlot).flat() as any[];
    expect(lt.find((t) => t.itemName === 'Harlequin Crest').price).not.toBeNull();
  });

  it('the S13 base cohort reads the rollup', async () => {
    expect(await rollupScope(pool, parseFilter({ season: '13' }, cfg))).not.toBeNull();
  });

  it('history is empty for S13', async () => {
    expect((await get('/builds/history?season=13')).body).toEqual({ days: [] });
  });
});
