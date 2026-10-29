import type { Pool } from 'pg';
import { META_SLOTS, runewordRecipe, slotFromItemName } from '../../core/static-data';
import { mercTypeOf } from '../../core/merc-types';
import { getPriceMap, getRunePrices, type ItemPrice } from '../../db/prices-repo';
import { filterCte } from '../filter-sql';
import type { CharacterFilter } from '../filters';
import { itemUsageRows, mercTypeUsage, skillUsage } from '../queries';
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

export async function topItemsBySlot(pool: Pool, f: CharacterFilter): Promise<Record<MetaSlot, TopItem[]>> {
  const rows = await itemUsageRows(pool, f, 'player');
  const invByKey = new Map(rows.map((r) => [`${r.itemType}|${r.item}`, r.invCode]));
  const shaped = shapeTopItemsBySlot(rows);
  const out = emptySlots<TopItem>();
  const anyItems = META_SLOTS.some((s) => shaped[s].length > 0);
  if (!anyItems) return out;
  const archive = f.archive === true;
  const [prices, runePrices] = archive
    ? [new Map<string, ItemPrice>(), new Map<string, number>()]
    : await Promise.all([getPriceMap(pool, f.mode), getRunePrices(pool, f.mode)]);
  for (const s of META_SLOTS) {
    out[s] = shaped[s].map((it) => {
      const itemType = it.itemType as TopItem['itemType'];
      const price = prices.get(`${itemType}|${it.itemName}`) ?? null;
      const recipe = itemType === 'Runeword' && !archive ? runewordRecipe(it.itemName) : null;
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

export async function mercSummary(pool: Pool, f: CharacterFilter): Promise<MercSummary> {
  const [types, rows] = await Promise.all([mercTypeUsage(pool, f), itemUsageRows(pool, f, 'merc')]);
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
  const rows = await skillUsage(pool, f);
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
