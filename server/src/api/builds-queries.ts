import type { Pool } from 'pg';
import { SEASON_NAMES, type Config } from '../config';
import { mercTypeOf } from '../core/merc-types';
import { getPriceMap, type ItemPrice } from '../db/prices-repo';
import type { CharacterFilter } from './filters';
import { withResolvedScope } from './meta/rollup';
import { CLASSES, classCounts, itemUsageRows, mercTypeUsage, seasonTotal, skillUsage } from './queries';

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

/**
 * Base cohorts (no item, skill, merc or gear filter) read meta_rollup through the shared usage
 * functions of ./queries, filtered cohorts run the per-character queries. Item prices come from
 * item_prices, none for an archive season.
 */
export async function buildsUsage(pool: Pool, cohort: CharacterFilter): Promise<BuildsUsage> {
  // One rollup scope lookup per cohort, shared by every query below.
  const f = withResolvedScope(pool, cohort);
  const all = withResolvedScope(pool, { ...cohort, classes: [] });
  const [seasonTotalN, own, classes, skills, mercTypes, playerItems, mercItems, prices] = await Promise.all([
    seasonTotal(pool, f.season, f.mode),
    classCounts(pool, f),
    classCounts(pool, all),
    skillUsage(pool, f),
    mercTypeUsage(pool, f),
    itemUsageRows(pool, f, 'player'),
    itemUsageRows(pool, f, 'merc'),
    f.archive === true ? Promise.resolve(new Map<string, ItemPrice>()) : getPriceMap(pool, f.mode),
  ]);
  const total = own.reduce((sum, r) => sum + r.n, 0);
  const withPct = <T extends { count: number }>(e: T): T & { pct: number } => ({ ...e, pct: pct(e.count, total) });
  const itemEntry = (x: (typeof playerItems)[number]): Omit<ItemUsageEntry, 'pct'> => ({
    name: x.item,
    count: x.numOccurrences,
    itemType: x.itemType as ItemUsageEntry['itemType'],
    invCode: x.invCode,
    medianHr: prices.get(`${x.itemType}|${x.item}`)?.medianHr ?? null,
  });

  const breakdown: Record<string, number> = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  let everyone = 0;
  for (const r of classes) {
    everyone += r.n;
    if (r.class in breakdown) breakdown[r.class] = r.n;
  }
  breakdown.total = everyone;

  const merged = new Map<string, { name: string; count: number; act: number | null }>();
  for (const r of mercTypes) {
    const t = mercTypeOf(r.mercType);
    const e = merged.get(t.name);
    if (e) e.count += r.numOccurrences;
    else merged.set(t.name, { name: t.name, count: r.numOccurrences, act: t.act });
  }

  return {
    seasonTotal: seasonTotalN,
    total,
    breakdown,
    skills: skills.map((x) => withPct({ name: x.name, count: x.numOccurrences })).sort(byCountThenName),
    items: playerItems.map(itemEntry).map(withPct).sort(byCountThenName),
    mercTypes: [...merged.values()].map(withPct).sort(byCountThenName),
    mercItems: mercItems.map(itemEntry).map(withPct).sort(byCountThenName),
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
