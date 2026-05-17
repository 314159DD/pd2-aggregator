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
 * MPM than their true strength. The Dark Humility methodology compensates by
 * promoting the build by 3 sub-tiers per handicap level.
 *
 * Independently reimplemented from the algorithm used by
 * JakubKontra/pd2-dh-tierlist (no licence file present in that repo — this is
 * the arithmetic rule reimplemented, not their code).
 */
export function applyHandicap(tier: Tier, handicap: number): Tier {
  if (!handicap) return tier;
  const idx = TIER_ORDER.indexOf(tier);
  if (idx === -1) return tier;
  const shift = Math.round(handicap * 3);
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
