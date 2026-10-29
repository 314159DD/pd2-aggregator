import type { AffixSlot, MetaSlot } from "./types";

const META_FLAG_LABELS = new Set(["corrupted", "desecrated", "mirrored"]);
const RESIST_MOD_NAMES = new Set([
  "fireresist",
  "coldresist",
  "lightresist",
  "poisonresist",
  "all_resist",
  "maxfireresist",
  "maxcoldresist",
  "maxlightresist",
  "maxpoisonresist",
]);
const SKILL_PROC_PREFIXES = ["item_singleskill", "item_charged_skill", "item_skillon"];

function excluded(modName: string, displayLabel: string): boolean {
  if (META_FLAG_LABELS.has(displayLabel.toLowerCase().trim())) return true;
  if (RESIST_MOD_NAMES.has(modName)) return true;
  return SKILL_PROC_PREFIXES.some((p) => modName.startsWith(p));
}

/** Mods summed over all slots; pct is 0..1 of all items across slots. */
export function acrossSlots(data: Record<MetaSlot, AffixSlot>): {
  totalItems: number;
  mods: Array<{ modName: string; displayLabel: string; count: number; pct: number }>;
} {
  let totalItems = 0;
  const counts = new Map<string, { displayLabel: string; count: number }>();
  for (const slot of Object.values(data)) {
    if (!slot) continue;
    totalItems += slot.items;
    for (const m of slot.mods) {
      if (excluded(m.modName, m.displayLabel)) continue;
      const cur = counts.get(m.modName) ?? { displayLabel: m.displayLabel, count: 0 };
      cur.count += m.count;
      counts.set(m.modName, cur);
    }
  }
  const mods = [...counts.entries()]
    .map(([modName, v]) => ({
      modName,
      displayLabel: v.displayLabel,
      count: v.count,
      pct: totalItems > 0 ? v.count / totalItems : 0,
    }))
    .sort((a, b) => b.count - a.count);
  return { totalItems, mods };
}
