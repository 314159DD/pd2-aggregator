import type { Pool } from 'pg';
import { META_SLOTS, runewordRecipe, slotFromItemName } from '../../core/static-data';
import { mercTypeOf } from '../../core/merc-types';
import { getPriceMap, getRunePrices } from '../../db/prices-repo';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import { mercTypeUsage, pct, skillUsage, type MercTypeUsageRow, type SkillUsageRow } from '../queries';
import { rollupPoolSizeSql, rollupScope } from './rollup';
import type { MercSummary, MetaSlot, SkillFrequencyRow, TopItem } from './types';

export type UsageRow = { item: string; itemType: string; numOccurrences: number; totalSample: number; pct: number };
export type ShapedItem = { itemName: string; itemType: string; count: number; pct: number };

const round2 = (n: number): number => Math.round(n * 100) / 100;
const emptySlots = <T>(): Record<MetaSlot, T[]> =>
  Object.fromEntries(META_SLOTS.map((s) => [s, [] as T[]])) as Record<MetaSlot, T[]>;

/** Pure port of src/lib/shape/topItems.ts: rows without a slot are dropped, pct is copied unchanged. */
export function shapeTopItemsBySlot(rows: UsageRow[], limit = 8): Record<MetaSlot, ShapedItem[]> {
  const out = emptySlots<ShapedItem>();
  for (const row of rows) {
    const slot = slotFromItemName(row.item);
    if (!slot) continue;
    out[slot].push({ itemName: row.item, itemType: row.itemType, count: row.numOccurrences, pct: row.pct });
  }
  for (const s of META_SLOTS) {
    out[s].sort((a, b) => b.count - a.count || (a.itemName < b.itemName ? -1 : a.itemName > b.itemName ? 1 : 0));
    out[s] = out[s].slice(0, limit);
  }
  return out;
}

/** Same semantics as the phase-1 item usage query, plus one inventory code per item. */
export async function itemUsageRows(
  pool: Pool,
  f: CharacterFilter,
  owner: 'player' | 'merc',
): Promise<Array<UsageRow & { invCode: string | null }>> {
  const scope = await rollupScope(pool, f);
  let rows: Array<{ item: string; item_type: string; n: number; inv_code: string | null; total: number }>;
  if (scope) {
    // item_<owner> facts: one per character and item, k3 = that character's min inv code.
    const r = await pool.query(
      `select r.k1 as item, r.k2 as item_type, sum(r.n)::int as n, min(r.k3) as inv_code,
              ${rollupPoolSizeSql(scope.where)} as total
       from meta_rollup r where ${scope.where} and r.kind = $${scope.params.length + 1}
       group by r.k1, r.k2
       order by n desc, r.k1`,
      [...scope.params, `item_${owner}`],
    );
    rows = r.rows;
  } else {
    const { sql, params } = filterCte(f);
    const r = await pool.query(
      `${sql}
       select i.name as item,
              case when i.is_runeword then 'Runeword' else i.quality end as item_type,
              count(distinct i.character_id)::int as n,
              min(i.inv_code) as inv_code,
              (select count(*) from filtered)::int as total
       from character_items i join filtered on filtered.id = i.character_id
       where i.owner = $${params.length + 1} and (i.is_runeword or i.quality in ('Unique','Set'))
       group by i.name, item_type
       order by n desc, i.name`,
      [...params, owner],
    );
    rows = r.rows;
  }
  return rows.map((x) => ({
    item: x.item,
    itemType: x.item_type,
    numOccurrences: x.n,
    totalSample: x.total,
    pct: x.total > 0 ? Math.round((x.n / x.total) * 10000) / 100 : 0,
    invCode: x.inv_code ?? null,
  }));
}

export async function topItemsBySlot(pool: Pool, f: CharacterFilter): Promise<Record<MetaSlot, TopItem[]>> {
  const rows = await itemUsageRows(pool, f, 'player');
  const invByKey = new Map(rows.map((r) => [`${r.itemType}|${r.item}`, r.invCode]));
  const shaped = shapeTopItemsBySlot(rows);
  const out = emptySlots<TopItem>();
  const anyItems = META_SLOTS.some((s) => shaped[s].length > 0);
  if (!anyItems) return out;
  const [prices, runePrices] = await Promise.all([getPriceMap(pool, f.mode), getRunePrices(pool, f.mode)]);
  for (const s of META_SLOTS) {
    out[s] = shaped[s].map((it) => {
      const itemType = it.itemType as TopItem['itemType'];
      const price = prices.get(`${itemType}|${it.itemName}`) ?? null;
      const recipe = itemType === 'Runeword' ? runewordRecipe(it.itemName) : null;
      let runes: TopItem['runes'] = null;
      let runeCostHr: number | null = null;
      let runeCostEstimated = false;
      if (recipe) {
        runes = recipe.map((rune) => ({ rune, medianHr: runePrices.get(rune) ?? null }));
        runeCostHr = round2(runes.reduce((sum, r) => sum + (r.medianHr ?? 0.01), 0));
        runeCostEstimated = runes.some((r) => r.medianHr === null);
      }
      return {
        itemName: it.itemName,
        itemType,
        count: it.count,
        pct: it.pct,
        invCode: invByKey.get(`${it.itemType}|${it.itemName}`) ?? null,
        price: price ? { medianHr: price.medianHr, samples: price.samples, source: price.source } : null,
        runes,
        runeCostHr,
        runeCostEstimated,
      };
    });
  }
  return out;
}

/** Characters per value of a one-per-character fact kind ('merc', 'skill20'), as mercTypeUsage/skillUsage report them. */
async function countPerKey(pool: Pool, where: string, params: unknown[], kind: string) {
  const r = await pool.query(
    `select r.k1 as name, sum(r.n)::int as n, ${rollupPoolSizeSql(where)} as total
     from meta_rollup r where ${where} and r.kind = $${params.length + 1}
     group by r.k1 order by n desc, r.k1`,
    [...params, kind],
  );
  return r.rows.map((x) => ({ name: String(x.name), n: Number(x.n), total: Number(x.total) }));
}

async function mercTypes(pool: Pool, f: CharacterFilter): Promise<MercTypeUsageRow[]> {
  const scope = await rollupScope(pool, f);
  if (!scope) return mercTypeUsage(pool, f);
  return (await countPerKey(pool, scope.where, scope.params, 'merc')).map((x) => ({
    mercType: x.name,
    numOccurrences: x.n,
    totalSample: x.total,
    pct: pct(x.n, x.total),
  }));
}

async function skillsAtTwenty(pool: Pool, f: CharacterFilter): Promise<SkillUsageRow[]> {
  const scope = await rollupScope(pool, f);
  if (!scope) return skillUsage(pool, f);
  return (await countPerKey(pool, scope.where, scope.params, 'skill20')).map((x) => ({
    name: x.name,
    numOccurrences: x.n,
    totalSample: x.total,
    pct: pct(x.n, x.total),
  }));
}

export async function mercSummary(pool: Pool, f: CharacterFilter): Promise<MercSummary> {
  const [types, rows] = await Promise.all([mercTypes(pool, f), itemUsageRows(pool, f, 'merc')]);
  const typeFrequency = types
    .map((t) => ({
      mercType: t.mercType,
      act: mercTypeOf(t.mercType).act,
      numOccurrences: t.numOccurrences,
      totalSample: t.totalSample,
      pct: t.pct,
    }))
    .sort((a, b) => b.numOccurrences - a.numOccurrences || (a.mercType < b.mercType ? -1 : a.mercType > b.mercType ? 1 : 0));
  const topItemsBySlot: MercSummary['topItemsBySlot'] = {};
  for (const r of rows) {
    const slot = slotFromItemName(r.item) ?? 'other';
    (topItemsBySlot[slot] ??= []).push({ itemName: r.item, itemType: r.itemType, invCode: r.invCode, pct: r.pct });
  }
  for (const slot of Object.keys(topItemsBySlot)) {
    topItemsBySlot[slot] = topItemsBySlot[slot]
      .sort((a, b) => b.pct - a.pct || (a.itemName < b.itemName ? -1 : a.itemName > b.itemName ? 1 : 0))
      .slice(0, 5);
  }
  return { topType: typeFrequency[0]?.mercType ?? '', typeFrequency, topItemsBySlot };
}

export async function skillFrequency(pool: Pool, f: CharacterFilter): Promise<SkillFrequencyRow[]> {
  const rows = await skillsAtTwenty(pool, f);
  return rows
    .slice()
    .sort((a, b) => b.pct - a.pct || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 12);
}

/** Level histogram of the cohort's own mode and filter (minLevel applied). */
export async function levelDistribution(pool: Pool, f: CharacterFilter): Promise<Array<{ level: number; count: number }>> {
  const { sql, params } = filterCte(f);
  const r = await pool.query(
    `${sql} select c.level, count(*)::int as n from characters c join filtered on filtered.id = c.id
     group by c.level order by c.level`,
    params,
  );
  return r.rows.map((x) => ({ level: Number(x.level), count: Number(x.n) }));
}
