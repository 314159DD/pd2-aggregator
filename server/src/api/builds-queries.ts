import type { Pool } from 'pg';
import { SEASON_NAMES, type Config } from '../config';
import { mercTypeOf } from '../core/merc-types';
import { filterCte } from './filter-sql';
import type { CharacterFilter } from './filters';
import { CLASSES } from './queries';

export type UsageEntry = { name: string; count: number; pct: number };
export type ItemUsageEntry = UsageEntry & {
  itemType: 'Unique' | 'Set' | 'Runeword';
  invCode: string | null;
  medianHr: number | null;
};
export type MercUsageEntry = UsageEntry & { act: number | null };
export type BuildsUsage = {
  seasonTotal: number;
  total: number;
  breakdown: Record<string, number>;
  skills: UsageEntry[];
  items: ItemUsageEntry[];
  mercTypes: MercUsageEntry[];
  mercItems: ItemUsageEntry[];
};

const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
const byCountThenName = (a: { count: number; name: string }, b: { count: number; name: string }) =>
  b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

async function itemEntries(pool: Pool, f: CharacterFilter, owner: 'player' | 'merc'): Promise<Omit<ItemUsageEntry, 'pct'>[]> {
  const { sql, params } = filterCte(f);
  const n = params.length;
  const r = await pool.query(
    `${sql}
     select t.name, t.item_type, count(distinct t.character_id)::int as n, min(t.inv_code) as inv_code, p.median_hr
     from (
       select i.character_id, i.name, i.inv_code,
              case when i.is_runeword then 'Runeword' else i.quality end as item_type
       from character_items i join filtered on filtered.id = i.character_id
       where i.owner = $${n + 1} and (i.is_runeword or i.quality in ('Unique','Set'))
     ) t
     left join item_prices p on p.mode = $${n + 2} and p.item_name = t.name and p.item_type = t.item_type
     group by t.name, t.item_type, p.median_hr`,
    [...params, owner, f.mode],
  );
  return r.rows.map((x) => ({
    name: x.name as string,
    count: x.n as number,
    itemType: x.item_type as ItemUsageEntry['itemType'],
    invCode: (x.inv_code as string | null) ?? null,
    medianHr: x.median_hr === null ? null : Number(x.median_hr),
  }));
}

export async function buildsUsage(pool: Pool, f: CharacterFilter): Promise<BuildsUsage> {
  const own = filterCte(f);
  const noClass = filterCte({ ...f, classes: [] });
  const [seasonTotalR, totalR, breakdownR, skillsR, mercTypesR, playerItems, merc] = await Promise.all([
    pool.query(`select count(*)::int as n from characters where season = $1 and mode = $2 and level >= 80`, [f.season, f.mode]),
    pool.query(`${own.sql} select count(*)::int as n from filtered`, own.params),
    pool.query(
      `${noClass.sql} select c.class, count(*)::int as n from characters c join filtered on filtered.id = c.id group by c.class`,
      noClass.params,
    ),
    pool.query(
      `${own.sql} select s.skill as name, count(distinct s.character_id)::int as n
       from character_skills s join filtered on filtered.id = s.character_id
       where s.hard_level >= 20 group by s.skill`,
      own.params,
    ),
    pool.query(
      `${own.sql} select m.description, count(distinct m.character_id)::int as n
       from character_merc m join filtered on filtered.id = m.character_id group by m.description`,
      own.params,
    ),
    itemEntries(pool, f, 'player'),
    itemEntries(pool, f, 'merc'),
  ]);
  const total: number = totalR.rows[0].n;
  const withPct = <T extends { count: number }>(e: T): T & { pct: number } => ({ ...e, pct: pct(e.count, total) });

  const breakdown: Record<string, number> = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  let all = 0;
  for (const r of breakdownR.rows) {
    all += r.n;
    if (r.class in breakdown) breakdown[r.class] = r.n;
  }
  breakdown.total = all;

  const merged = new Map<string, { name: string; count: number; act: number | null }>();
  for (const r of mercTypesR.rows) {
    const t = mercTypeOf(r.description);
    const e = merged.get(t.name);
    if (e) e.count += r.n;
    else merged.set(t.name, { name: t.name, count: r.n, act: t.act });
  }

  return {
    seasonTotal: seasonTotalR.rows[0].n,
    total,
    breakdown,
    skills: skillsR.rows
      .map((x) => withPct({ name: x.name as string, count: x.n as number }))
      .sort(byCountThenName),
    items: playerItems.map(withPct).sort(byCountThenName),
    mercTypes: [...merged.values()].map(withPct).sort(byCountThenName),
    mercItems: merc.map(withPct).sort(byCountThenName),
  };
}

export type SeasonsResult = {
  current: number;
  seasons: Array<{ season: number; name: string; current: boolean; characters: { softcore: number; hardcore: number } }>;
};

export async function seasons(pool: Pool, cfg: Config): Promise<SeasonsResult> {
  const [counts, status] = await Promise.all([
    pool.query(`select season, mode, count(*)::int as n from characters group by season, mode`),
    pool.query('select stats from collector_status where id = 1'),
  ]);
  const by = new Map<number, { softcore: number; hardcore: number }>();
  by.set(cfg.currentSeason, { softcore: 0, hardcore: 0 });
  for (const r of counts.rows) {
    const e = by.get(r.season) ?? { softcore: 0, hardcore: 0 };
    if (r.mode === 'softcore' || r.mode === 'hardcore') e[r.mode as 'softcore' | 'hardcore'] = r.n;
    by.set(r.season, e);
  }
  const liveName = status.rows[0]?.stats?.seasonName;
  return {
    current: cfg.currentSeason,
    seasons: [...by.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([season, characters]) => ({
        season,
        name:
          (season === cfg.currentSeason && typeof liveName === 'string' && liveName) ||
          SEASON_NAMES[season] ||
          `Season ${season}`,
        current: season === cfg.currentSeason,
        characters,
      })),
  };
}

export type BuildShareDay = { day: string; total: number; classes: Record<string, number> };

/** Last 90 days of level 80+ class counts, oldest first. */
export async function buildShareHistory(pool: Pool, season: number, mode: 'softcore' | 'hardcore'): Promise<{ days: BuildShareDay[] }> {
  const r = await pool.query(
    `select to_char(day, 'YYYY-MM-DD') as day, class, characters
     from build_share_daily
     where season = $1 and mode = $2 and day > (select max(day) from build_share_daily where season = $1 and mode = $2) - 90
     order by day asc`,
    [season, mode],
  );
  const days = new Map<string, BuildShareDay>();
  for (const x of r.rows) {
    let d = days.get(x.day);
    if (!d) {
      d = { day: x.day, total: 0, classes: Object.fromEntries(CLASSES.map((c) => [c, 0])) };
      days.set(x.day, d);
    }
    d.classes[x.class] = x.characters;
    d.total += x.characters;
  }
  return { days: [...days.values()] };
}
