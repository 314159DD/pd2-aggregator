import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter } from '../src/db/characters-repo';
import { snapshotBuildShare } from '../src/db/build-share-repo';
import { runBuildShareJob } from '../src/collector/jobs';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const SEASON = cfg.currentSeason;
const api = '/api/v1';
let pool: Pool;
let app: Express;

const add = async (name: string, level: number, hc = false) => {
  const raw = structuredClone(fx);
  raw.character.name = name;
  raw.character.level = level;
  raw.character.status.is_hardcore = hc;
  await upsertCharacter(pool, SEASON, toCompact(raw, `acct-${name}`), enrichRaw(raw, `acct-${name}`));
};
const rows = async () => Number((await pool.query('select count(*) from build_share_daily')).rows[0].count);

beforeAll(async () => {
  pool = await freshDb();
  app = createApp({ pool, cfg });
  await add('ShareOne', 85);
  await add('ShareLow', 70);
  await add('ShareHc', 90, true);
});
afterAll(async () => {
  await pool.end();
});

describe('build share snapshot', () => {
  it('writes 14 zero-filled rows, overwrites same-day reruns, adds rows for a new day', async () => {
    expect(await snapshotBuildShare(pool, SEASON, '2026-10-29')).toBe(14);
    expect(await rows()).toBe(14);
    const sum = async () =>
      Number((await pool.query("select sum(characters) s from build_share_daily where mode='softcore'")).rows[0].s);
    const before = await sum();
    await add('ShareTwo', 82);
    await snapshotBuildShare(pool, SEASON, '2026-10-29');
    expect(await rows()).toBe(14);
    expect(await sum()).toBe(before + 1);
    await runBuildShareJob({ pool, cfg }, new Date('2026-10-30T03:00:00Z'));
    expect(await rows()).toBe(28);
  });

  it('GET /builds/history returns days ascending with total = sum of classes', async () => {
    const res = await request(app).get(`${api}/builds/history?gameMode=softcore`);
    expect(res.status).toBe(200);
    expect(res.body.days.map((d: any) => d.day)).toEqual(['2026-10-29', '2026-10-30']);
    for (const d of res.body.days) {
      expect(Object.keys(d.classes)).toHaveLength(7);
      expect(d.total).toBe(Object.values(d.classes).reduce((a: number, b) => a + (b as number), 0));
    }
    expect(res.body.days[0].total).toBeGreaterThan(0);
  });

  it('unknown season returns empty days', async () => {
    const res = await request(app).get(`${api}/builds/history?season=99`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ days: [] });
  });
});
