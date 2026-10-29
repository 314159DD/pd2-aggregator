import type { Pool } from 'pg';

export type DemandItem = {
  name: string;
  openListings: number;
  openQty: number;
  goneListings: number;
  goneQty: number;
  droppedQty: number;
  medianHoursListed: number | null;
};

export type Demand = { trackingSince: string | null; days: number; items: DemandItem[] };

/**
 * Market absorption of bulk items (orbs). Ladder listings of one mode only.
 * gone = gone_at inside the window; dropped = quantity decreases of listings last seen inside it.
 */
export async function getDemand(
  pool: Pool,
  mode: 'softcore' | 'hardcore',
  names: string[],
  days: number,
  now: Date = new Date(),
): Promise<Demand> {
  const since = (await pool.query('select min(first_seen_at) t from market_listings')).rows[0].t as Date | null;
  const r = names.length
    ? await pool.query(
        `select n.name,
           count(l.id) filter (where l.gone_at is null)::int as open_listings,
           coalesce(sum(case when l.id is null then 0 else coalesce(l.quantity, 1) end) filter (where l.gone_at is null), 0)::int as open_qty,
           count(l.id) filter (where l.gone_at >= $3::timestamptz - make_interval(days => $4))::int as gone_listings,
           coalesce(sum(case when l.id is null then 0 else coalesce(l.quantity, 1) end) filter (where l.gone_at >= $3::timestamptz - make_interval(days => $4)), 0)::int as gone_qty,
           coalesce(sum(l.qty_dropped) filter (where l.last_seen_at >= $3::timestamptz - make_interval(days => $4)), 0)::int as dropped_qty,
           percentile_cont(0.5) within group (
             order by extract(epoch from (l.gone_at - coalesce(l.created_at, l.first_seen_at))) / 3600
           ) filter (where l.gone_at >= $3::timestamptz - make_interval(days => $4)) as median_hours
         from unnest($1::text[]) as n(name)
         left join market_listings l
           on (l.item_name = n.name or l.base_name = n.name)
          and l.is_ladder and not l.is_corrupted and l.is_hardcore = $2
          and (l.gone_at is null or l.gone_at >= $3::timestamptz - make_interval(days => $4)
               or l.last_seen_at >= $3::timestamptz - make_interval(days => $4))
         group by n.name`,
        [names, mode === 'hardcore', now, days],
      )
    : { rows: [] as any[] };
  const byName = new Map(r.rows.map((x) => [x.name as string, x]));
  return {
    trackingSince: since ? new Date(since).toISOString() : null,
    days,
    items: names.map((name) => {
      const x = byName.get(name);
      return {
        name,
        openListings: x?.open_listings ?? 0,
        openQty: x?.open_qty ?? 0,
        goneListings: x?.gone_listings ?? 0,
        goneQty: x?.gone_qty ?? 0,
        droppedQty: x?.dropped_qty ?? 0,
        medianHoursListed: x?.median_hours == null ? null : Math.round(Number(x.median_hours) * 10) / 10,
      };
    }),
  };
}
