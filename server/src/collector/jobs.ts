import type { Pool } from 'pg';
import type { Config } from '../config';
import { computeItemPrices, recomputeGearValues } from '../db/prices-repo';

/** Hourly: reprice items from our own listings, then refresh gear values of the current season. */
export async function runPriceJob(
  deps: { pool: Pool; cfg: Pick<Config, 'currentSeason'> },
  now: Date = new Date(),
): Promise<{ priced: number; characters: number }> {
  const { priced } = await computeItemPrices(deps.pool, now);
  const characters = await recomputeGearValues(deps.pool, { season: deps.cfg.currentSeason });
  return { priced, characters };
}
