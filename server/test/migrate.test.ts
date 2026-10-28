import { describe, it, expect, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { migrate } from '../src/db/migrate';

let pool: Pool;
afterAll(async () => {
  await pool?.end();
});

describe('migrate', () => {
  it('is idempotent and seeds singleton rows', async () => {
    pool = await freshDb();
    expect(await migrate(pool)).toEqual([]);
    const r = await pool.query('select count(*)::int as n from collector_control');
    expect(r.rows[0].n).toBe(1);
    const s = await pool.query('select count(*)::int as n from collector_status');
    expect(s.rows[0].n).toBe(1);
    const m = await pool.query('select name from schema_migrations');
    expect(m.rows.map((x) => x.name)).toEqual(['001_init.sql']);
  });
});
