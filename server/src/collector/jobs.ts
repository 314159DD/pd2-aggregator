import type { Pool } from 'pg';
import type { Config } from '../config';
import { snapshotBuildShare } from '../db/build-share-repo';
import { computeItemPrices, recomputeGearValues } from '../db/prices-repo';

/** Hourly: reprice items from our own listings, then refresh gear values of the current season. */
export async function runPriceJob(
  deps: { pool: Pool; cfg: Pick<Config, 'currentSeason'> },
  now: Date = new Date(),
): Promise<{ priced: number; charactersChanged: number }> {
  const { priced } = await computeItemPrices(deps.pool, now);
  const charactersChanged = await recomputeGearValues(deps.pool, { season: deps.cfg.currentSeason });
  return { priced, charactersChanged };
}

/** Daily snapshot of level 80+ build share (UTC day); rerunning on the same day overwrites. */
export async function runBuildShareJob(deps: { pool: Pool; cfg: Pick<Config, 'currentSeason'> }, now: Date = new Date()): Promise<number> {
  return snapshotBuildShare(deps.pool, deps.cfg.currentSeason, now.toISOString().slice(0, 10));
}
