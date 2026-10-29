import type { Pool } from 'pg';
import { readRawWithAccount } from '../db/characters-repo';
import { ALL_LEVELS } from '../db/meta-rollup';
import { filterCte } from './filter-sql';
import type { CharacterFilter } from './filters';
import { rollupPoolSizeSql, rollupScope, type RollupScope } from './meta/rollup';

export const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'] as const;

export type ItemUsageRow = { item: string; itemType: string; numOccurrences: number; totalSample: number; pct: number };
export type SkillUsageRow = { name: string; numOccurrences: number; totalSample: number; pct: number };
export type MercTypeUsageRow = { mercType: string; numOccurrences: number; totalSample: number; pct: number };

export const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);

export async function charactersPage(
  pool: Pool,
  f: CharacterFilter,
  page: number,
  pageSize: number,
): Promise<{ total: number; characters: unknown[]; breakdown: Record<string, number> }> {
  const { sql, params } = filterCte(f);
  const n = params.length;
  const [rows, counts] = await Promise.all([
    pool.query(
      `${sql} select c.raw, c.account from characters c join filtered on filtered.id = c.id
       order by c.level desc, c.id desc limit $${n + 1} offset $${n + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    classCounts(pool, f),
  ]);
  const breakdown: Record<string, number> = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  let total = 0;
  for (const r of counts) {
    total += r.n;
    if (r.class in breakdown) breakdown[r.class] = r.n;
  }
  breakdown.total = total;
  return { total, characters: rows.rows.map((r) => readRawWithAccount(r)), breakdown };
}

export async function charactersByAccount(
  pool: Pool,
  season: number,
  account: string,
): Promise<{ characters: unknown[]; total: number }> {
  const r = await pool.query(
    `select raw, account from characters where season = $1 and lower(account) = lower($2) order by level desc, id desc`,
    [season, account],
  );
  return { characters: r.rows.map((x) => readRawWithAccount(x)), total: r.rows.length };
}

/*
 * Base cohorts (no item, skill, merc or gear filter, rollup ready: see rollupScope) read the
 * per-character facts summed in meta_rollup; every other cohort runs the per-character queries
 * over `filtered`. Both paths return the same rows (test/usage-rollup.test.ts).
 */

/** Characters of the cohort per class (classes with nobody are left out). */
export async function classCounts(pool: Pool, f: CharacterFilter): Promise<Array<{ class: string; n: number }>> {
  const scope = await rollupScope(pool, f);
  if (scope) {
    const r = await pool.query(
      `select r.class, sum(r.n)::int as n from meta_rollup r
       where ${scope.where} and r.kind = 'core' and r.k1 = 'strength'
       group by r.class having sum(r.n) > 0`,
      scope.params,
    );
    return r.rows;
  }
  const { sql, params } = filterCte(f);
  const r = await pool.query(
    `${sql} select c.class, count(*)::int as n from characters c join filtered on filtered.id = c.id group by c.class`,
    params,
  );
  return r.rows;
}

/** Characters per value of a one-per-character fact kind ('merc', 'skill20'), with the cohort size. */
async function countPerKey(pool: Pool, scope: RollupScope, kind: string) {
  const r = await pool.query(
    `select r.k1 as name, sum(r.n)::int as n, ${rollupPoolSizeSql(scope.where)} as total
     from meta_rollup r where ${scope.where} and r.kind = $${scope.params.length + 1}
     group by r.k1 having sum(r.n) > 0 order by n desc, r.k1`,
    [...scope.params, kind],
  );
  return r.rows.map((x) => ({ name: String(x.name), n: Number(x.n), total: Number(x.total) }));
}

/** Unique, Set and Runeword usage per item, plus the lowest inventory code among the copies. */
export async function itemUsageRows(
  pool: Pool,
  f: CharacterFilter,
  owner: 'player' | 'merc',
): Promise<Array<ItemUsageRow & { invCode: string | null }>> {
  const scope = await rollupScope(pool, f);
  let rows: Array<{ item: string; item_type: string; n: number; inv_code: string | null; total: number }>;
  if (scope) {
    // item_<owner> facts: one per character and item, k3 = that character's min inv code.
    const r = await pool.query(
      `select r.k1 as item, r.k2 as item_type, sum(r.n)::int as n, min(r.k3) as inv_code,
              ${rollupPoolSizeSql(scope.where)} as total
       from meta_rollup r where ${scope.where} and r.kind = $${scope.params.length + 1}
       group by r.k1, r.k2 having sum(r.n) > 0
       order by n desc, r.k1`,
      [...scope.params, `item_${owner}`],
    );
    rows = r.rows;
  } else {
    const { sql, params } = filterCte(f);
    const r = await pool.query(
      `${sql}
       select i.name as item,
              case when i.is_runeword then 'Runeword' else i.quality end as item_type,
              count(distinct i.character_id)::int as n,
              min(i.inv_code) as inv_code,
              (select count(*) from filtered)::int as total
       from character_items i join filtered on filtered.id = i.character_id
       where i.owner = $${params.length + 1} and (i.is_runeword or i.quality in ('Unique','Set'))
       group by i.name, item_type
       order by n desc, i.name`,
      [...params, owner],
    );
    rows = r.rows;
  }
  return rows.map((x) => ({
    item: x.item,
    itemType: x.item_type,
    numOccurrences: x.n,
    totalSample: x.total,
    pct: pct(x.n, x.total),
    invCode: x.inv_code ?? null,
  }));
}

async function itemUsageFor(pool: Pool, f: CharacterFilter, owner: 'player' | 'merc'): Promise<ItemUsageRow[]> {
  return (await itemUsageRows(pool, f, owner)).map(({ invCode: _invCode, ...row }) => row);
}

export const itemUsage = (pool: Pool, f: CharacterFilter) => itemUsageFor(pool, f, 'player');
export const mercItemUsage = (pool: Pool, f: CharacterFilter) => itemUsageFor(pool, f, 'merc');

export async function skillUsage(pool: Pool, f: CharacterFilter): Promise<SkillUsageRow[]> {
  const scope = await rollupScope(pool, f);
  if (scope) {
    return (await countPerKey(pool, scope, 'skill20')).map((x) => ({
      name: x.name,
      numOccurrences: x.n,
      totalSample: x.total,
      pct: pct(x.n, x.total),
    }));
  }
  const { sql, params } = filterCte(f);
  const r = await pool.query(
    `${sql}
     select s.skill as name, count(distinct s.character_id)::int as n, (select count(*) from filtered)::int as total
     from character_skills s join filtered on filtered.id = s.character_id
     where s.hard_level >= 20
     group by s.skill order by n desc, s.skill`,
    params,
  );
  return r.rows.map((x) => ({ name: x.name, numOccurrences: x.n, totalSample: x.total, pct: pct(x.n, x.total) }));
}

export async function mercTypeUsage(pool: Pool, f: CharacterFilter): Promise<MercTypeUsageRow[]> {
  const scope = await rollupScope(pool, f);
  if (scope) {
    return (await countPerKey(pool, scope, 'merc')).map((x) => ({
      mercType: x.name,
      numOccurrences: x.n,
      totalSample: x.total,
      pct: pct(x.n, x.total),
    }));
  }
  const { sql, params } = filterCte(f);
  const r = await pool.query(
    `${sql}
     select m.description as merc_type, count(distinct m.character_id)::int as n, (select count(*) from filtered)::int as total
     from character_merc m join filtered on filtered.id = m.character_id
     group by m.description order by n desc, m.description`,
    params,
  );
  return r.rows.map((x) => ({
    mercType: x.merc_type,
    numOccurrences: x.n,
    totalSample: x.total,
    pct: pct(x.n, x.total),
  }));
}

export async function levelDistribution(
  pool: Pool,
  f: CharacterFilter,
): Promise<{ hardcore: Array<{ level: number; count: number }>; softcore: Array<{ level: number; count: number }> }> {
  const one = async (mode: 'softcore' | 'hardcore') => {
    const g = { ...f, mode };
    if (await rollupScope(pool, g)) {
      // per-level core facts: one per character
      const params: unknown[] = [g.season, g.mode, g.minLevel, g.maxLevel];
      if (g.classes.length) params.push(g.classes);
      const r = await pool.query(
        `select r.level, sum(r.n)::int as n from meta_rollup r
         where r.season = $1 and r.mode = $2${g.classes.length ? ' and r.class = any($5::text[])' : ''}
           and r.level between $3 and $4 and r.level <> ${ALL_LEVELS} and r.kind = 'core' and r.k1 = 'strength'
         group by r.level having sum(r.n) > 0 order by r.level`,
        params,
      );
      return r.rows.map((x) => ({ level: x.level as number, count: x.n as number }));
    }
    const { sql, params } = filterCte(g);
    const r = await pool.query(
      `${sql} select c.level, count(*)::int as n from characters c join filtered on filtered.id = c.id
       group by c.level order by c.level`,
      params,
    );
    return r.rows.map((x) => ({ level: x.level as number, count: x.n as number }));
  };
  const [hardcore, softcore] = await Promise.all([one('hardcore'), one('softcore')]);
  return { hardcore, softcore };
}

/** Characters of a season and mode at level 80 or higher, any class and filter. */
export async function seasonTotal(pool: Pool, season: number, mode: 'softcore' | 'hardcore'): Promise<number> {
  const base: CharacterFilter = {
    season, mode, minLevel: 80, maxLevel: 99, classes: [], items: [], skills: [], mercTypes: [], mercItems: [], maxGearHr: null,
  };
  const scope = await rollupScope(pool, base);
  const r = scope
    ? await pool.query(
        `select coalesce(sum(r.n), 0)::int as n from meta_rollup r
         where r.season = $1 and r.mode = $2 and r.level >= 80 and r.kind = 'core' and r.k1 = 'strength'`,
        [season, mode],
      )
    : await pool.query(`select count(*)::int as n from characters where season = $1 and mode = $2 and level >= 80`, [season, mode]);
  return r.rows[0].n;
}

export async function health(pool: Pool): Promise<void> {
  await pool.query('select 1');
}

export async function siteStats(pool: Pool, season: number) {
  const [counts, status] = await Promise.all([
    pool.query(`select mode, count(*)::int as n from characters where season = $1 group by mode`, [season]),
    pool.query('select heartbeat_at, stats from collector_status where id = 1'),
  ]);
  const by: Record<string, number> = { softcore: 0, hardcore: 0 };
  for (const r of counts.rows) by[r.mode] = r.n;
  const s = status.rows[0];
  return {
    season,
    characters: { softcore: by.softcore, hardcore: by.hardcore },
    collector: s?.stats ?? {},
    heartbeatAt: s?.heartbeat_at ? new Date(s.heartbeat_at).toISOString() : null,
  };
}
