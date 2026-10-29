import { Pool } from 'pg';
import { toCompact } from '../core/compact';
import { readRaw, replaceItems } from '../db/characters-repo';
import { withMetaRollup } from '../db/meta-rollup';
import type { CharacterApiResponse } from '../core/vendor/types';

/**
 * Rewrites character_items from stored raw for one season and keeps meta_rollup in step. Leaves last_ingested_at and history alone.
 * Each row is locked (serialises with upsertCharacter) and guarded by a savepoint, so a bad row is
 * logged and skipped instead of aborting the run. Returns the number of characters backfilled.
 */
export async function backfillItems(pool: Pool, season: number, batchSize = 200): Promise<number> {
  let lastId = 0;
  let count = 0;
  let skipped = 0;
  for (;;) {
    const ids = (
      await pool.query('select id from characters where season = $1 and id > $2 order by id limit $3', [
        season,
        lastId,
        batchSize,
      ])
    ).rows.map((r) => Number(r.id));
    if (!ids.length) break;
    const client = await pool.connect();
    let destroy = false;
    try {
      await client.query('begin');
      for (const id of ids) {
        await client.query('savepoint row_sp');
        try {
          const locked = await client.query('select raw from characters where id = $1 for update', [id]);
          if (!locked.rows.length) {
            await client.query('release savepoint row_sp');
            continue;
          }
          const c = toCompact(readRaw(locked.rows[0]) as CharacterApiResponse);
          await withMetaRollup(client, id, async () => {
            await replaceItems(client, id, c.items);
            return id;
          });
          await client.query('release savepoint row_sp');
          count++;
        } catch (e) {
          await client.query('rollback to savepoint row_sp');
          skipped++;
          console.error(`backfill-items: skipped character ${id}: ${(e as Error).message}`);
        }
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
    lastId = ids[ids.length - 1];
  }
  if (skipped) console.error(`backfill-items: ${skipped} characters skipped`);
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
