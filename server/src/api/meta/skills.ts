import type { Pool } from 'pg';
import { SKILL_PREREQS, skillRole } from '../../core/static-data';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
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
     ), flagged as (
       select a.skill, a.hard_level,
              (a.hard_level = 1 and exists (
                 select 1 from cs b join pr on pr.skill = b.skill
                 where b.character_id = a.character_id and b.hard_level > 1
                   and b.skill <> a.skill and pr.prereq = a.skill)) as prereq_only
       from cs a
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
  if (r.rows.length === 0) return [];
  const out: SkillUsageEntry[] = r.rows.map((x) => {
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
