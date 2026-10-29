import type { Pool } from 'pg';
import { SKILL_PREREQS, skillRole } from '../../core/static-data';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import { rollupPoolSizeSql, rollupScope } from './rollup';
import type { SkillUsageEntry } from './types';

/**
 * Port of src/lib/aggregate/skillUsage.ts. Per character, skills with hard_level >= 1 count.
 * A skill is "prereq-only" when it sits at exactly 1 point and another skill of the same
 * character at more than 1 point lists it in its prereqs. Prereq pairs come from the class
 * map and are passed as arrays. Returns null for an unknown class, [] for an empty pool.
 */
export async function skillUsage(
  pool: Pool,
  f: CharacterFilter,
  className: string,
  topN = 16,
): Promise<SkillUsageEntry[] | null> {
  const classMap = Object.prototype.hasOwnProperty.call(SKILL_PREREQS, className) ? SKILL_PREREQS[className] : undefined;
  if (!classMap) return null;
  // The rollup flags prereq-only skills with each character's own class map, so it answers
  // exactly when the cohort is that one class.
  const scope = f.classes.length === 1 && f.classes[0] === className ? await rollupScope(pool, f) : null;
  const rows = scope ? await usageRowsRollup(pool, scope.where, scope.params) : await usageRowsScan(pool, f, classMap);
  if (rows.length === 0) return [];
  const out: SkillUsageEntry[] = rows.map((x) => {
    const withAny = Number(x.with_any);
    const asBuild = Number(x.as_build);
    const atTwenty = Number(x.at_twenty);
    const total = Number(x.total);
    const name = String(x.skill);
    return {
      name,
      numWithAny: withAny,
      numAsBuild: asBuild,
      numAsPrereq: Number(x.as_prereq),
      numAtTwenty: atTwenty,
      avgBaseLevel: withAny > 0 ? Number(x.sum_all) / withAny : 0,
      avgBaseLevelAsBuild: asBuild > 0 ? Number(x.sum_build) / asBuild : 0,
      totalSample: total,
      pctBuild: total > 0 ? asBuild / total : 0,
      pctAny: total > 0 ? withAny / total : 0,
      pctAtTwenty: total > 0 ? atTwenty / total : 0,
      role: skillRole(className, name),
    };
  });
  out.sort((a, b) => b.pctBuild - a.pctBuild || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out.slice(0, topN);
}

type UsageRow = {
  skill: string; with_any: number; as_build: number; as_prereq: number; at_twenty: number;
  sum_all: number; sum_build: number; total: number;
};

/** Base single-class cohorts: kind 'skilluse' facts (k2 build|prereq, val hard_level) from meta_rollup. */
async function usageRowsRollup(pool: Pool, where: string, params: unknown[]): Promise<UsageRow[]> {
  const r = await pool.query(
    `select r.k1 as skill, sum(r.n)::int as with_any,
            (coalesce(sum(r.n) filter (where r.k2 = 'build'), 0))::int as as_build,
            (coalesce(sum(r.n) filter (where r.k2 = 'prereq'), 0))::int as as_prereq,
            (coalesce(sum(r.n) filter (where r.val >= 20), 0))::int as at_twenty,
            sum(r.val * r.n)::float8 as sum_all,
            (coalesce(sum(r.val * r.n) filter (where r.k2 = 'build'), 0))::float8 as sum_build,
            ${rollupPoolSizeSql(where)} as total
     from meta_rollup r where ${where} and r.kind = 'skilluse'
     group by r.k1`,
    params,
  );
  return r.rows;
}

async function usageRowsScan(
  pool: Pool,
  f: CharacterFilter,
  classMap: Record<string, { prereqs: string[] }>,
): Promise<UsageRow[]> {
  const skills: string[] = [];
  const prereqs: string[] = [];
  for (const [skill, def] of Object.entries(classMap)) {
    for (const p of def.prereqs) {
      skills.push(skill);
      prereqs.push(p);
    }
  }
  const { sql, params } = filterCte(f);
  const n = params.length;
  const r = await pool.query(
    `${sql}
     , cs as (
       select s.character_id, s.skill, s.hard_level
       from character_skills s join filtered on filtered.id = s.character_id
       where s.hard_level >= 1
     ), pr as (
       select * from unnest($${n + 1}::text[], $${n + 2}::text[]) as pr(skill, prereq)
     ), hits as materialized (
       select distinct b.character_id, pr.prereq as skill
       from cs b join pr on pr.skill = b.skill
       where b.hard_level > 1 and b.skill <> pr.prereq
     ), flagged as (
       select a.skill, a.hard_level, (a.hard_level = 1 and h.character_id is not null) as prereq_only
       from cs a left join hits h on h.character_id = a.character_id and h.skill = a.skill
     )
     select skill, count(*)::int as with_any,
            (count(*) filter (where not prereq_only))::int as as_build,
            (count(*) filter (where prereq_only))::int as as_prereq,
            (count(*) filter (where hard_level >= 20))::int as at_twenty,
            sum(hard_level)::float8 as sum_all,
            (coalesce(sum(hard_level) filter (where not prereq_only), 0))::float8 as sum_build,
            (select count(*) from filtered)::int as total
     from flagged group by skill`,
    [...params, skills, prereqs],
  );
  return r.rows;
}
