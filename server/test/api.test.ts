import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter } from '../src/db/characters-repo';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';
import { parseFilter } from '../src/api/filters';
import { filterCte } from '../src/api/filter-sql';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const SEASON = cfg.currentSeason;

let pool: Pool;
let app: Express;
let itemA = '';
let itemB = '';
let fixtureClass = '';

function isBuildItem(i: any): boolean {
  return i.owner === 'player' && (i.isRuneword || i.quality === 'Unique' || i.quality === 'Set');
}

beforeAll(async () => {
  pool = await freshDb();
  const base = toCompact(fx, 'MC-MEEKS');
  fixtureClass = base.className;
  const names = [...new Set(base.items.filter(isBuildItem).map((i) => i.name))];
  expect(names.length).toBeGreaterThanOrEqual(2);
  [itemA, itemB] = names;

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

  const rows: Array<[any, string]> = [
    [fx, 'MC-MEEKS'],
    [v1, 'Other1'],
    [v2, 'Other2'],
    [v3, 'Other3'],
  ];
  for (const [raw, acct] of rows) {
    await upsertCharacter(pool, SEASON, toCompact(raw, acct), enrichRaw(raw, acct));
  }
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

describe('filters', () => {
  it('parses defaults, clamps and ignores invalid skills', () => {
    const f = parseFilter({ minLevel: '500', skills: 'abc', gameMode: 'hardcore', classes: 'A, B' }, cfg);
    expect(f).toMatchObject({ season: SEASON, mode: 'hardcore', minLevel: 99, maxLevel: 99, skills: [], classes: ['A', 'B'] });
    expect(parseFilter({}, cfg)).toMatchObject({ mode: 'softcore', minLevel: 80 });
    expect(parseFilter({ skills: '[{"name":"X","minLevel":3}]' }, cfg).skills).toEqual([{ name: 'X', minLevel: 3 }]);
  });

  it('uses bind parameters only', () => {
    const f = parseFilter({ items: "x'; drop table characters;--" }, cfg);
    const { sql, params } = filterCte(f);
    expect(sql).not.toContain('drop table');
    expect(params).toContain("x'; drop table characters;--");
  });
});

describe('GET /characters', () => {
  it('lists with breakdown', async () => {
    const r = await request(app).get('/api/v1/characters');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(Object.keys(r.body.breakdown).sort()).toEqual(
      ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress', 'total'],
    );
    expect(r.body.breakdown.total).toBe(3);
    expect(r.body.breakdown[fixtureClass]).toBe(2);
    expect(r.body.breakdown.Sorceress).toBe(1);
    for (const c of r.body.characters) {
      expect(typeof c.accountName).toBe('string');
      expect(Array.isArray(c.realSkills)).toBe(true);
    }
  });

  it('hardcore mode is separate', async () => {
    const r = await request(app).get('/api/v1/characters?gameMode=hardcore');
    expect(r.body.total).toBe(1);
    expect(r.body.characters[0].character.level).toBe(90);
  });

  it('narrows by class and minLevel, ignores bad skills', async () => {
    const r = await request(app).get(`/api/v1/characters?classes=${fixtureClass}`);
    expect(r.body.total).toBe(2);
    const all = await request(app).get('/api/v1/characters?skills=abc');
    expect(all.body.total).toBe(3);
    for (const sk of ['[{"name":"X","minLevel":1.5}]', '[{}]']) {
      const r2 = await request(app).get(`/api/v1/characters?skills=${encodeURIComponent(sk)}`);
      expect(r2.status).toBe(200);
      expect(r2.body.total).toBe(3);
    }
    expect((await request(app).get('/api/v1/characters?page=1e300')).status).toBe(200);
    const hi = await request(app).get('/api/v1/characters?gameMode=hardcore&minLevel=91');
    expect(hi.body.total).toBe(0);
  });

  it('caps pageSize and handles page past the end', async () => {
    const r = await request(app).get('/api/v1/characters?pageSize=500');
    expect(r.body.characters.length).toBeLessThanOrEqual(50);
    const p = await request(app).get('/api/v1/characters?page=99');
    expect(p.body.characters).toEqual([]);
    expect(p.body.total).toBe(3);
  });
});

describe('stats routes', () => {
  it('item usage pct and AND filter', async () => {
    const r = await request(app).get('/api/v1/characters/stats/item-usage');
    const a = r.body.find((x: any) => x.item === itemA);
    expect(a).toMatchObject({ numOccurrences: 3, totalSample: 3, pct: 100 });
    expect(['Unique', 'Set', 'Runeword']).toContain(a.itemType);
    const b = r.body.find((x: any) => x.item === itemB);
    expect(b.numOccurrences).toBe(1);
    expect(b.pct).toBe(33.33);

    const both = await request(app).get(
      `/api/v1/characters/stats/item-usage?items=${encodeURIComponent(itemA + ',' + itemB)}`,
    );
    expect(both.body[0].totalSample).toBe(1);
    const one = await request(app).get(`/api/v1/characters?items=${encodeURIComponent(itemA + ',' + itemB)}`);
    expect(one.body.total).toBe(1);
  });

  it('skill, merc type and merc item usage', async () => {
    const s = await request(app).get('/api/v1/characters/stats/skill-usage');
    expect(s.status).toBe(200);
    for (const row of s.body) expect(Object.keys(row).sort()).toEqual(['name', 'numOccurrences', 'pct', 'totalSample']);
    const m = await request(app).get('/api/v1/characters/stats/merc-type-usage');
    expect(m.body).toEqual([
      { mercType: 'Fire Arrow', numOccurrences: 2, totalSample: 3, pct: 66.67 },
      { mercType: 'Cold Arrow', numOccurrences: 1, totalSample: 3, pct: 33.33 },
    ]);
    const mi = await request(app).get('/api/v1/characters/stats/merc-item-usage');
    expect(mi.status).toBe(200);
    expect(Array.isArray(mi.body)).toBe(true);
  });

  it('level distribution has both modes, no zero rows', async () => {
    const r = await request(app).get('/api/v1/characters/stats/level-distribution?gameMode=hardcore');
    expect(r.body.softcore).toEqual([{ level: 85, count: 1 }, { level: 89, count: 2 }]);
    expect(r.body.hardcore).toEqual([{ level: 90, count: 1 }]);
  });

  it('serves a repeated request from cache', async () => {
    const url = '/api/v1/characters/stats/skill-usage?minLevel=81&gameMode=softcore';
    await request(app).get(url);
    const spy = vi.spyOn(pool, 'query');
    const r = await request(app).get('/api/v1/characters/stats/skill-usage?gameMode=softcore&minLevel=81');
    expect(r.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    await request(app).get('/api/v1/characters?minLevel=82');
    const calls = spy.mock.calls.length;
    await request(app).get('/api/v1/characters?minLevel=82');
    await request(app).get('/api/v1/characters/accounts/mc-meeks');
    const calls2 = spy.mock.calls.length;
    await request(app).get('/api/v1/characters/accounts/mc-meeks');
    expect(spy.mock.calls.length).toBe(calls2);
    expect(calls2).toBe(calls + 1);
    spy.mockRestore();
  });

  it('ignores unknown query params for the cache key', async () => {
    await request(app).get('/api/v1/characters/stats/item-usage?minLevel=83');
    const spy = vi.spyOn(pool, 'query');
    const r = await request(app).get('/api/v1/characters/stats/item-usage?minLevel=83&_=x');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('accounts, queue, health', () => {
  it('account lookup is case-insensitive; unknown is empty', async () => {
    const r = await request(app).get('/api/v1/characters/accounts/mc-meeks');
    expect(r.body.total).toBe(1);
    expect(r.body.characters[0].accountName).toBe('MC-MEEKS');
    const u = await request(app).get('/api/v1/characters/accounts/nobody');
    expect(u.body).toEqual({ characters: [], total: 0 });
  });

  it('queue validates and rate limits per ip', async () => {
    const bad = await request(app).post('/api/v1/accounts/queue').send({ accountName: 'a b' });
    expect(bad.status).toBe(400);
    for (let i = 0; i < 5; i++) {
      const ok = await request(app).post('/api/v1/accounts/queue').send({ accountName: `acct${i}` });
      expect(ok.status).toBe(200);
    }
    const limited = await request(app).post('/api/v1/accounts/queue').send({ accountName: 'acct6' });
    expect(limited.status).toBe(429);
    expect((await pool.query('select count(*)::int n from priority_accounts')).rows[0].n).toBe(5);
  });

  it('health and stats', async () => {
    expect((await request(app).get('/api/v1/health')).body).toEqual({ status: 'ok' });
    const s = await request(app).get('/api/v1/stats');
    expect(s.body).toMatchObject({ season: SEASON, characters: { softcore: 3, hardcore: 1 } });
    expect(s.body).toHaveProperty('heartbeatAt');
    expect(s.body).toHaveProperty('collector');
  });
});
