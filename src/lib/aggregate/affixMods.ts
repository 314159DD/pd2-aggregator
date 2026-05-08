import { slotFromRawItem } from "../slot";
import type { Character, Slot } from "../types";
import type { ModDictionary } from "./types";

export type AffixMod = {
  /**
   * Grouping key for this mod entry.
   *
   * For most mods this equals `modifier.name` (e.g. "item_fastercastrate").
   * For `item_addskill_tab` entries the key is suffixed with the specific tab
   * name to keep each tab in a separate bucket:
   *   "item_addskill_tab|Combat Skills (Paladin Only)"
   *
   * This is an opaque key — do not parse it for display; use `displayLabel`.
   */
  modName: string;
  /** Human-readable label from the mod dictionary, or modName as fallback */
  displayLabel: string;
  /** Category from the mod dictionary, or "unknown" as fallback */
  category: string;
  /** Number of items in this slot that carry this mod */
  count: number;
  /** count / itemsInSlot */
  pct: number;
  /** Median of values[0] across all occurrences */
  medianValue: number;
  /** 75th-percentile of values[0] across all occurrences */
  p75Value: number;
};

export type AffixModsBySlot = Record<Slot, AffixMod[]>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ELIGIBLE_QUALITIES = new Set(["Rare", "Magic", "Crafted"]);

/**
 * Strip a leading magnitude from a skill-tab modifier label so entries with
 * different magnitudes ("+1 to", "+3 to") collapse to the same display key.
 *
 * "+3 to Combat Skills (Paladin Only)" → "Combat Skills (Paladin Only)"
 * "+1 to Warcries Skills (Barbarian Only)" → "Warcries Skills (Barbarian Only)"
 *
 * The pattern matches an optional leading + sign, one or more digits (with
 * optional decimal), optional whitespace, optional literal "to" with trailing
 * whitespace.
 */
const SKILL_TAB_MAGNITUDE_RE = /^\+?\d+(?:\.\d+)?\s+(?:to\s+)?/i;

function skillTabBucketKey(modifierName: string, label: string): string {
  // Strip the magnitude prefix to get the stable tab name
  const tabName = label.replace(SKILL_TAB_MAGNITUDE_RE, "").trim();
  return `${modifierName}|${tabName}`;
}

const SKILL_TAB_MOD = "item_addskill_tab";

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function p75(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  // nearest-rank method (same as Excel PERCENTILE.INC for small arrays)
  const idx = Math.ceil(0.75 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

const TOP_MODS_PER_SLOT = 15;

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

/**
 * For each slot, compute the top affix mods across all characters.
 * Only Rare, Magic, and Crafted items are included (fixed-quality items like
 * Unique / Set / Runeword are handled by the server-side /item-usage endpoint).
 */
export function aggregateAffixModsBySlot(
  chars: Character[],
  dict: ModDictionary,
): AffixModsBySlot {
  // Per-slot accumulators
  const itemCount: Partial<Record<Slot, number>> = {};
  // slot → modName → numeric values (values[0] per occurrence)
  const modValues: Partial<Record<Slot, Map<string, number[]>>> = {};

  for (const char of chars) {
    for (const item of char.items) {
      // Only equipped items (slotFromRawItem returns null for inventory/stash)
      const slot = slotFromRawItem(item);
      if (slot === null) continue;

      // Only eligible quality tiers
      const qname = item.quality?.name ?? "";
      if (!ELIGIBLE_QUALITIES.has(qname)) continue;

      // Increment item counter for this slot
      itemCount[slot] = (itemCount[slot] ?? 0) + 1;

      // Ensure the slot's mod-value map exists
      if (!modValues[slot]) modValues[slot] = new Map();
      const slotMap = modValues[slot]!;

      // Bucket each modifier.
      // For item_addskill_tab we use the label-derived tab name as part of the
      // key so that "+1 to Combat Skills" and "+3 to Combat Skills" land in the
      // same bucket (keyed as "item_addskill_tab|Combat Skills (Paladin Only)")
      // while "+1 to Warcries Skills" lands in a separate bucket.
      for (const mod of item.modifiers) {
        const val = Array.isArray(mod.values)
          ? (mod.values[0] ?? 0)
          : Number(mod.values) || 0;
        const bucketKey =
          mod.name === SKILL_TAB_MOD
            ? skillTabBucketKey(mod.name, mod.label)
            : mod.name;
        const existing = slotMap.get(bucketKey);
        if (existing) {
          existing.push(val);
        } else {
          slotMap.set(bucketKey, [val]);
        }
      }
    }
  }

  // Build output per slot
  const result: Partial<AffixModsBySlot> = {};

  for (const [slotKey, slotMap] of Object.entries(modValues) as [
    Slot,
    Map<string, number[]>,
  ][]) {
    const totalItems = itemCount[slotKey] ?? 0;

    const mods: AffixMod[] = [];
    for (const [bucketKey, vals] of slotMap.entries()) {
      const sorted = [...vals].sort((a, b) => a - b);

      // For skill-tab entries the bucket key is "item_addskill_tab|Tab Name".
      // Extract the raw modifier name (before "|") for dictionary lookup and
      // use the tab name part as the displayLabel.
      let rawModName: string;
      let displayLabel: string;
      let category: string;

      if (bucketKey.startsWith(SKILL_TAB_MOD + "|")) {
        rawModName = SKILL_TAB_MOD;
        // Everything after the first "|" is the tab label
        displayLabel = bucketKey.slice(SKILL_TAB_MOD.length + 1);
        category = dict[rawModName]?.category ?? "skill";
      } else {
        rawModName = bucketKey;
        const dictEntry = dict[rawModName];
        displayLabel = dictEntry?.displayLabel ?? rawModName;
        category = dictEntry?.category ?? "unknown";
      }

      mods.push({
        modName: bucketKey,
        displayLabel,
        category,
        count: vals.length,
        pct: totalItems > 0 ? vals.length / totalItems : 0,
        medianValue: median(sorted),
        p75Value: p75(sorted),
      });
    }

    // Sort by count desc, take top N
    mods.sort((a, b) => b.count - a.count);
    result[slotKey] = mods.slice(0, TOP_MODS_PER_SLOT);
  }

  return result as AffixModsBySlot;
}
