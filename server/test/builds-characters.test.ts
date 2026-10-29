import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter } from '../src/db/characters-repo';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const SEASON = cfg.currentSeason;
const api = '/api/v1';

let pool: Pool;
let app: Express;

beforeAll(async () => {
  pool = await freshDb();
  const mk = (name: string, level: number) => {
    const raw = structuredClone(fx);
    raw.character.name = name;
    raw.character.level = level;
    return raw;
  };
  const chars: Array<[any, string]> = [
    [mk('MC-MEEKS', 90), 'Acc1'],
    [mk('LowLife', 85), 'Acc2'],
    [mk('NoGear', 82), 'Acc3'],
  ];
  for (const [raw, acct] of chars) await upsertCharacter(pool, SEASON, toCompact(raw, acct), enrichRaw(raw, acct));
  // distinct life and gear values; NoGear has null gear value
  await pool.query(`update characters set life = 2000, gear_value_hr = 5.5 where name = 'MC-MEEKS'`);
  await pool.query(`update characters set life = 1000, gear_value_hr = 1.25, gear_value_partial = true where name = 'LowLife'`);
  await pool.query(`update characters set life = 3000, gear_value_hr = null where name = 'NoGear'`);
  // a switch item to prove it is excluded from keyGear
  await pool.query(
    `insert into character_items (character_id, owner, slot, is_switch, name, quality)
     select id, 'player', 'Right Hand Switch', true, 'Switch Thing', 'Unique' from characters where name = 'MC-MEEKS'`,
  );
  // a price for one worn unique
  await pool.query(
    `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
     values ('softcore', 'Unique', 'Azurewrath', 3.5, 4, 'ask', now())`,
  );
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

const names = (r: any) => r.body.characters.map((c: any) => c.name);

describe('GET /builds/characters', () => {
  it('defaults to level desc with shape fields', async () => {
    const r = await request(app).get(`${api}/builds/characters`);
    expect(r.status).toBe(200);
    expect(names(r)).toEqual(['MC-MEEKS', 'LowLife', 'NoGear']);
    expect(r.body).toMatchObject({ total: 3, page: 1, pageSize: 25, pages: 1, sort: 'level', dir: 'desc' });
  });

  it('sorts by life asc', async () => {
    const r = await request(app).get(`${api}/builds/characters?sort=life&dir=asc`);
    expect(names(r)).toEqual(['LowLife', 'MC-MEEKS', 'NoGear']);
  });

  it('puts the null-gear character last when sorting by gear', async () => {
    for (const dir of ['asc', 'desc']) {
      const r = await request(app).get(`${api}/builds/characters?sort=gear&dir=${dir}`);
      expect(names(r)[2]).toBe('NoGear');
    }
  });

  it('cache key includes sort', async () => {
    const a = await request(app).get(`${api}/builds/characters?sort=level`);
    const b = await request(app).get(`${api}/builds/characters?sort=life`);
    expect(names(a)[0]).not.toBe(names(b)[0]);
  });

  it('whitelists sort and dir', async () => {
    const r = await request(app).get(`${api}/builds/characters?sort=name;drop&dir=up`);
    expect(r.status).toBe(200);
    expect(r.body.sort).toBe('level');
    expect(r.body.dir).toBe('desc');
    expect(names(r)).toEqual(['MC-MEEKS', 'LowLife', 'NoGear']);
  });

  it('non-numeric page is page 1; far page is empty with real total', async () => {
    const a = await request(app).get(`${api}/builds/characters?page=abc`);
    expect(a.body.page).toBe(1);
    expect(a.body.characters).toHaveLength(3);
    const b = await request(app).get(`${api}/builds/characters?page=99`);
    expect(b.status).toBe(200);
    expect(b.body.characters).toEqual([]);
    expect(b.body.total).toBe(3);
    expect(b.body.pages).toBe(1);
    expect(b.body.pageSize).toBe(25);
  });

  it('rows carry limited skills and gear without switch items; value fields', async () => {
    const r = await request(app).get(`${api}/builds/characters`);
    const row = r.body.characters[0];
    expect(row.topSkills.length).toBeGreaterThan(0);
    expect(row.topSkills.length).toBeLessThanOrEqual(3);
    expect(row.keyGear.length).toBeGreaterThan(0);
    expect(row.keyGear.length).toBeLessThanOrEqual(8);
    expect(row.keyGear.map((g: any) => g.name)).not.toContain('Switch Thing');
    expect(row.gearValueHr).toBe(5.5);
    expect(row.account).toBe('Acc1');
    expect(r.body.characters[1].gearValuePartial).toBe(true);
    expect(r.body.characters[2].gearValueHr).toBeNull();
    expect(Object.keys(row.keyGear[0]).sort()).toEqual(['baseType', 'invCode', 'itemType', 'name']);
  });

  it('a filter matching nobody gives an empty page', async () => {
    const r = await request(app).get(`${api}/builds/characters?items=NoSuchItem`);
    expect(r.body).toMatchObject({ total: 0, pages: 1, characters: [] });
  });

  it('maxGearHr is part of the cache key', async () => {
    const a = await request(app).get(`${api}/builds/characters`);
    const b = await request(app).get(`${api}/builds/characters?maxGearHr=2`);
    expect(a.body.total).toBe(3);
    expect(b.body.total).toBe(2);
  });
});

describe('GET /builds/characters/:name', () => {
  it('finds case-insensitively with merc and priced gear', async () => {
    for (const n of ['MC-MEEKS', 'mc-meeks']) {
      const r = await request(app).get(`${api}/builds/characters/${n}`);
      expect(r.status).toBe(200);
      expect(r.body.name).toBe('MC-MEEKS');
      expect(r.body.merc.type).toBe(fx.mercenary.description);
      expect(r.body.attributes).toEqual({ strength: 111, dexterity: 110, vitality: 261, energy: 15 });
      expect(r.body.skills.length).toBeLessThanOrEqual(10);
    }
    const r = await request(app).get(`${api}/builds/characters/MC-MEEKS`);
    const az = r.body.gear.find((g: any) => g.name === 'Azurewrath');
    expect(az.medianHr).toBe(3.5);
    const other = r.body.gear.find((g: any) => g.name === 'Skywarden');
    expect(other.medianHr).toBeNull();
    expect(r.body.gear[r.body.gear.length - 1].isSwitch).toBe(true);
    expect(r.body.gear.some((g: any) => g.isCharm && g.quality !== 'Unique')).toBe(false);
    expect(r.body.gear.some((g: any) => g.name === 'Hellfire Torch')).toBe(true);
  });

  it('404s for unknown names', async () => {
    const r = await request(app).get(`${api}/builds/characters/No%20Such`);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { message: 'Character not found' } });
  });
});
