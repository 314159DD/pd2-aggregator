import type { Character, Item } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AvgStat = {
  modName: string;
  displayLabel: string;
  suffix: string;
  /** Average value across ALL characters in the pool (zeros included) */
  avgValue: number;
  /** Number of characters with at least one non-zero total for this mod */
  charsWithMod: number;
  /** charsWithMod / poolSize (0..1) */
  pctOfChars: number;
};

export type FeaturedStatDef = {
  modName: string;
  label: string;
  suffix: string;
};

// ---------------------------------------------------------------------------
// Curated whitelist of build stats to surface
// ---------------------------------------------------------------------------

// Mod names verified against actual snapshot data — basic stats are bare
// (no `item_` prefix) while % modifiers are `item_*`. See docs/decisions/
// or snapshot inspection for ground truth.
export const FEATURED_STATS: FeaturedStatDef[] = [
  { modName: "item_fastercastrate", label: "Faster Cast Rate", suffix: "%" },
  { modName: "maxhp", label: "Life", suffix: "" },
  { modName: "all_resist", label: "All Resistances", suffix: "" },
  { modName: "strength", label: "Strength", suffix: "" },
  { modName: "dexterity", label: "Dexterity", suffix: "" },
  { modName: "vitality", label: "Vitality", suffix: "" },
  { modName: "item_fastergethitrate", label: "Faster Hit Recovery", suffix: "%" },
  { modName: "item_magicbonus", label: "Magic Find", suffix: "%" },
];

// ---------------------------------------------------------------------------
// Charm discriminator helpers (duplicated from charms.ts to avoid coupling)
// ---------------------------------------------------------------------------

const UNIQUE_CHARM_NAMES = new Set(["Annihilus", "Hellfire Torch", "Gheed's Fortune"]);

function isNonUniqueCharm(item: Item): boolean {
  const t = item.base.type;
  if (t !== "Small Charm" && t !== "Medium Charm" && t !== "Large Charm") {
    return false;
  }
  // Exclude the three named unique charms
  if (item.quality?.name === "Unique" && item.name && UNIQUE_CHARM_NAMES.has(item.name)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

/**
 * For each stat in `featuredStats`, compute:
 *   - avgValue: sum of modifier values across ALL equipped items + non-unique
 *               charms for each char, averaged over the pool (zeros count).
 *   - charsWithMod: chars whose total for this mod is > 0.
 *   - pctOfChars: charsWithMod / poolSize.
 *
 * Items scanned: ALL equipped items (any quality) + inventory charms (excl.
 * Annihilus/Torch/Gheed's).  Modifiers from mercenary items are excluded.
 *
 * Note: for item_resistall, each modifier occurrence adds values[0] once —
 * the modifier itself represents "all resists" so there is no multiplication.
 */
export function aggregateAvgStats(
  chars: Character[],
  featuredStats: FeaturedStatDef[] = FEATURED_STATS,
): AvgStat[] {
  const n = chars.length;
  if (n === 0) return [];

  // For each featured mod: accumulate per-char totals
  const modIndices = new Map<string, number>(
    featuredStats.map((s, i) => [s.modName, i]),
  );
  // perCharTotals[charIdx][statIdx] = running total of values[0] for that mod
  const perCharTotals: number[][] = Array.from({ length: n }, () =>
    new Array(featuredStats.length).fill(0),
  );

  for (let ci = 0; ci < n; ci++) {
    const char = chars[ci];
    for (const item of char.items) {
      // Include: equipped items (any quality) + non-unique charms (inventory)
      const isCharm = isNonUniqueCharm(item);
      const isEquipped = item.location?.zone === "Equipped";
      if (!isCharm && !isEquipped) continue;

      for (const mod of item.modifiers) {
        const statIdx = modIndices.get(mod.name);
        if (statIdx === undefined) continue;
        const val = Array.isArray(mod.values)
          ? (mod.values[0] ?? 0)
          : Number(mod.values) || 0;
        perCharTotals[ci][statIdx] += val;
      }
    }
  }

  // Build AvgStat entries
  return featuredStats.map((def, statIdx) => {
    let sumTotal = 0;
    let charsWithMod = 0;
    for (let ci = 0; ci < n; ci++) {
      const v = perCharTotals[ci][statIdx];
      sumTotal += v;
      if (v > 0) charsWithMod++;
    }
    return {
      modName: def.modName,
      displayLabel: def.label,
      suffix: def.suffix,
      avgValue: sumTotal / n,
      charsWithMod,
      pctOfChars: charsWithMod / n,
    };
  });
}
