import type { Pool, PoolClient } from 'pg';

export const PRICE_WINDOW_DAYS = 7;
export const MIN_SOLD_SAMPLES = 5;
export const MIN_SAMPLES = 3;

export type PriceRow = {
  itemType: 'Unique' | 'Set' | 'Runeword';
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
                case when runeword_key is not null then 'Runeword' else quality end as item_type,
                item_name, price_hr,
                (gone_at is not null and miss_count >= 2
                  and gone_at >= $1::timestamptz - make_interval(days => $2)) as sold,
                (gone_at is null and last_seen_at >= $1::timestamptz - make_interval(days => $2)) as open
         from market_listings
         where is_ladder and not is_corrupted and price_hr is not null and item_name is not null
       ), agg as (
         select is_hardcore, item_type, item_name,
                count(*) filter (where sold) as sold_n,
                count(*) filter (where open) as open_n,
                percentile_cont(0.5) within group (order by price_hr) filter (where sold) as sold_med,
                percentile_cont(0.5) within group (order by price_hr) filter (where open) as open_med
         from base
         where item_type in ('Unique','Set','Runeword')
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
      [now, PRICE_WINDOW_DAYS, MIN_SOLD_SAMPLES, MIN_SAMPLES],
    );
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

/** Recomputes gear value columns for the characters in scope from current item_prices. */
export async function recomputeGearValues(
  db: Pool | PoolClient,
  scope: { season: number } | { characterIds: number[] },
): Promise<number> {
  const [where, param] = 'season' in scope
    ? ['c.season = $1', scope.season]
    : ['c.id = any($1::bigint[])', scope.characterIds];
  const r = await db.query(
    `with w as (
       select c.id, i.owner, p.median_hr
       from characters c
       join character_items i on i.character_id = c.id
       left join item_prices p on p.mode = c.mode and p.item_name = i.name
         and p.item_type = case when i.is_runeword then 'Runeword' else i.quality end
       where ${where}
         and (i.is_runeword or i.quality in ('Unique','Set'))
         and (i.slot is not null or i.is_charm)
     ), a as (
       select id,
              coalesce(sum(median_hr) filter (where owner = 'player'), 0) as v,
              coalesce(bool_or(median_hr is null) filter (where owner = 'player'), false) as partial,
              case when count(*) filter (where owner = 'merc') = 0 then null
                   else coalesce(sum(median_hr) filter (where owner = 'merc'), 0) end as mv
       from w group by id
     )
     update characters c
        set gear_value_hr = coalesce(a.v, 0),
            gear_value_partial = coalesce(a.partial, false),
            merc_gear_value_hr = a.mv
       from characters c0 left join a on a.id = c0.id
      where c0.id = c.id and ${where}`,
    [param],
  );
  return r.rowCount ?? 0;
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
