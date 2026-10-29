import { Pool } from 'pg';
import { rebuildMetaRollup } from '../db/meta-rollup';

/**
 * Rebuilds meta_rollup from every stored character and marks it ready (migration 005 leaves it
 * not ready on a populated database, and /meta uses the per-character queries until then).
 * Idempotent; serialises with the collector through the rollup advisory lock.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });
  try {
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
