import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter } from '../src/db/characters-repo';
import { recomputeGearValues } from '../src/db/prices-repo';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';
import { mercTypeOf } from '../src/core/merc-types';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const SEASON = cfg.currentSeason;
const OTHER = 15;
const api = '/api/v1';

let pool: Pool;
let app: Express;
let itemA = '';
let itemB = '';
let itemAType = '';

const isBuildItem = (i: any) => i.owner === 'player' && (i.isRuneword || i.quality === 'Unique' || i.quality === 'Set');
const typeOf = (i: any) => (i.isRuneword ? 'Runeword' : i.quality);

beforeAll(async () => {
  pool = await freshDb();
  const base = toCompact(fx, 'MC-MEEKS');
  const built = base.items.filter(isBuildItem);
  const names = [...new Set(built.map((i) => i.name))];
  [itemA, itemB] = names;
  itemAType = typeOf(built.find((i) => i.name === itemA));

  const v1 = structuredClone(fx);
  v1.character.name = 'VariantOne';
  v1.character.class.name = 'Sorceress';
  v1.items = v1.items.filter((it: any) => (it.name || it.base?.name) !== itemB);
  const v2 = structuredClone(fx);
  v2.character.name = 'VariantTwo';
  v2.character.level = 85;
  v2.items = v2.items.filter((it: any) => (it.name || it.base?.name) !== itemB);
  v2.mercenary = { ...v2.mercenary, description: 'Cold Arrow' };
  const v3 = structuredClone(fx);
  v3.character.name = 'VariantThree';
  v3.character.level = 90;
  v3.character.status.is_hardcore = true;
  for (const [raw, acct] of [[fx, 'MC-MEEKS'], [v1, 'Other1'], [v2, 'Other2'], [v3, 'Other3']] as Array<[any, string]>) {
    await upsertCharacter(pool, SEASON, toCompact(raw, acct), enrichRaw(raw, acct));
  }

  // season 15: one character with an unknown merc type, one with no items at all
  const mystery = structuredClone(fx);
  mystery.character.name = 'MysteryMerc';
  mystery.mercenary = { ...mystery.mercenary, description: 'Mystery' };
  const naked = structuredClone(fx);
  naked.character.name = 'NakedOne';
  naked.items = [];
  for (const [raw, acct] of [[mystery, 'Myst'], [naked, 'Nude']] as Array<[any, string]>) {
    await upsertCharacter(pool, OTHER, toCompact(raw, acct), enrichRaw(raw, acct));
  }

  // price every softcore build item except itemB; itemA at 2.5
  for (const n of names.filter((x) => x !== itemB)) {
    const it = built.find((i) => i.name === n)!;
    await pool.query(
      `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
       values ('softcore', $1, $2, $3, 3, 'ask', now()) on conflict do nothing`,
      [typeOf(it), n, n === itemA ? 2.5 : 1],
    );
  }
  await recomputeGearValues(pool, { season: SEASON });
  await recomputeGearValues(pool, { season: OTHER });
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

describe('GET /builds/usage', () => {
  it('has season total, class breakdown and usage lists', async () => {
    const r = await request(app).get(`${api}/builds/usage`);
    expect(r.status).toBe(200);
    expect(r.body.seasonTotal).toBe(3);
    expect(r.body.total).toBe(3);
    expect(Object.keys(r.body.breakdown).sort()).toEqual(
      ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress', 'total'],
    );
    expect(r.body.breakdown.total).toBe(3);
    expect(r.body.skills.length).toBeGreaterThan(0);
    for (const s of r.body.skills) expect(s.count).toBeLessThanOrEqual(r.body.total);
    const a = r.body.items.find((x: any) => x.name === itemA);
    expect(a).toMatchObject({ count: 3, pct: 100, medianHr: 2.5, itemType: itemAType });
    const b = r.body.items.find((x: any) => x.name === itemB);
    expect(b.medianHr).toBeNull();
    expect(b.count).toBe(1);
    const sorted = [...r.body.items].sort((x: any, y: any) => y.count - x.count || (x.name < y.name ? -1 : 1));
    expect(r.body.items).toEqual(sorted);
  });

  it('keeps the class breakdown when classes is filtered', async () => {
    const r = await request(app).get(`${api}/builds/usage?classes=Sorceress`);
    expect(r.body.breakdown.total).toBe(3);
    expect(r.body.total).toBe(1);
    expect(r.body.seasonTotal).toBe(3);
  });

  it('returns empty lists and zero totals for a filter that matches nobody', async () => {
    const r = await request(app).get(`${api}/builds/usage?items=NoSuchItem`);
    expect(r.body).toMatchObject({ total: 0, skills: [], items: [], mercTypes: [], mercItems: [] });
  });

  it('maxGearHr limits by gear value; negative means no budget', async () => {
    // The budget only applies to the live season, so this check runs with season 15 as the current one.
    const live = createApp({ pool, cfg: loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: String(OTHER) } as any) });
    const q = `season=${OTHER}`;
    expect((await request(live).get(`${api}/builds/usage?${q}`)).body.total).toBe(2);
    const zero = await request(live).get(`${api}/builds/usage?${q}&maxGearHr=0`);
    expect(zero.body.total).toBe(1);
    const neg = await request(live).get(`${api}/builds/usage?${q}&maxGearHr=-1`);
    expect(neg.body.total).toBe(2);
    const chars = await request(live).get(`${api}/characters?${q}&maxGearHr=0`);
    expect(chars.body.characters[0].character.name).toBe('NakedOne');
  });

  it('maps merc types with act and groups unknown ones as Other', async () => {
    const r = await request(app).get(`${api}/builds/usage`);
    expect(r.body.mercTypes.find((m: any) => m.name === 'Cold Arrow')).toMatchObject({ act: 1, count: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = await request(app).get(`${api}/builds/usage?season=${OTHER}`);
    expect(o.body.mercTypes.find((m: any) => m.name === 'Other')).toMatchObject({ act: null, count: 1 });
    const only = await request(app).get(`${api}/characters?season=${OTHER}&mercTypes=Other`);
    expect(only.body.total).toBe(1);
    expect(only.body.characters[0].character.name).toBe('MysteryMerc');
    warn.mockRestore();
  });
});

describe('merc types', () => {
  it('warns once per unknown raw value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mercTypeOf('Fire Arrow')).toEqual({ name: 'Fire Arrow', act: 1 });
    expect(mercTypeOf('Zzz')).toEqual({ name: 'Other', act: null });
    mercTypeOf('Zzz');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('unknown merc type "Zzz"');
    warn.mockRestore();
  });
  it('legacy merc-type-usage keeps the raw name', async () => {
    const r = await request(app).get(`${api}/characters/stats/merc-type-usage?season=${OTHER}`);
    expect(r.body.map((x: any) => x.mercType)).toContain('Mystery');
  });
});

describe('GET /builds/seasons and /prices', () => {
  it('lists the seasons with names', async () => {
    const r = await request(app).get(`${api}/builds/seasons`);
    expect(r.body.current).toBe(14);
    expect(r.body.seasons[0]).toEqual({ season: 15, name: 'Season 15', current: false, characters: { softcore: 2, hardcore: 0 } });
    const cur = r.body.seasons.find((s: any) => s.season === 14);
    expect(cur).toMatchObject({ name: 'Alliance', current: true, characters: { softcore: 3, hardcore: 1 } });
  });
  it('lists prices per mode', async () => {
    const r = await request(app).get(`${api}/prices?gameMode=softcore`);
    expect(r.body.items.find((x: any) => x.name === itemA)).toMatchObject({ medianHr: 2.5, itemType: itemAType });
    expect((await request(app).get(`${api}/prices?gameMode=hardcore`)).body.items).toEqual([]);
  });
});
