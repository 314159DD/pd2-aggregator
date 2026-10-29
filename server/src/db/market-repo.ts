import type { Pool } from 'pg';
import type { MarketListingRow } from '../core/price';

/** One statement per page. Sets last_seen_at = now and clears gone_at; first_seen_at is kept. */
export async function upsertListings(pool: Pool, rows: MarketListingRow[], now: Date): Promise<void> {
  // A page can contain the same id twice if it shifts mid-request; ON CONFLICT cannot hit a row twice.
  const byId = new Map<string, MarketListingRow>();
  for (const r of rows) byId.set(r.id, r);
  const u = [...byId.values()];
  if (!u.length) return;
  const col = <K extends keyof MarketListingRow>(k: K) => u.map((r) => r[k]);
  await pool.query(
    `insert into market_listings
       (id, item_name, quality, base_name, runeword_key, is_corrupted, is_ladder, is_hardcore,
        price_text, price_hr, created_at, bumped_at, first_seen_at, last_seen_at, gone_at)
     select id, item_name, quality, base_name, runeword_key, is_corrupted, is_ladder, is_hardcore,
            price_text, price_hr, created_at, bumped_at, $12::timestamptz, $12::timestamptz, null
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bool[], $7::bool[], $8::bool[],
                 $9::text[], $10::numeric[], $11::timestamptz[], $13::timestamptz[])
       as t(id, item_name, quality, base_name, runeword_key, is_corrupted, is_ladder, is_hardcore,
            price_text, price_hr, created_at, bumped_at)
     on conflict (id) do update set
       item_name = excluded.item_name, quality = excluded.quality, base_name = excluded.base_name,
       runeword_key = excluded.runeword_key, is_corrupted = excluded.is_corrupted,
       is_ladder = excluded.is_ladder, is_hardcore = excluded.is_hardcore,
       price_text = excluded.price_text, price_hr = excluded.price_hr,
       created_at = excluded.created_at, bumped_at = excluded.bumped_at,
       last_seen_at = excluded.last_seen_at, gone_at = null, miss_count = 0`,
    [
      col('id'), col('item_name'), col('quality'), col('base_name'), col('runeword_key'),
      col('is_corrupted'), col('is_ladder'), col('is_hardcore'), col('price_text'), col('price_hr'),
      col('created_at'), now, col('bumped_at'),
    ],
  );
}

/**
 * Call after a completed full sweep. Live listings not seen since the sweep started get
 * miss_count + 1; only a second consecutive miss sets gone_at (guards against pagination drift).
 * Returns the number marked gone.
 */
export async function markGone(pool: Pool, sweepStartedAt: Date): Promise<number> {
  const r = await pool.query(
    `update market_listings
       set miss_count = miss_count + 1,
           gone_at = case when miss_count + 1 >= 2 then now() else null end
     where gone_at is null and last_seen_at < $1
     returning gone_at`,
    [sweepStartedAt],
  );
  return r.rows.filter((row) => row.gone_at !== null).length;
}
