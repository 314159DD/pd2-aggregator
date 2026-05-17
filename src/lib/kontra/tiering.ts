import type { Tier, TierCutoff } from "./types";
import { TIER_ORDER } from "./types";

/**
 * The build's tier = the highest cutoff whose minMpm the build meets.
 * `cutoffs` need not be pre-sorted.
 */
export function tierFor(normalizedMpm: number, cutoffs: TierCutoff[]): Tier {
  const sorted = [...cutoffs].sort((a, b) => b.minMpm - a.minMpm);
  for (const c of sorted) {
    if (normalizedMpm >= c.minMpm) return c.tier;
  }
  return sorted[sorted.length - 1].tier;
}

/**
 * Builds tested under a handicap ("(H Lvl N)" in the name) post a lower raw
 * MPM than their true strength. Per the Dark Humility sheet's own legend
 * ("H Lvl 1 = +1/3 Tier, Lvl 2 = +2/3 Tier"), each handicap level promotes
 * the build by one sub-tier (a third of a full letter). Negative levels
 * demote.
 */
export function applyHandicap(tier: Tier, handicap: number): Tier {
  if (!handicap) return tier;
  const idx = TIER_ORDER.indexOf(tier);
  if (idx === -1) return tier;
  const shift = Math.round(handicap);
  const newIdx = Math.max(0, Math.min(TIER_ORDER.length - 1, idx - shift));
  return TIER_ORDER[newIdx];
}

/** Final displayed tier: cutoff lookup, then handicap promotion. */
export function tierForBuild(
  normalizedMpm: number,
  handicap: number,
  cutoffs: TierCutoff[],
): Tier {
  return applyHandicap(tierFor(normalizedMpm, cutoffs), handicap);
}
