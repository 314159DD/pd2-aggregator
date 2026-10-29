import type { Pool, PoolClient } from 'pg';
import { SKILL_PREREQS, SLOT_BY_EQUIPMENT } from '../core/static-data';

/**
 * Per-character Meta facts and their rollup per (season, mode, class, level), plus per
 * (season, mode, class) at level ALL_LEVELS.
 *
 * Every Meta aggregate of a base cohort (no skill filter) is a sum over characters, so each
 * character contributes a fixed set of fact rows (kind, k1, k2, k3, val, n, total). meta_rollup
 * holds those facts summed per group; a cohort sums the groups it covers. The facts below are the
 * per-character halves of the queries in src/api/meta/*.ts and must keep their semantics:
 *
 *   core        k1 attribute               total = value (coalesce 0), n = 1
 *   avg         k1 mod                     total = summed value, n = 1 when total > 0
 *               (player items with a slot plus non-unique charms, as avgStats)
 *   item_player / item_merc
 *               k1 name, k2 item type, k3 min inv code of the character's copies, n = 1
 *   affix_items k1 slot group              n = rare/magic/crafted items
 *   affix       k1 slot group, k2 bucket, val value, n = occurrences
 *   charm       k1 category                n = charms
 *   charm_mod   k1 gc|sc, k2 mod           n = occurrences
 *   skill20     k1 skill                   n = 1 when hard_level >= 20
 *   skilluse    k1 skill, k2 build|prereq, val hard_level, n = 1 (class prereq map of the character)
 *   merc        k1 description             n = 1
 */

/** Unique charms that are shown on their own and kept out of the avg-stats sums. */
export const UNIQUE_CHARM_NAMES = ['Annihilus', 'Hellfire Torch', "Gheed's Fortune"];
export const SKILL_TAB_MOD = 'item_addskill_tab';

/** Serialises rollup maintenance (upserts, backfills) so deltas never interleave. */
const ROLLUP_LOCK_KEY = 4242022;

function prereqPairs(): { classes: string[]; skills: string[]; prereqs: string[] } {
  const classes: string[] = [];
  const skills: string[] = [];
  const prereqs: string[] = [];
  for (const [cls, map] of Object.entries(SKILL_PREREQS)) {
    for (const [skill, def] of Object.entries(map)) {
      for (const p of def.prereqs) {
        classes.push(cls);
        skills.push(skill);
        prereqs.push(p);
      }
    }
  }
  return { classes, skills, prereqs };
}

/**
 * `coalesce((e)::numeric, 0)` as the scan queries compute it, except that a value that is not
 * numeric counts 0 instead of failing the character's write.
 */
const num = (e: string): string => `case when pg_input_is_valid(${e}, 'numeric') then (${e})::numeric else 0 end`;

/** `facts` CTE body for the characters selected by `chSql` (a select of characters c rows). */
function factsSql(chSql: string, base: number): string {
  const p = (i: number) => `$${base + i}`;
  return `
  ch as (${chSql}),
  it as (
    select i.id, i.character_id, i.owner, i.slot, i.quality, i.is_charm, i.is_runeword, i.name, i.base_type,
           i.inv_code, i.mods
    from character_items i join ch on ch.id = i.character_id
  ),
  pm as (
    select it.character_id, m
    from it cross join lateral jsonb_array_elements(it.mods) m
    where it.owner = 'player'
      and (it.slot is not null or (it.is_charm and not (it.quality = 'Unique' and it.name = any(${p(1)}::text[]))))
  ),
  el as (
    select it.id, it.character_id, it.mods, g.grp
    from it join unnest(${p(2)}::text[], ${p(3)}::text[]) as g(k, grp) on g.k = it.slot
    where it.owner = 'player' and it.quality in ('Rare', 'Magic', 'Crafted')
  ),
  bm as (
    select el.character_id, el.grp,
           case when m->>'name' = ${p(4)}::text
                then (m->>'name') || '|' || btrim(regexp_replace(coalesce(m->>'label', ''), '^\\+?\\d+(\\.\\d+)?\\s+(to\\s+)?', '', 'i'), E' \\t\\r\\n')
                else m->>'name' end as bucket,
           case when jsonb_typeof(m->'value') = 'number' then (m->>'value')::float8 else 0 end as val
    from el cross join lateral jsonb_array_elements(el.mods) m
  ),
  cc as (
    select it.id, it.character_id, it.mods,
           case when it.quality = 'Unique' and it.name = 'Annihilus' then 'annihilus'
                when it.quality = 'Unique' and it.name = 'Hellfire Torch' then 'torch'
                when it.quality = 'Unique' and it.name = 'Gheed''s Fortune' then 'gheeds'
                when it.base_type = 'Large Charm' then 'gc'
                when it.base_type = any(array['Small Charm', 'Medium Charm']) then 'sc'
                else 'other' end as cat
    from it where it.owner = 'player' and it.is_charm
  ),
  cs as (
    select s.character_id, s.skill, s.hard_level, ch.class
    from character_skills s join ch on ch.id = s.character_id
  ),
  hits as (
    select distinct b.character_id, pr.prereq as skill
    from cs b join unnest(${p(5)}::text[], ${p(6)}::text[], ${p(7)}::text[]) as pr(class, skill, prereq)
      on pr.class = b.class and pr.skill = b.skill
    where b.hard_level > 1 and b.skill <> pr.prereq
  ),
  facts as (
    select ch.id as character_id, 'core'::text as kind, a.k as k1, null::text as k2, null::text as k3,
           null::float8 as val, 1::bigint as n, a.v as total
    from ch cross join lateral (values
      ('strength', ${num("ch.attributes->>'strength'")}),
      ('dexterity', ${num("ch.attributes->>'dexterity'")}),
      ('vitality', ${num("ch.attributes->>'vitality'")}),
      ('energy', ${num("ch.attributes->>'energy'")}),
      ('life', coalesce(ch.life, 0)::numeric),
      ('mana', coalesce(ch.mana, 0)::numeric)) as a(k, v)
    union all
    select character_id, 'avg', mod_name, null, null, null, (total > 0)::int, total
    from (select character_id, m->>'name' as mod_name,
                 sum(${num("m->>'value'")}) as total
          from pm where m->>'name' is not null group by character_id, m->>'name') t
    union all
    select character_id, 'item_' || owner, name, case when is_runeword then 'Runeword' else quality end,
           min(inv_code), null, 1, null
    from it where is_runeword or quality in ('Unique', 'Set')
    group by character_id, owner, name, case when is_runeword then 'Runeword' else quality end
    union all
    select character_id, 'affix_items', grp, null, null, null, count(*), null from el group by character_id, grp
    union all
    select character_id, 'affix', grp, bucket, null, val, count(*), null
    from bm where bucket is not null group by character_id, grp, bucket, val
    union all
    select character_id, 'charm', cat, null, null, null, count(*), null from cc group by character_id, cat
    union all
    select cc.character_id, 'charm_mod', cc.cat, m->>'name', null, null, count(*), null
    from cc cross join lateral jsonb_array_elements(case when jsonb_typeof(cc.mods) = 'array' then cc.mods else '[]'::jsonb end) m
    where cc.cat in ('gc', 'sc') and jsonb_typeof(m->'name') = 'string'
    group by cc.character_id, cc.cat, m->>'name'
    union all
    select character_id, 'skill20', skill, null, null, null, 1, null from cs where hard_level >= 20
    union all
    select a.character_id, 'skilluse', a.skill,
           case when a.hard_level = 1 and h.character_id is not null then 'prereq' else 'build' end,
           null, a.hard_level::float8, 1, null
    from cs a left join hits h on h.character_id = a.character_id and h.skill = a.skill
    where a.hard_level >= 1
    union all
    select m.character_id, 'merc', m.description, null, null, null, 1, null
    from character_merc m join ch on ch.id = m.character_id
  )`;
}

function factParams(): unknown[] {
  const pr = prereqPairs();
  const keys = Object.keys(SLOT_BY_EQUIPMENT);
  return [UNIQUE_CHARM_NAMES, keys, keys.map((k) => SLOT_BY_EQUIPMENT[k]), SKILL_TAB_MOD, pr.classes, pr.skills, pr.prereqs];
}

const GROUP_COLS = 'season, mode, class, level, kind, k1, k2, k3, val';

/**
 * Level of the rows that sum every level of a (season, mode, class). Every fact is written twice,
 * at the character's level and here, so a cohort whose level window covers all stored levels
 * (the default: minLevel 80 is the collector's floor) reads one row set per class instead of
 * one per level.
 */
export const ALL_LEVELS = 0;

/** Adds (sign 1) or removes (sign -1) the facts of the given characters, as currently stored, from meta_rollup. */
async function applyDelta(db: Pool | PoolClient, ids: number[], sign: 1 | -1): Promise<void> {
  if (!ids.length) return;
  const params = [ids, ...factParams(), sign];
  const s = `$${params.length}`;
  await db.query(
    `with ${factsSql('select c.id, c.season, c.mode, c.class, c.level, c.attributes, c.life, c.mana from characters c where c.id = any($1::bigint[])', 1)},
     d as (
       select ch.season, ch.mode, ch.class, lv.level, f.kind, f.k1, f.k2, f.k3, f.val,
              (${s}::int * sum(f.n))::int as n, ${s}::int * sum(f.total) as total, (${s}::int * count(*))::int as entries
       from facts f join ch on ch.id = f.character_id
       cross join lateral (values (ch.level), (${ALL_LEVELS})) as lv(level)
       group by ch.season, ch.mode, ch.class, lv.level, f.kind, f.k1, f.k2, f.k3, f.val
     )
     insert into meta_rollup (${GROUP_COLS}, n, total, entries)
     select ${GROUP_COLS}, n, total, entries from d order by ${GROUP_COLS}
     on conflict on constraint meta_rollup_key do update set
       n = meta_rollup.n + excluded.n,
       total = meta_rollup.total + excluded.total,
       entries = meta_rollup.entries + excluded.entries`,
    params,
  );
  if (sign < 0) {
    await db.query(
      `delete from meta_rollup r using (select distinct season, mode, class, level from characters where id = any($1::bigint[])) g
       where r.entries = 0 and (r.season, r.mode, r.class) = (g.season, g.mode, g.class) and r.level in (g.level, ${ALL_LEVELS})`,
      [ids],
    );
  }
}

/**
 * Runs `write` inside the caller's transaction with the character's old facts removed from the
 * rollup before and its new facts added after. `oldId` is the character's id before the write
 * (null for a new character); `write` returns the id after it.
 */
export async function withMetaRollup(
  client: PoolClient,
  oldId: number | null,
  write: () => Promise<number>,
): Promise<number> {
  await client.query('select pg_advisory_xact_lock($1)', [ROLLUP_LOCK_KEY]);
  if (oldId !== null) await applyDelta(client, [oldId], -1);
  const id = await write();
  await applyDelta(client, [id], 1);
  return id;
}

/**
 * Rebuilds meta_rollup from all stored characters in one transaction and marks it ready.
 * Characters are expanded one (season, mode, class) at a time: each batch owns its rollup rows,
 * so the rebuild only inserts (no update churn) and the statement memory stays bounded.
 */
export async function rebuildMetaRollup(pool: Pool): Promise<number> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [ROLLUP_LOCK_KEY]);
    await client.query('delete from meta_rollup');
    const groups = (await client.query('select distinct season, mode, class from characters order by 1, 2, 3')).rows;
    let count = 0;
    for (const g of groups) {
      const ids = (
        await client.query('select id from characters where season = $1 and mode = $2 and class = $3', [g.season, g.mode, g.class])
      ).rows.map((r) => Number(r.id));
      await applyDelta(client, ids, 1);
      count += ids.length;
    }
    await client.query('update meta_rollup_status set ready = true');
    await client.query('commit');
    return count;
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

/** True when meta_rollup reflects every stored character. */
export async function metaRollupReady(db: Pool | PoolClient): Promise<boolean> {
  const r = await db.query('select ready from meta_rollup_status where id = 1');
  return r.rows[0]?.ready === true;
}
