import { Pool } from 'pg';
import { toCompact } from '../core/compact';
import { readRaw, replaceItems } from '../db/characters-repo';
import type { CharacterApiResponse } from '../core/vendor/types';

/** Rewrites character_items from stored raw for one season. Leaves last_ingested_at and history alone. */
export async function backfillItems(pool: Pool, season: number, batchSize = 200): Promise<number> {
  let lastId = 0;
  let count = 0;
  for (;;) {
    const rows = (
      await pool.query(
        'select id, raw, account from characters where season = $1 and id > $2 order by id limit $3',
        [season, lastId, batchSize],
      )
    ).rows;
    if (!rows.length) break;
    const client = await pool.connect();
    let destroy = false;
    try {
      await client.query('begin');
      for (const row of rows) {
        const c = toCompact(readRaw(row) as CharacterApiResponse);
        await replaceItems(client, Number(row.id), c.items);
        count++;
      }
      await client.query('commit');
    } catch (e) {
      try {
        await client.query('rollback');
      } catch {
        destroy = true;
      }
      throw e;
    } finally {
      client.release(destroy);
    }
    lastId = Number(rows[rows.length - 1].id);
  }
  return count;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const season = Number(process.env.CURRENT_SEASON ?? 14);
  const pool = new Pool({ connectionString: url });
  try {
    const n = await backfillItems(pool, season);
    console.log(`backfilled items for ${n} characters (season ${season})`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
