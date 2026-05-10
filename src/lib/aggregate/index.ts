import type { Character } from "../types";
import type { ModDictionary } from "./types";
import { aggregateAffixModsBySlot } from "./affixMods";
import { aggregateCharms } from "./charms";
import { aggregateAvgStats } from "./avgStats";
import { aggregateSkillUsage } from "./skillUsage";

export type { AffixMod, AffixModsBySlot } from "./affixMods";
export type { CharmsAggregate, CharmModEntry } from "./charms";
export type { ModDictionary, ModDictionaryEntry } from "./types";
export type { AvgStat } from "./avgStats";
export type { SkillUsageEntry } from "./skillUsage";

export type ClientAggregates = {
  /** Number of characters in the filtered pool */
  poolSize: number;
  /** Per-slot affix mod aggregation (Rare/Magic/Crafted items only) */
  affixModsBySlot: ReturnType<typeof aggregateAffixModsBySlot>;
  /** Charm statistics across all characters */
  charms: ReturnType<typeof aggregateCharms>;
  /** Average totals for featured build stats across the pool */
  avgStats: ReturnType<typeof aggregateAvgStats>;
  /** Skill usage with prereq classification. `null` when no className was
   *  specified (in which case BuildSheet falls back to server-side data). */
  skillUsage: ReturnType<typeof aggregateSkillUsage>;
};

/**
 * Run all client-side aggregations on a pre-filtered character pool.
 *
 * Pass the result of `filterCharacters()` here — this function does no
 * filtering itself.
 *
 * @param className  Optional class name. Required for prereq-classified
 *                   skill usage; when omitted `skillUsage` will be `null`.
 */
export function aggregateClientSide(
  filteredChars: Character[],
  dict: ModDictionary,
  className?: string,
): ClientAggregates {
  return {
    poolSize: filteredChars.length,
    affixModsBySlot: aggregateAffixModsBySlot(filteredChars, dict),
    charms: aggregateCharms(filteredChars, dict),
    avgStats: aggregateAvgStats(filteredChars, dict),
    skillUsage: className ? aggregateSkillUsage(filteredChars, className) : null,
  };
}
