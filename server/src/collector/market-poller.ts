import type { Pool } from 'pg';
import { toListingRow } from '../core/price';
import { markGone, upsertListings } from '../db/market-repo';
import type { Pd2Client } from '../upstream/pd2-client';

export const PAGE_SIZE = 250;
/** Pages overlap so items pushed down by new bumps mid-sweep are still seen. */
const PAGE_OVERLAP = 10;

/** Newest-bumped page only. Returns rows upserted. */
export async function pollIncremental(pool: Pool, client: Pd2Client, now = new Date()): Promise<number> {
  const page = await client.listings({ limit: PAGE_SIZE, skip: 0, sortBumpedDesc: true });
  await upsertListings(pool, page.data.map(toListingRow), now);
  return page.data.length;
}

/**
 * Walks every page, then marks unseen listings gone. If `shouldStop` fires or a request
 * throws, the sweep is abandoned without markGone (a partial sweep would mark live rows gone).
 * Returns false when interrupted.
 */
export async function fullSweep(
  pool: Pool,
  client: Pd2Client,
  shouldStop: () => Promise<boolean> | boolean,
): Promise<boolean> {
  const sweepStart = new Date();
  let skip = 0;
  let total = Infinity;
  while (skip < total) {
    if (await shouldStop()) return false;
    const page = await client.listings({ limit: PAGE_SIZE, skip, sortBumpedDesc: true });
    total = page.total;
    // An empty page before skip reaches total means the listing ended early: abandon the sweep.
    if (!page.data.length && skip < total) return false;
    await upsertListings(pool, page.data.map(toListingRow), new Date());
    skip += PAGE_SIZE - PAGE_OVERLAP;
  }
  await markGone(pool, sweepStart);
  return true;
}
