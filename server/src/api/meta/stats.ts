import type { Pool } from 'pg';
import { MOD_DICTIONARY } from '../../core/static-data';
import { UNIQUE_CHARM_NAMES } from '../../db/meta-rollup';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import { rollupPoolSizeSql, rollupScope } from './rollup';
import type { AvgStat, CoreStat } from './types';

export async function poolSizes(pool: Pool, f: CharacterFilter): Promise<{ poolSize: number; basePoolSize: number }> {
  const count = async (flt: CharacterFilter): Promise<number> => {
    const { sql, params } = filterCte(flt);
    const r = await pool.query(`${sql} select count(*)::int as n from filtered`, params);
    return Number(r.rows[0].n);
  };
  const [poolSize, basePoolSize] = await Promise.all([count(f), count({ ...f, skills: [] })]);
  return { poolSize, basePoolSize };
}

export async function coreStats(pool: Pool, f: CharacterFilter): Promise<CoreStat[]> {
  const scope = await rollupScope(pool, f);
  let row: Record<string, unknown>;
  if (scope) {
    // Same numeric division avg() performs: sum of the values over the character count.
    const r = await pool.query(
      `select r.k1, sum(r.total) / nullif(sum(r.n), 0) as avg
       from meta_rollup r where ${scope.where} and r.kind = 'core' group by r.k1`,
      scope.params,
    );
    row = Object.fromEntries(r.rows.map((x) => [x.k1, x.avg]));
  } else {
    const { sql, params } = filterCte(f);
    const attr = (k: string) => `coalesce(avg(coalesce((c.attributes->>'${k}')::numeric, 0)), 0)`;
    const r = await pool.query(
      `${sql}
       select ${attr('strength')} as strength, ${attr('dexterity')} as dexterity,
              ${attr('vitality')} as vitality, ${attr('energy')} as energy,
              coalesce(avg(coalesce(c.life, 0)), 0) as life, coalesce(avg(coalesce(c.mana, 0)), 0) as mana
       from characters c join filtered on filtered.id = c.id`,
      params,
    );
    row = r.rows[0];
  }
  const n = (k: string): number => Number(row[k]) || 0;
  return [
    { key: 'strength', label: 'Strength', avg: n('strength') },
    { key: 'dexterity', label: 'Dexterity', avg: n('dexterity') },
    { key: 'vitality', label: 'Vitality', avg: n('vitality') },
    { key: 'energy', label: 'Energy', avg: n('energy') },
    { key: 'life', label: 'Life', avg: n('life') },
    { key: 'mana', label: 'Mana', avg: n('mana') },
  ];
}

const META_FLAG_LABELS = new Set(['corrupted', 'desecrated', 'mirrored']);

/**
 * Mods we do not show in the avg-stats summary because they are non-quantitative,
 * shown elsewhere, or cap so averages mislead (resistances cap at 75 in PD2).
 */
const EXCLUDED_MOD_NAMES = [
  // Skill-tab is multi-valued (split per tab in affix table); avg is meaningless.
  'item_addskill_tab',
  // Single-skill +N is per-skill, not meaningful as a pool average.
  'item_singleskill',
  // Charged-skill / proc skills aren't a "build stat" you stack.
  'item_charged_skill',
  'item_skillonhit',
  'item_skillonattack',
  'item_skillongethit',
  'item_skillonkill',
  'item_skillondeath',
  // Resistances cap at 75, everyone has them, averaging is uninteresting.
  'fireresist',
  'coldresist',
  'lightresist',
  'poisonresist',
  'all_resist',
  'maxfireresist',
  'maxcoldresist',
  'maxlightresist',
  'maxpoisonresist',
];

/**
 * Heuristic for whether a mod's value is a percentage (gets a "%" suffix in
 * the UI). Based on conventional D2 mod naming patterns.
 */
function suffixForMod(modName: string, displayLabel: string): '%' | '' {
  if (
    /^item_(faster|magicbonus|magicfind|goldbonus|find_gold|find_magic|fastergethitrate|fastercastrate|fasterattackrate|fasterrunwalk|crushingblow|deadlystrike|attackrate|maxdeadlystrike|tohit_percent|armorpercent|absorb|reduce_)/.test(
      modName,
    )
  ) {
    return '%';
  }
  if (
    /(faster|attack rate|cast rate|hit recovery|run\/walk|magic find|gold find|deadly strike|crushing blow|chance to|enhanced|reduced|absorb)/i.test(
      displayLabel,
    )
  ) {
    return '%';
  }
  return '';
}

/**
 * Equipped player items (switch included) plus non-unique inventory charms.
 * Per character and mod the values are summed; avgValue divides by the pool size.
 * Ranked by prevalence (charsWithMod desc, then modName).
 */
export async function avgStats(pool: Pool, f: CharacterFilter, topN = 8): Promise<AvgStat[]> {
  const scope = await rollupScope(pool, f);
  const rows = scope ? await avgStatsRollup(pool, scope.where, scope.params) : await avgStatsScan(pool, f);
  const out: AvgStat[] = [];
  for (const row of rows) {
    const modName = String(row.mod_name);
    const displayLabel = MOD_DICTIONARY[modName]?.displayLabel ?? modName;
    if (META_FLAG_LABELS.has(displayLabel.toLowerCase().trim())) continue;
    const poolSize = Number(row.pool_size);
    const charsWithMod = Number(row.chars_with_mod);
    out.push({
      modName,
      displayLabel,
      suffix: suffixForMod(modName, displayLabel),
      avgValue: Number(row.total) / poolSize,
      charsWithMod,
      pctOfChars: charsWithMod / poolSize,
    });
  }
  out.sort((a, b) => b.charsWithMod - a.charsWithMod || (a.modName < b.modName ? -1 : a.modName > b.modName ? 1 : 0));
  return out.slice(0, topN);
}

type AvgRow = { mod_name: string; total: string; chars_with_mod: number; pool_size: number };

/** Base cohorts: per-character mod totals summed per (class, level) in meta_rollup (kind 'avg'). */
async function avgStatsRollup(pool: Pool, where: string, params: unknown[]): Promise<AvgRow[]> {
  const r = await pool.query(
    `select r.k1 as mod_name, sum(r.total) as total, sum(r.n)::int as chars_with_mod, ${rollupPoolSizeSql(where)} as pool_size
     from meta_rollup r
     where ${where} and r.kind = 'avg' and not (r.k1 = any($${params.length + 1}::text[]))
     group by r.k1
     having sum(r.n) > 0`,
    [...params, EXCLUDED_MOD_NAMES],
  );
  return r.rows;
}

async function avgStatsScan(pool: Pool, f: CharacterFilter): Promise<AvgRow[]> {
  const { sql, params } = filterCte(f);
  const n = params.length;
  const r = await pool.query(
    `${sql}
     , per as (
       select i.character_id, m->>'name' as mod_name,
              sum(coalesce((m->>'value')::numeric, 0)) as total
       from character_items i
       join filtered on filtered.id = i.character_id
       cross join lateral jsonb_array_elements(i.mods) m
       where i.owner = 'player'
         and (i.slot is not null
              or (i.is_charm and not (i.quality = 'Unique' and i.name = any($${n + 1}::text[]))))
         and not (m->>'name' = any($${n + 2}::text[]))
       group by i.character_id, m->>'name'
     )
     select mod_name, sum(total) as total, (count(*) filter (where total > 0))::int as chars_with_mod,
            (select count(*) from filtered)::int as pool_size
     from per
     group by mod_name
     having count(*) filter (where total > 0) > 0`,
    [...params, UNIQUE_CHARM_NAMES, EXCLUDED_MOD_NAMES],
  );
  return r.rows;
}
