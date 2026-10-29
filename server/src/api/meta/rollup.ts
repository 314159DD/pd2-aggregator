import type { Pool } from 'pg';
import { ALL_LEVELS, META_FACTS_FINGERPRINT } from '../../db/meta-rollup';
import type { CharacterFilter } from '../filters';

/** Rows of meta_rollup that make up a cohort: `where` selects them, params are bound from $1. */
export type RollupScope = { where: string; params: unknown[] };

let staleLogged = false;

/** Scopes resolved once per metaCohort call, keyed by the filter object that call passes down. */
const resolved = new WeakMap<CharacterFilter, Promise<RollupScope | null>>();

/**
 * A copy of `f` whose rollup scope is resolved once and shared by every meta function it is
 * passed to (metaCohort). Each call gets a fresh copy, so nothing is cached across requests.
 */
export function withResolvedScope(pool: Pool, f: CharacterFilter): CharacterFilter {
  const copy = { ...f };
  resolved.set(copy, resolveScope(pool, copy));
  return copy;
}

/**
 * The meta_rollup scope of a cohort, or null when the cohort needs the per-character queries:
 * any skill, item, merc or gear filter (the rollup has no per-character keys), a rollup that is
 * not built yet, or one built by other fact code (fingerprint mismatch, see meta_rollup_status).
 * When the level window covers every level stored for the cohort's classes, the scope reads the
 * ALL_LEVELS rows, else the per-level rows.
 */
export function rollupScope(pool: Pool, f: CharacterFilter): Promise<RollupScope | null> {
  return resolved.get(f) ?? resolveScope(pool, f);
}

async function resolveScope(pool: Pool, f: CharacterFilter): Promise<RollupScope | null> {
  if (f.skills.length || f.items.length || f.mercTypes.length || f.mercItems.length || f.maxGearHr !== null) return null;
  const base: unknown[] = [f.season, f.mode];
  let cls = '';
  if (f.classes.length) {
    base.push(f.classes);
    cls = ` and r.class = any($${base.length}::text[])`;
  }
  const r = await pool.query(
    `select s.ready, s.fingerprint, l.lo, l.hi
     from meta_rollup_status s,
          (select min(r.level) as lo, max(r.level) as hi from meta_rollup r
           where r.season = $1 and r.mode = $2${cls} and r.kind = 'core' and r.k1 = 'strength' and r.level <> ${ALL_LEVELS}) l
     where s.id = 1`,
    base,
  );
  const row = r.rows[0];
  if (row?.ready !== true) return null;
  if (row.fingerprint !== null && row.fingerprint !== META_FACTS_FINGERPRINT) {
    if (!staleLogged) {
      staleLogged = true;
      console.warn(`${new Date().toISOString()} WARN meta rollup fingerprint mismatch, run backfill-meta`);
    }
    return null;
  }
  const covered = row.lo === null || (f.minLevel <= Number(row.lo) && f.maxLevel >= Number(row.hi));
  if (covered) return { where: `r.season = $1 and r.mode = $2${cls} and r.level = ${ALL_LEVELS}`, params: base };
  const params = [...base, f.minLevel, f.maxLevel];
  return {
    where: `r.season = $1 and r.mode = $2${cls} and r.level between $${base.length + 1} and $${base.length + 2} and r.level <> ${ALL_LEVELS}`,
    params,
  };
}

/** SQL expression for the cohort's character count (core facts carry n = 1 per character). */
export function rollupPoolSizeSql(where: string): string {
  return `(select coalesce(sum(r.n), 0) from meta_rollup r where ${where} and r.kind = 'core' and r.k1 = 'strength')::int`;
}
