import { Pool } from 'pg';
import { rebuildMetaRollup } from '../db/meta-rollup';

/**
 * Rebuilds meta_rollup from every stored character and marks it ready with the current fact
 * fingerprint (migration 005 leaves it not ready on a populated database, and /meta uses the
 * per-character queries until then). Idempotent.
 *
 * The rebuild holds the rollup lock for its whole transaction; collector upserts would wait on it
 * and hit their 15 s statement timeout. So it refuses to run unless the collector is paused
 * (collector_control.paused) or --force is given.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const force = process.argv.includes('--force');
  const pool = new Pool({ connectionString: url });
  try {
    const paused = (await pool.query('select paused from collector_control where id = 1')).rows[0]?.paused === true;
    if (!paused && !force) {
      console.error(
        'backfill-meta: the collector is not paused. Pause it first ' +
          '(update collector_control set paused = true), or pass --force to run anyway.',
      );
      process.exitCode = 2;
      return;
    }
    const t0 = Date.now();
    const n = await rebuildMetaRollup(pool);
    console.log(`meta rollup rebuilt from ${n} characters in ${Date.now() - t0} ms`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
