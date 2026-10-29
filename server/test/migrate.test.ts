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
    expect(m.rows.map((x) => x.name)).toEqual(['001_init.sql', '002_market_miss_count.sql', '003_builds.sql', '004_rune_prices.sql', '005_meta_rollup.sql', '006_archive_import.sql', '007_archive_import_dupes.sql', '008_usage_indexes.sql']);
    const t = await pool.query(
      "select table_name from information_schema.tables where table_name in ('item_prices','build_share_daily')",
    );
    expect(t.rows.map((x) => x.table_name).sort()).toEqual(['build_share_daily', 'item_prices']);
    const col = await pool.query(
      "select 1 from information_schema.columns where table_name = 'characters' and column_name = 'gear_value_hr'",
    );
    expect(col.rowCount).toBe(1);
  });

  it('handles concurrent migrate calls on a fresh schema', async () => {
    await pool.query('drop schema public cascade');
    await pool.query('create schema public');
    const [a, b] = await Promise.all([migrate(pool), migrate(pool)]);
    expect([...a, ...b]).toEqual(['001_init.sql', '002_market_miss_count.sql', '003_builds.sql', '004_rune_prices.sql', '005_meta_rollup.sql', '006_archive_import.sql', '007_archive_import_dupes.sql', '008_usage_indexes.sql']);
    const m = await pool.query('select name from schema_migrations');
    expect(m.rows.map((x) => x.name)).toEqual(['001_init.sql', '002_market_miss_count.sql', '003_builds.sql', '004_rune_prices.sql', '005_meta_rollup.sql', '006_archive_import.sql', '007_archive_import_dupes.sql', '008_usage_indexes.sql']);
  });

  it('item_prices accepts Rune and rejects unknown types', async () => {
    const ins = (t: string) => pool.query(
      "insert into item_prices (mode,item_type,item_name,median_hr,samples,source,computed_at) values ('softcore',$1,'x',1,3,'ask',now())", [t]);
    await ins('Rune');
    await expect(ins('Bogus')).rejects.toThrow();
  });

  it('archive_import_progress exists and its key is unique', async () => {
    const ins = () => pool.query("insert into archive_import_progress (season, mode, pass) values (13, 'softcore', 1)");
    await ins();
    await expect(ins()).rejects.toThrow();
  });
});
