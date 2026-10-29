import type { Pool, PoolClient } from 'pg';
import { RUNE_ITEM_NAMES } from '../core/static-data';

export const PRICE_WINDOW_DAYS = 7;
export const MIN_SOLD_SAMPLES = 5;
export const MIN_SAMPLES = 3;

export type PriceRow = {
  itemType: 'Unique' | 'Set' | 'Runeword' | 'Rune';
  name: string;
  medianHr: number;
  samples: number;
  source: 'sold' | 'ask';
};

/** Rebuilds item_prices from market_listings in one transaction (delete all, insert the new set). */
export async function computeItemPrices(pool: Pool, now: Date = new Date()): Promise<{ priced: number }> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('begin');
    await client.query('delete from item_prices');
    const r = await client.query(
      `with base as (
         select is_hardcore,
                case when runeword_key is not null then 'Runeword'
                     when base_name = any($5::text[]) and coalesce(quality,'') not in ('Unique','Set') then 'Rune'
                     else quality end as item_type,
                case when runeword_key is null and base_name = any($5::text[])
                          and coalesce(quality,'') not in ('Unique','Set') then base_name
                     else item_name end as item_name, price_hr,
                (gone_at is not null and miss_count >= 2
                  and gone_at >= $1::timestamptz - make_interval(days => $2)) as sold,
                (gone_at is null and last_seen_at >= $1::timestamptz - make_interval(days => $2)) as open
         from market_listings
         where is_ladder and not is_corrupted and price_hr is not null
       ), agg as (
         select is_hardcore, item_type, item_name,
                count(*) filter (where sold) as sold_n,
                count(*) filter (where open) as open_n,
                percentile_cont(0.5) within group (order by price_hr) filter (where sold) as sold_med,
                percentile_cont(0.5) within group (order by price_hr) filter (where open) as open_med
         from base
         where item_name is not null and item_type in ('Unique','Set','Runeword','Rune')
         group by is_hardcore, item_type, item_name
       )
       insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
       select case when is_hardcore then 'hardcore' else 'softcore' end, item_type, item_name,
              round((case when sold_n >= $3 then sold_med else open_med end)::numeric, 2),
              case when sold_n >= $3 then sold_n else open_n end,
              case when sold_n >= $3 then 'sold' else 'ask' end,
              $1
       from agg
       where sold_n >= $3 or open_n >= $4`,
      [now, PRICE_WINDOW_DAYS, MIN_SOLD_SAMPLES, MIN_SAMPLES, RUNE_ITEM_NAMES],
    );
    if ((r.rowCount ?? 0) === 0) {
      // Nothing to price (e.g. market data wiped): roll back the delete and keep the old set.
      await client.query('rollback');
      console.warn('computeItemPrices: new price set is empty, keeping existing item_prices');
      return { priced: 0 };
    }
    await client.query('commit');
    return { priced: r.rowCount ?? 0 };
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
}

export const GEAR_BATCH_IDS = 5000;

/**
 * Recomputes gear value columns for the characters in scope from current item_prices.
 * Season scope runs in id-range batches (one short statement each). Only rows whose values
 * change are written; returns the number of changed rows.
 */
export async function recomputeGearValues(
  db: Pool | PoolClient,
  scope: { season: number } | { characterIds: number[] },
): Promise<number> {
  const run = async (where: string, params: unknown[]): Promise<number> => {
    const r = await db.query(
      `with t as (
         select c.id, c.mode from characters c where ${where}
       ), w as (
         select t.id, i.owner, p.median_hr
         from t
         join character_items i on i.character_id = t.id
         left join item_prices p on p.mode = t.mode and p.item_name = i.name
           and p.item_type = case when i.is_runeword then 'Runeword' else i.quality end
         where (i.is_runeword or i.quality in ('Unique','Set'))
           and (i.slot is not null or i.is_charm)
       ), a as (
         select id,
                coalesce(sum(median_hr) filter (where owner = 'player'), 0) as v,
                coalesce(bool_or(median_hr is null) filter (where owner = 'player'), false) as partial,
                case when count(*) filter (where owner = 'merc') = 0 then null
                     else coalesce(sum(median_hr) filter (where owner = 'merc'), 0) end as mv
         from w group by id
       ), n as (
         select t.id, coalesce(a.v, 0) as v, coalesce(a.partial, false) as partial, a.mv
         from t left join a on a.id = t.id
       )
       update characters c
          set gear_value_hr = n.v, gear_value_partial = n.partial, merc_gear_value_hr = n.mv
         from n
        where n.id = c.id
          and (c.gear_value_hr, c.gear_value_partial, c.merc_gear_value_hr)
              is distinct from (n.v, n.partial, n.mv)`,
      params,
    );
    return r.rowCount ?? 0;
  };

  if ('characterIds' in scope) {
    return scope.characterIds.length ? run('c.id = any($1::bigint[])', [scope.characterIds]) : 0;
  }
  // Keyset pagination over the season's real ids: archive rows are inserted later and sit between live ids.
  let changed = 0;
  let last = 0;
  for (;;) {
    const hi = (await db.query(
      'select max(id) as hi from (select id from characters where season = $1 and id > $2 order by id limit $3) b',
      [scope.season, last, GEAR_BATCH_IDS],
    )).rows[0].hi;
    if (hi === null) break;
    changed += await run('c.season = $1 and c.id > $2 and c.id <= $3', [scope.season, last, Number(hi)]);
    last = Number(hi);
  }
  return changed;
}

export async function getPrices(
  pool: Pool,
  mode: 'softcore' | 'hardcore',
): Promise<{ computedAt: string | null; items: PriceRow[] }> {
  const r = await pool.query(
    `select item_type, item_name, median_hr, samples, source, computed_at
     from item_prices where mode = $1 order by item_type, item_name`,
    [mode],
  );
  return {
    computedAt: r.rows.length ? new Date(r.rows[0].computed_at).toISOString() : null,
    items: r.rows.map((x) => ({
      itemType: x.item_type,
      name: x.item_name,
      medianHr: Number(x.median_hr),
      samples: Number(x.samples),
      source: x.source,
    })),
  };
}

export type ItemPrice = { medianHr: number; samples: number; source: 'sold' | 'ask' };

/** Prices for the given item names in one query. Names without a price are absent from the map. */
export async function getPricesFor(
  pool: Pool,
  mode: 'softcore' | 'hardcore',
  names: string[],
): Promise<Map<string, ItemPrice>> {
  const out = new Map<string, ItemPrice>();
  if (!names.length) return out;
  const r = await pool.query(
    `select item_name, median_hr, samples, source from item_prices
     where mode = $1 and item_type in ('Unique','Set','Runeword') and item_name = any($2::text[])
     order by samples desc`,
    [mode, names],
  );
  for (const x of r.rows) {
    if (out.has(x.item_name)) continue;
    out.set(x.item_name, { medianHr: Number(x.median_hr), samples: Number(x.samples), source: x.source });
  }
  return out;
}

/** Rune prices keyed by short rune name ('Ber'), value median_hr. */
export async function getRunePrices(pool: Pool, mode: 'softcore' | 'hardcore'): Promise<Map<string, number>> {
  const r = await pool.query(
    "select item_name, median_hr from item_prices where mode = $1 and item_type = 'Rune'",
    [mode],
  );
  return new Map(r.rows.map((x) => [String(x.item_name).replace(/ Rune$/, ''), Number(x.median_hr)]));
}

/** Unique/Set/Runeword prices in one query, keyed `${itemType}|${name}`. */
export async function getPriceMap(pool: Pool, mode: 'softcore' | 'hardcore'): Promise<Map<string, ItemPrice>> {
  const r = await pool.query(
    `select item_type, item_name, median_hr, samples, source from item_prices
     where mode = $1 and item_type in ('Unique','Set','Runeword')`,
    [mode],
  );
  return new Map(
    r.rows.map((x) => [
      `${x.item_type}|${x.item_name}`,
      { medianHr: Number(x.median_hr), samples: Number(x.samples), source: x.source as 'sold' | 'ask' },
    ]),
  );
}
