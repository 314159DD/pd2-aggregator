import type { Pool } from 'pg';
import { MOD_DICTIONARY } from '../../core/static-data';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import type { CharmModEntry, CharmsAggregate } from './types';

export const TOP_CHARM_MODS = 12;

function emptyCharms(): CharmsAggregate {
  return {
    avgCount: 0,
    annihilus: { count: 0, pct: 0 },
    torch: { count: 0, pct: 0 },
    gheeds: { count: 0, pct: 0 },
    topGcMods: [],
    topScMods: [],
  };
}

/**
 * Charm patterns of the cohort (player items with is_charm). One pass: each charm is classified
 * (named unique, grand charm, small/medium charm) and its mods are expanded and grouped.
 * Unique charms never feed the mod lists. pct is relative to the pool and may exceed 1.
 */
export async function charmsAggregate(pool: Pool, f: CharacterFilter, poolSize: number): Promise<CharmsAggregate> {
  if (poolSize <= 0) return emptyCharms();
  const { sql, params } = filterCte(f);
  const n = params.length;
  const r = await pool.query(
    `${sql}
     , c as (
       select i.id, i.mods,
              case when i.quality = 'Unique' and i.name = $${n + 1}::text then 'annihilus'
                   when i.quality = 'Unique' and i.name = $${n + 2}::text then 'torch'
                   when i.quality = 'Unique' and i.name = $${n + 3}::text then 'gheeds'
                   when i.base_type = $${n + 4}::text then 'gc'
                   when i.base_type = any($${n + 5}::text[]) then 'sc'
                   else 'other' end as cat
       from character_items i
       join filtered on filtered.id = i.character_id
       where i.owner = 'player' and i.is_charm
     )
     select c.cat, m->>'name' as mod_name, grouping(m->>'name') as is_cat_row,
            count(*)::int as occurrences, count(distinct c.id)::int as charms
     from c
     left join lateral jsonb_array_elements(case when jsonb_typeof(c.mods) = 'array' then c.mods else '[]'::jsonb end) m
       on c.cat in ('gc', 'sc') and jsonb_typeof(m->'name') = 'string'
     group by grouping sets ((c.cat, m->>'name'), (c.cat))`,
    [...params, 'Annihilus', 'Hellfire Torch', "Gheed's Fortune", 'Large Charm', ['Small Charm', 'Medium Charm']],
  );

  const out = emptyCharms();
  const totals: Record<string, number> = {};
  const mods: Record<'gc' | 'sc', CharmModEntry[]> = { gc: [], sc: [] };
  for (const row of r.rows) {
    const cat = String(row.cat);
    if (Number(row.is_cat_row) === 1) {
      totals[cat] = Number(row.charms);
    } else if ((cat === 'gc' || cat === 'sc') && row.mod_name !== null) {
      const name = String(row.mod_name);
      mods[cat].push({
        modName: name,
        displayLabel: MOD_DICTIONARY[name]?.displayLabel ?? name,
        count: Number(row.occurrences),
        pct: Number(row.occurrences) / poolSize,
      });
    }
  }
  const top = (l: CharmModEntry[]) =>
    l
      .sort((a, b) => b.count - a.count || (a.modName < b.modName ? -1 : a.modName > b.modName ? 1 : 0))
      .slice(0, TOP_CHARM_MODS);
  const one = (cat: string) => ({ count: totals[cat] ?? 0, pct: (totals[cat] ?? 0) / poolSize });
  out.avgCount = Object.values(totals).reduce((a, b) => a + b, 0) / poolSize;
  out.annihilus = one('annihilus');
  out.torch = one('torch');
  out.gheeds = one('gheeds');
  out.topGcMods = top(mods.gc);
  out.topScMods = top(mods.sc);
  return out;
}
