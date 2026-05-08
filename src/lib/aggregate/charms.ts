import type { Character, Item } from "../types";
import type { ModDictionary } from "./types";

export type CharmModEntry = {
  modName: string;
  displayLabel: string;
  /** Number of characters carrying this mod on a charm of the given type */
  count: number;
  /** count / total chars in pool */
  pct: number;
};

export type CharmsAggregate = {
  /** Average total charm count per character (all charm sizes combined) */
  avgCount: number;
  annihilus: { count: number; pct: number };
  torch: { count: number; pct: number };
  gheeds: { count: number; pct: number };
  /** Top mods found on Grand Charms (base.type === "Large Charm"), excluding the three uniques */
  topGcMods: CharmModEntry[];
  /** Top mods found on Small + Large Charms (base.type === "Small Charm" | "Medium Charm"), excluding the three uniques */
  topScMods: CharmModEntry[];
};

// ---------------------------------------------------------------------------
// Charm discriminator
// ---------------------------------------------------------------------------
// VERIFIED against data/snapshot.json (2026-05-08):
//   base.type === "Small Charm"   → Small Charm  (base.id "cm1", type_code "scha")
//   base.type === "Medium Charm"  → Large Charm  (base.id "cm2", type_code "mcha")
//   base.type === "Large Charm"   → Grand Charm  (base.id "cm3", type_code "lcha")
//
// All three unique charms:
//   Annihilus       → base.type "Small Charm",  quality.name "Unique", name "Annihilus"
//   Hellfire Torch  → base.type "Medium Charm", quality.name "Unique", name "Hellfire Torch"
//   Gheed's Fortune → base.type "Large Charm",  quality.name "Unique", name "Gheed's Fortune"

function isCharm(item: Item): boolean {
  return (
    item.base.type === "Small Charm" ||
    item.base.type === "Medium Charm" ||
    item.base.type === "Large Charm"
  );
}

function isGrandCharm(item: Item): boolean {
  return item.base.type === "Large Charm";
}

function isSmallOrLargeCharm(item: Item): boolean {
  return item.base.type === "Small Charm" || item.base.type === "Medium Charm";
}

const UNIQUE_CHARM_NAMES = new Set(["Annihilus", "Hellfire Torch", "Gheed's Fortune"]);

function isUniqueNamedCharm(item: Item, name: string): boolean {
  return item.name === name && item.quality?.name === "Unique";
}

const TOP_MODS = 12;

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

/**
 * Aggregate charm statistics across all characters.
 *
 * Iterates items in character.items (which covers inventory, equipped,
 * stash — all zones as stored in the snapshot).
 */
export function aggregateCharms(
  chars: Character[],
  dict: ModDictionary,
): CharmsAggregate {
  const n = chars.length;
  if (n === 0) {
    return {
      avgCount: 0,
      annihilus: { count: 0, pct: 0 },
      torch: { count: 0, pct: 0 },
      gheeds: { count: 0, pct: 0 },
      topGcMods: [],
      topScMods: [],
    };
  }

  let totalCharms = 0;
  let annihilusCount = 0;
  let torchCount = 0;
  let gheedsCount = 0;

  // modName → count of characters that have at least one of that mod
  // (Using "per-char" semantics as per spec: pct = count / n)
  // We accumulate total occurrences across ALL charms (not per-char dedup)
  const gcModCounts = new Map<string, number>();
  const scModCounts = new Map<string, number>();

  for (const char of chars) {
    for (const item of char.items) {
      if (!isCharm(item)) continue;

      totalCharms++;

      // Detect the three named uniques
      if (isUniqueNamedCharm(item, "Annihilus")) {
        annihilusCount++;
        continue; // don't contribute to topGcMods/topScMods
      }
      if (isUniqueNamedCharm(item, "Hellfire Torch")) {
        torchCount++;
        continue;
      }
      if (isUniqueNamedCharm(item, "Gheed's Fortune")) {
        gheedsCount++;
        continue;
      }

      // Accumulate mod counts
      const bucket = isGrandCharm(item) ? gcModCounts : scModCounts;
      for (const mod of item.modifiers) {
        bucket.set(mod.name, (bucket.get(mod.name) ?? 0) + 1);
      }
    }
  }

  function toEntries(counts: Map<string, number>): CharmModEntry[] {
    const entries: CharmModEntry[] = [];
    for (const [modName, count] of counts.entries()) {
      const dictEntry = dict[modName];
      entries.push({
        modName,
        displayLabel: dictEntry?.displayLabel ?? modName,
        count,
        pct: count / n,
      });
    }
    entries.sort((a, b) => b.count - a.count);
    return entries.slice(0, TOP_MODS);
  }

  return {
    avgCount: totalCharms / n,
    annihilus: { count: annihilusCount, pct: annihilusCount / n },
    torch: { count: torchCount, pct: torchCount / n },
    gheeds: { count: gheedsCount, pct: gheedsCount / n },
    topGcMods: toEntries(gcModCounts),
    topScMods: toEntries(scModCounts),
  };
}
