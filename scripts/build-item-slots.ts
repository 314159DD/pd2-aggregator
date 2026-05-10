/**
 * build-item-slots.ts
 *
 * Builds data/item-slots.json by scanning data/snapshot.json for equipped
 * items and deriving each named item's slot from the character's actual
 * location.equipment field — i.e. what the game says the slot is.
 *
 * Replaces a previous hand-rolled file that had wrong mappings (e.g.
 * Halaberd's Reign — a PD2 unique Primal Helm — was listed as a weapon
 * because the name sounds like a polearm).
 *
 * For names that appear in multiple slots across the snapshot
 * (e.g. the "Spirit" runeword can be a sword OR a shield), the most
 * frequent slot wins, with a stderr report of all conflicts.
 *
 * Run when the snapshot is refreshed or when PD2 ships new uniques:
 *   npx tsx scripts/build-item-slots.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Slot =
  | "helm"
  | "armor"
  | "weapon"
  | "offhand"
  | "gloves"
  | "belt"
  | "boots"
  | "amulet"
  | "ring";

const SLOT_BY_EQUIPMENT: Record<string, Slot> = {
  Helm: "helm",
  Armor: "armor",
  Gloves: "gloves",
  Belt: "belt",
  Boots: "boots",
  Amulet: "amulet",
  "Left Ring": "ring",
  "Right Ring": "ring",
};

type SnapItem = {
  name?: string;
  is_runeword?: boolean;
  base?: { name?: string; type?: string; category?: string };
  location?: { zone?: string; equipment?: string };
};

/**
 * Derive the canonical slot from an item. Hand-equipped items are
 * disambiguated by `base.category` so a sword in the off-hand
 * (dual-wield) still counts as "weapon" and a shield in the main hand
 * still counts as "offhand". Everything else is unambiguous from the
 * equipment field.
 */
function slotFromItem(it: SnapItem): Slot | null {
  const eq = it.location?.equipment;
  if (!eq) return null;
  if (
    eq === "Right Hand" ||
    eq === "Right Hand Switch" ||
    eq === "Left Hand" ||
    eq === "Left Hand Switch"
  ) {
    return it.base?.category === "weapon" ? "weapon" : "offhand";
  }
  return SLOT_BY_EQUIPMENT[eq] ?? null;
}

type SnapChar = { items?: SnapItem[] };

function displayName(it: SnapItem): string | null {
  // Match the convention used in the UI (BuildSheet / topItems): server-side
  // ItemUsageRow.item is the unique/set name for those qualities, or the
  // runeword name for runewords. Magic/rare/crafted aren't named — server
  // aggregates them by base, but those don't appear in topItemsBySlot.
  if (it.name) return it.name;
  if (it.is_runeword && it.base?.name) {
    // Server returns just the runeword name (e.g. "Spirit"), not the base.
    // We don't see the runeword name on the item object directly, so skip.
    // Conflicting-slot resolution downstream will handle the name when it
    // comes from the unique/set path.
    return null;
  }
  return null;
}

async function main() {
  const root = process.cwd();
  const snapPath = join(root, "data", "snapshot.json");
  const snap = JSON.parse(await readFile(snapPath, "utf8")) as {
    characters: SnapChar[];
  };

  // name → (slot → count)
  const counts = new Map<string, Map<Slot, number>>();

  for (const c of snap.characters) {
    for (const it of c.items ?? []) {
      if (it.location?.zone !== "Equipped") continue;
      const slot = slotFromItem(it);
      if (!slot) continue;
      const name = displayName(it);
      if (!name) continue;

      let slotMap = counts.get(name);
      if (!slotMap) {
        slotMap = new Map();
        counts.set(name, slotMap);
      }
      slotMap.set(slot, (slotMap.get(slot) ?? 0) + 1);
    }
  }

  // Merge: regenerate from snapshot, then layer back any existing entries
  // for items NOT in the snapshot (rare items the snapshot didn't catch).
  // If existing and new disagree, snapshot wins — that's the whole point.
  const existingPath = join(root, "data", "item-slots.json");
  let existing: Record<string, Slot> = {};
  try {
    existing = JSON.parse(await readFile(existingPath, "utf8")) as Record<
      string,
      Slot
    >;
  } catch {
    // First run — no existing file. Fine.
  }

  const result: Record<string, Slot> = {};
  const conflicts: Array<{ name: string; counts: [Slot, number][] }> = [];
  for (const [name, slotMap] of counts) {
    const sorted = [...slotMap.entries()].sort((a, b) => b[1] - a[1]);
    result[name] = sorted[0][0];
    if (sorted.length > 1) conflicts.push({ name, counts: sorted });
  }

  // Pull in existing entries that snapshot didn't see (best-effort coverage).
  let preserved = 0;
  for (const [name, slot] of Object.entries(existing)) {
    if (!(name in result)) {
      result[name] = slot;
      preserved++;
    }
  }

  // Overrides from snapshot are the changes; report those vs old.
  const changed: Array<{ name: string; old: Slot; new: Slot }> = [];
  for (const [name, slot] of Object.entries(result)) {
    if (existing[name] && existing[name] !== slot) {
      changed.push({ name, old: existing[name], new: slot });
    }
  }

  // Stable key order for diff-friendliness.
  const sortedResult: Record<string, Slot> = {};
  for (const key of Object.keys(result).sort()) sortedResult[key] = result[key];

  await writeFile(
    existingPath,
    JSON.stringify(sortedResult, null, 2) + "\n",
    "utf8",
  );

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\nWrote ${Object.keys(sortedResult).length} items to ${existingPath}`);
  const bySlot: Record<string, number> = {};
  for (const slot of Object.values(sortedResult)) {
    bySlot[slot] = (bySlot[slot] ?? 0) + 1;
  }
  console.log("By slot:");
  for (const [k, v] of Object.entries(bySlot).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(4)}`);
  }
  console.log(`\nFrom snapshot : ${counts.size}`);
  console.log(`Preserved old : ${preserved} (items not in snapshot)`);

  if (changed.length > 0) {
    console.log(`\n${changed.length} corrections vs previous file:`);
    for (const { name, old, new: n } of changed) {
      console.log(`  ${name.padEnd(40)} ${old.padEnd(8)} → ${n}`);
    }
  }

  if (conflicts.length > 0) {
    console.log(
      `\n${conflicts.length} items appeared in multiple slots (chose majority):`,
    );
    for (const { name, counts: cs } of conflicts.slice(0, 30)) {
      console.log(`  ${name.padEnd(40)} ${cs.map(([s, n]) => `${s}=${n}`).join(", ")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
