import type { Pool } from 'pg';
import { META_SLOTS, MOD_DICTIONARY, SLOT_BY_EQUIPMENT } from '../../core/static-data';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import type { AffixMod, AffixSlot, MetaSlot } from './types';

export const TOP_MODS_PER_SLOT = 15;
export const SKILL_TAB_MOD = 'item_addskill_tab';

const FLAG_LABELS = new Set(['corrupted', 'desecrated', 'mirrored']);
const MAGNITUDE_RE = /^\+?\d+(?:\.\d+)?\s+(?:to\s+)?/i;

/** Bucket key of a mod: its name, except skill tabs which are keyed per tab name (magnitude stripped). */
export function affixBucketKey(name: string, label: string): string {
  return name === SKILL_TAB_MOD ? `${name}|${label.replace(MAGNITUDE_RE, '').trim()}` : name;
}

/**
 * Rare, Magic and Crafted player items per slot group (switch included): frequency of each mod,
 * median and nearest-rank p75 of its value. One pass over the cohort's mods.
 */
export async function affixModsBySlot(pool: Pool, f: CharacterFilter): Promise<Record<MetaSlot, AffixSlot>> {
  const { sql, params } = filterCte(f);
  const n = params.length;
  const keys = Object.keys(SLOT_BY_EQUIPMENT);
  const groups = keys.map((k) => SLOT_BY_EQUIPMENT[k]);
  const r = await pool.query(
    `${sql}
     , el as (
       select i.id, i.mods, g.grp
       from character_items i
       join filtered on filtered.id = i.character_id
       join unnest($${n + 1}::text[], $${n + 2}::text[]) as g(k, grp) on g.k = i.slot
       where i.owner = 'player' and i.quality in ('Rare', 'Magic', 'Crafted')
     ), bm as (
       select el.grp,
              case when m->>'name' = $${n + 3}::text
                   then (m->>'name') || '|' || btrim(regexp_replace(coalesce(m->>'label', ''), '^\\+?\\d+(\\.\\d+)?\\s+(to\\s+)?', '', 'i'), E' \\t\\r\\n')
                   else m->>'name' end as bucket,
              case when jsonb_typeof(m->'value') = 'number' then (m->>'value')::float8 else 0 end as val
       from el cross join lateral jsonb_array_elements(el.mods) m
     )
     select 'items' as kind, grp, null::text as bucket, count(*)::int as n,
            null::float8 as median, null::float8 as p75
     from el group by grp
     union all
     select 'mod', grp, bucket, count(*)::int,
            percentile_cont(0.5) within group (order by val),
            percentile_disc(0.75) within group (order by val)
     from bm group by grp, bucket`,
    [...params, keys, groups, SKILL_TAB_MOD],
  );

  const out = Object.fromEntries(META_SLOTS.map((s) => [s, { items: 0, mods: [] as AffixMod[] }])) as Record<
    MetaSlot,
    AffixSlot
  >;
  for (const row of r.rows) if (row.kind === 'items') out[row.grp as MetaSlot].items = Number(row.n);
  for (const row of r.rows) {
    if (row.kind !== 'mod' || row.bucket === null) continue;
    const slot = out[row.grp as MetaSlot];
    const bucket = String(row.bucket);
    const isTab = bucket.startsWith(`${SKILL_TAB_MOD}|`);
    const modName = isTab ? SKILL_TAB_MOD : bucket;
    const dict = MOD_DICTIONARY[modName];
    const displayLabel = isTab ? bucket.slice(SKILL_TAB_MOD.length + 1) : (dict?.displayLabel ?? modName);
    if (FLAG_LABELS.has(displayLabel.toLowerCase().trim())) continue;
    slot.mods.push({
      modName: bucket,
      displayLabel,
      category: dict?.category ?? (isTab ? 'skill' : 'unknown'),
      count: Number(row.n),
      pct: slot.items > 0 ? Number(row.n) / slot.items : 0,
      medianValue: Number(row.median) || 0,
      p75Value: Number(row.p75) || 0,
    });
  }
  for (const s of META_SLOTS) {
    out[s].mods.sort((a, b) => b.count - a.count || (a.modName < b.modName ? -1 : a.modName > b.modName ? 1 : 0));
    out[s].mods = out[s].mods.slice(0, TOP_MODS_PER_SLOT);
  }
  return out;
}
