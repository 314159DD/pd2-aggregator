import type { Character, Item } from "../types";
import type { ModDictionary } from "./types";

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

// ---------------------------------------------------------------------------
// Charm discriminator helpers (duplicated from charms.ts to avoid coupling)
// ---------------------------------------------------------------------------

const UNIQUE_CHARM_NAMES = new Set([
  "Annihilus",
  "Hellfire Torch",
  "Gheed's Fortune",
]);

function isNonUniqueCharm(item: Item): boolean {
  const t = item.base.type;
  if (t !== "Small Charm" && t !== "Medium Charm" && t !== "Large Charm") {
    return false;
  }
  if (
    item.quality?.name === "Unique" &&
    item.name &&
    UNIQUE_CHARM_NAMES.has(item.name)
  ) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Filters & helpers
// ---------------------------------------------------------------------------

const META_FLAG_LABELS = new Set(["corrupted", "desecrated", "mirrored"]);

/**
 * Mods we actively want to NOT show in the avg-stats summary because they're
 * either non-quantitative (binary indicators) or get displayed elsewhere
 * (e.g., charm patterns / +X to specific skill tab).
 */
const EXCLUDED_MOD_NAMES = new Set<string>([
  // Skill-tab is multi-valued (split per tab in affix table); avg is meaningless.
  "item_addskill_tab",
  // Single-skill +N is per-skill — not meaningful as a pool average.
  "item_singleskill",
  // Charged-skill / proc skills aren't a "build stat" you stack.
  "item_charged_skill",
  "item_skillonhit",
  "item_skillonattack",
  "item_skillongethit",
  "item_skillonkill",
  "item_skillondeath",
]);

/**
 * Heuristic for whether a mod's value is a percentage (gets a "%" suffix in
 * the UI). Based on conventional D2 mod naming patterns.
 */
function suffixForMod(modName: string, displayLabel: string): string {
  if (/^item_(faster|magicbonus|magicfind|goldbonus|find_gold|find_magic|fastergethitrate|fastercastrate|fasterattackrate|fasterrunwalk|crushingblow|deadlystrike|attackrate|maxdeadlystrike|tohit_percent|armorpercent|absorb|reduce_)/.test(
      modName,
    ))
  {
    return "%";
  }
  if (
    /(faster|attack rate|cast rate|hit recovery|run\/walk|magic find|gold find|deadly strike|crushing blow|chance to|enhanced|reduced|absorb)/i.test(
      displayLabel,
    )
  ) {
    return "%";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

/**
 * Walks every character's equipped items + non-unique charms, accumulates
 * per-character totals for every distinct mod name, then returns the topN
 * mods ranked by `charsWithMod` (i.e. "most prevalent across the pool").
 *
 * For each returned mod:
 *   - avgValue is summed across all chars in the pool (zeros for chars
 *     without it). This represents "what a typical char has".
 *   - charsWithMod / pctOfChars tells you how many chars actually carry it.
 *
 * Mods in EXCLUDED_MOD_NAMES and meta-flag labels are filtered out.
 *
 * Mercenary items are not included (those are surfaced separately in
 * the build-sheet section).
 */
export function aggregateAvgStats(
  chars: Character[],
  dict: ModDictionary,
  topN = 8,
): AvgStat[] {
  const n = chars.length;
  if (n === 0) return [];

  // modName → array of per-char running totals
  const totals = new Map<string, number[]>();

  for (let ci = 0; ci < n; ci++) {
    const char = chars[ci];
    for (const item of char.items) {
      const isCharm = isNonUniqueCharm(item);
      const isEquipped = item.location?.zone === "Equipped";
      if (!isCharm && !isEquipped) continue;

      for (const mod of item.modifiers) {
        if (EXCLUDED_MOD_NAMES.has(mod.name)) continue;
        let arr = totals.get(mod.name);
        if (!arr) {
          arr = new Array(n).fill(0);
          totals.set(mod.name, arr);
        }
        const val = Array.isArray(mod.values)
          ? (mod.values[0] ?? 0)
          : Number(mod.values) || 0;
        arr[ci] += val;
      }
    }
  }

  const candidates: AvgStat[] = [];
  for (const [modName, arr] of totals.entries()) {
    let sum = 0;
    let charsWithMod = 0;
    for (const v of arr) {
      sum += v;
      if (v > 0) charsWithMod++;
    }
    if (charsWithMod === 0) continue;

    const dictEntry = dict[modName];
    const displayLabel = dictEntry?.displayLabel ?? modName;
    if (META_FLAG_LABELS.has(displayLabel.toLowerCase().trim())) continue;

    candidates.push({
      modName,
      displayLabel,
      suffix: suffixForMod(modName, displayLabel),
      avgValue: sum / n,
      charsWithMod,
      pctOfChars: charsWithMod / n,
    });
  }

  // Rank by prevalence (chars carrying the mod), descending.
  candidates.sort((a, b) => b.charsWithMod - a.charsWithMod);

  return candidates.slice(0, topN);
}
