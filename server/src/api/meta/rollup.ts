import type { Pool } from 'pg';
import { ALL_LEVELS } from '../../db/meta-rollup';
import type { CharacterFilter } from '../filters';

/** Rows of meta_rollup that make up a cohort: `where` selects them, params are bound from $1. */
export type RollupScope = { where: string; params: unknown[] };

/**
 * The meta_rollup scope of a cohort, or null when the cohort needs the per-character queries:
 * any skill, item, merc or gear filter (the rollup has no per-character keys), or a rollup that
 * is not built yet (see meta_rollup_status). When the level window covers every level stored for
 * the cohort's classes, the scope reads the ALL_LEVELS rows, else the per-level rows.
 */
export async function rollupScope(pool: Pool, f: CharacterFilter): Promise<RollupScope | null> {
  if (f.skills.length || f.items.length || f.mercTypes.length || f.mercItems.length || f.maxGearHr !== null) return null;
  const base: unknown[] = [f.season, f.mode];
  let cls = '';
  if (f.classes.length) {
    base.push(f.classes);
    cls = ` and r.class = any($${base.length}::text[])`;
  }
  const r = await pool.query(
    `select (select ready from meta_rollup_status where id = 1) as ready, min(r.level) as lo, max(r.level) as hi
     from meta_rollup r
     where r.season = $1 and r.mode = $2${cls} and r.kind = 'core' and r.k1 = 'strength' and r.level <> ${ALL_LEVELS}`,
    base,
  );
  const row = r.rows[0];
  if (row?.ready !== true) return null;
  const covered = row.lo === null || (f.minLevel <= Number(row.lo) && f.maxLevel >= Number(row.hi));
  if (covered) return { where: `r.season = $1 and r.mode = $2${cls} and r.level = ${ALL_LEVELS}`, params: base };
  const params = [...base, f.minLevel, f.maxLevel];
  return { where: `r.season = $1 and r.mode = $2${cls} and r.level between $${base.length + 1} and $${base.length + 2} and r.level <> ${ALL_LEVELS}`, params };
}

/** SQL expression for the cohort's character count (core facts carry n = 1 per character). */
export function rollupPoolSizeSql(where: string): string {
  return `(select coalesce(sum(r.n), 0) from meta_rollup r where ${where} and r.kind = 'core' and r.k1 = 'strength')::int`;
}
