import type { Pool } from 'pg';
import { readRaw } from '../db/characters-repo';
import { filterCte } from './filter-sql';
import type { CharacterFilter } from './filters';

export const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'] as const;

export type ItemUsageRow = { item: string; itemType: string; numOccurrences: number; totalSample: number; pct: number };
export type SkillUsageRow = { name: string; numOccurrences: number; totalSample: number; pct: number };
export type MercTypeUsageRow = { mercType: string; numOccurrences: number; totalSample: number; pct: number };

const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);

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
      `${sql} select c.raw from characters c join filtered on filtered.id = c.id
       order by c.level desc, c.id desc limit $${n + 1} offset $${n + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    pool.query(
      `${sql} select c.class, count(*)::int as n from characters c join filtered on filtered.id = c.id group by c.class`,
      params,
    ),
  ]);
  const breakdown: Record<string, number> = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  let total = 0;
  for (const r of counts.rows) {
    total += r.n;
    if (r.class in breakdown) breakdown[r.class] = r.n;
  }
  breakdown.total = total;
  return { total, characters: rows.rows.map((r) => readRaw(r)), breakdown };
}

export async function charactersByAccount(
  pool: Pool,
  season: number,
  account: string,
): Promise<{ characters: unknown[]; total: number }> {
  const r = await pool.query(
    `select raw from characters where season = $1 and lower(account) = lower($2) order by level desc, id desc`,
    [season, account],
  );
  return { characters: r.rows.map((x) => readRaw(x)), total: r.rows.length };
}

async function itemUsageFor(pool: Pool, f: CharacterFilter, owner: 'player' | 'merc'): Promise<ItemUsageRow[]> {
  const { sql, params } = filterCte(f);
  const r = await pool.query(
    `${sql}
     select i.name as item,
            case when i.is_runeword then 'Runeword' else i.quality end as item_type,
            count(distinct i.character_id)::int as n,
            (select count(*) from filtered)::int as total
     from character_items i join filtered on filtered.id = i.character_id
     where i.owner = $${params.length + 1} and (i.is_runeword or i.quality in ('Unique','Set'))
     group by i.name, item_type
     order by n desc, i.name`,
    [...params, owner],
  );
  return r.rows.map((x) => ({
    item: x.item,
    itemType: x.item_type,
    numOccurrences: x.n,
    totalSample: x.total,
    pct: pct(x.n, x.total),
  }));
}

export const itemUsage = (pool: Pool, f: CharacterFilter) => itemUsageFor(pool, f, 'player');
export const mercItemUsage = (pool: Pool, f: CharacterFilter) => itemUsageFor(pool, f, 'merc');

export async function skillUsage(pool: Pool, f: CharacterFilter): Promise<SkillUsageRow[]> {
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
    const { sql, params } = filterCte({ ...f, mode });
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
