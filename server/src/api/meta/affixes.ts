import type { Pool } from 'pg';
import { META_SLOTS, MOD_DICTIONARY, SLOT_BY_EQUIPMENT } from '../../core/static-data';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import { SKILL_TAB_MOD } from '../../db/meta-rollup';
import { rollupScope } from './rollup';
import type { AffixMod, AffixSlot, MetaSlot } from './types';

export const TOP_MODS_PER_SLOT = 15;
export { SKILL_TAB_MOD };

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
  const scope = await rollupScope(pool, f);
  const rows = scope ? await affixRowsRollup(pool, scope.where, scope.params) : await affixRowsScan(pool, f);

  const out = Object.fromEntries(META_SLOTS.map((s) => [s, { items: 0, mods: [] as AffixMod[] }])) as Record<
    MetaSlot,
    AffixSlot
  >;
  for (const row of rows) if (row.kind === 'items') out[row.grp as MetaSlot].items = Number(row.n);
  for (const row of rows) {
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

type AffixRow = { kind: 'items' | 'mod'; grp: string; bucket: string | null; n: number; median: number | null; p75: number | null };

/** Value at 0-based position `pos` of the sorted values a histogram (ascending vals, counts ns) expands to. */
function valueAt(vals: number[], ns: number[], pos: number): number {
  let seen = 0;
  for (let i = 0; i < vals.length; i++) {
    seen += ns[i];
    if (pos < seen) return vals[i];
  }
  return vals[vals.length - 1];
}

/**
 * percentile_cont(0.5) and percentile_disc(0.75) of a histogram, computed the way PostgreSQL
 * computes them over the expanded rows (orderedsetaggs.c): cont interpolates between the rows at
 * floor/ceil of 0.5 * (N - 1) with lo + pct * (hi - lo); disc takes row ceil(0.75 * N) (1-based).
 */
export function histogramPercentiles(vals: number[], ns: number[]): { median: number; p75: number } {
  const total = ns.reduce((a, b) => a + b, 0);
  const pos = 0.5 * (total - 1);
  const first = Math.floor(pos);
  const second = Math.ceil(pos);
  const lo = valueAt(vals, ns, first);
  const median = second === first ? lo : lo + (pos - first) * (valueAt(vals, ns, second) - lo);
  const p75 = valueAt(vals, ns, Math.max(1, Math.ceil(0.75 * total)) - 1);
  return { median, p75 };
}

/**
 * Base cohorts: value histograms per (slot group, bucket) from meta_rollup; median and p75 come
 * from histogramPercentiles, so they equal the scan's percentile_cont / percentile_disc.
 */
async function affixRowsRollup(pool: Pool, where: string, params: unknown[]): Promise<AffixRow[]> {
  const [items, hist] = await Promise.all([
    pool.query(
      `select r.k1 as grp, sum(r.n)::int as n
       from meta_rollup r where ${where} and r.kind = 'affix_items' group by r.k1`,
      params,
    ),
    // collate "C": the grouping only needs equality, and byte order sorts much faster.
    pool.query(
      `with h as (
         select r.k1 collate "C" as grp, r.k2 collate "C" as bucket, r.val, sum(r.n)::int as n
         from meta_rollup r where ${where} and r.kind = 'affix'
         group by 1, 2, 3
       )
       select grp, bucket, array_agg(val order by val) as vals, array_agg(n order by val) as ns
       from h group by grp, bucket`,
      params,
    ),
  ]);
  const out: AffixRow[] = items.rows.map((x) => ({ kind: 'items', grp: x.grp, bucket: null, n: Number(x.n), median: null, p75: null }));
  for (const x of hist.rows) {
    const vals = (x.vals as Array<number | string>).map(Number);
    const ns = (x.ns as Array<number | string>).map(Number);
    const { median, p75 } = histogramPercentiles(vals, ns);
    out.push({ kind: 'mod', grp: x.grp, bucket: x.bucket, n: ns.reduce((a, b) => a + b, 0), median, p75 });
  }
  return out;
}

/** Rare, Magic and Crafted player items of the cohort, expanded per mod. */
async function affixRowsScan(pool: Pool, f: CharacterFilter): Promise<AffixRow[]> {
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
  return r.rows;
}
