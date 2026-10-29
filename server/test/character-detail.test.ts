import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter } from '../src/db/characters-repo';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';
import CharacterStatParser from '../src/core/vendor/character-stats';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const SEASON = cfg.currentSeason;
const api = '/api/v1';

const mockChar = (items: any[]): any => ({
  character: { name: 'T', level: 90, class: { name: 'Sorceress', id: 1 }, attributes: { strength: 1, dexterity: 2, vitality: 3, energy: 4 }, skills: [] },
  items,
});
const mockItem = (properties: string[]): any => ({
  name: 'I',
  quality: { name: 'Unique', id: 7 },
  base_item: { name: 'Base', id: 1 },
  location: { equipment: 'Body Armor', x: 0, y: 0, width: 2, height: 3 },
  properties,
  modifiers: [],
});

describe('vendored CharacterStatParser', () => {
  it('sums all-resist onto the hell-penalty baseline', () => {
    const s = new CharacterStatParser(mockChar([mockItem(['All Resistances +20%'])])).parseAndGetCharStats();
    expect([s.fireRes, s.coldRes, s.lightningRes, s.poisonRes]).toEqual([-50, -50, -50, -50]);
  });
  it('sums faster cast rate and run/walk across items', () => {
    const s = new CharacterStatParser(
      mockChar([mockItem(['20% Faster Cast Rate', '10% Faster Run/Walk']), mockItem(['10% Faster Cast Rate', '15% Faster Run/Walk'])]),
    ).parseAndGetCharStats();
    expect(s.fasterCastRate).toBe(30);
    expect(s.fasterRunWalk).toBe(25);
  });
});

let pool: Pool;
let app: Express;

beforeAll(async () => {
  pool = await freshDb();
  const raw = structuredClone(fx);
  raw.character.name = 'MC-MEEKS';
  const t1 = new Date('2026-10-01T00:00:00Z');
  const t2 = new Date('2026-10-02T00:00:00Z');
  const c1 = toCompact(raw, 'Acc1');
  await upsertCharacter(pool, SEASON, { ...c1, experience: 1000 }, enrichRaw(raw, 'Acc1'), t1);
  await upsertCharacter(pool, SEASON, { ...c1, experience: 2000 }, enrichRaw(raw, 'Acc1'), t2);
  const acct = structuredClone(fx);
  acct.character.name = 'Other';
  await upsertCharacter(pool, SEASON, toCompact(acct, 'Acc1'), enrichRaw(acct, 'Acc1'));
  const names = (await pool.query(`select distinct i.name from character_items i join characters c on c.id = i.character_id
    where c.name = 'MC-MEEKS' and (i.is_runeword or i.quality in ('Unique','Set'))`)).rows.map((r) => r.name);
  await pool.query(
    `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
     select 'softcore', 'Unique', $1, 2.5, 4, 'ask', now()`,
    [names[0]],
  );
  await pool.query(`update characters set gear_value_hr = 7.25 where name = 'MC-MEEKS'`);
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

describe('GET /characters/:name', () => {
  it('returns raw + realStats + gear + prices', async () => {
    const r = await request(app).get(`${api}/characters/MC-MEEKS`);
    expect(r.status).toBe(200);
    expect(r.body.character.name).toBe('MC-MEEKS');
    expect(typeof r.body.realStats.fireRes).toBe('number');
    expect(r.body.gear.valueHr).toBe(7.25);
    expect(r.body.season).toBe(SEASON);
    expect(r.body.mode).toBe('softcore');
    expect(typeof r.body.lastIngestedAt).toBe('string');
    const priceable = (
      await pool.query(`select distinct i.name from character_items i join characters c on c.id = i.character_id
        where c.name = 'MC-MEEKS' and (i.is_runeword or i.quality in ('Unique','Set'))`)
    ).rows.map((x) => x.name);
    expect(priceable.length).toBeGreaterThan(0);
    for (const n of priceable) expect(r.body.prices).toHaveProperty(n);
    const priced = Object.values(r.body.prices).filter((p) => p !== null) as any[];
    expect(priced).toEqual([{ medianHr: 2.5, samples: 4, source: 'ask' }]);
  });
  it('is case-insensitive and falls back to the other mode', async () => {
    const r = await request(app).get(`${api}/characters/mc-meeks?gameMode=hardcore`);
    expect(r.status).toBe(200);
    expect(r.body.character.name).toBe('MC-MEEKS');
    expect(r.body.mode).toBe('softcore');
  });
  it('404s unknown names', async () => {
    const r = await request(app).get(`${api}/characters/Nobody`);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { message: 'Character not found' } });
  });
  it('does not shadow the stats and accounts routes', async () => {
    const a = await request(app).get(`${api}/characters/stats/item-usage`);
    expect(Array.isArray(a.body)).toBe(true);
    const b = await request(app).get(`${api}/characters/accounts/Acc1`);
    expect(b.status).toBe(200);
  });
});

describe('GET /characters/:name/history', () => {
  it('returns ascending history', async () => {
    const r = await request(app).get(`${api}/characters/MC-MEEKS/history`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.history.map((h: any) => h.experience)).toEqual([1000, 2000]);
    expect(r.body.history[0].ts < r.body.history[1].ts).toBe(true);
  });
  it('404s unknown names', async () => {
    const r = await request(app).get(`${api}/characters/Nobody/history`);
    expect(r.status).toBe(404);
  });
});
