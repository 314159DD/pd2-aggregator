import type { Character } from "../types";
import type { ModDictionary } from "./types";
import { aggregateAffixModsBySlot } from "./affixMods";
import { aggregateCharms } from "./charms";
import { aggregateAvgStats, FEATURED_STATS } from "./avgStats";

export type { AffixMod, AffixModsBySlot } from "./affixMods";
export type { CharmsAggregate, CharmModEntry } from "./charms";
export type { ModDictionary, ModDictionaryEntry } from "./types";
export type { AvgStat } from "./avgStats";

export type ClientAggregates = {
  /** Number of characters in the filtered pool */
  poolSize: number;
  /** Per-slot affix mod aggregation (Rare/Magic/Crafted items only) */
  affixModsBySlot: ReturnType<typeof aggregateAffixModsBySlot>;
  /** Charm statistics across all characters */
  charms: ReturnType<typeof aggregateCharms>;
  /** Average totals for featured build stats across the pool */
  avgStats: ReturnType<typeof aggregateAvgStats>;
};

/**
 * Run all client-side aggregations on a pre-filtered character pool.
 *
 * Pass the result of `filterCharacters()` here — this function does no
 * filtering itself.
 */
export function aggregateClientSide(
  filteredChars: Character[],
  dict: ModDictionary,
): ClientAggregates {
  return {
    poolSize: filteredChars.length,
    affixModsBySlot: aggregateAffixModsBySlot(filteredChars, dict),
    charms: aggregateCharms(filteredChars, dict),
    avgStats: aggregateAvgStats(filteredChars, FEATURED_STATS),
  };
}
