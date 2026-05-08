import slotByName from "../../data/item-slots.json";
import type { Slot } from "./types";

export function slotFromItemName(itemName: string): Slot | null {
  const map = slotByName as Record<string, string>;
  const v = map[itemName];
  return (v ?? null) as Slot | null;
}

const SLOT_BY_EQUIPMENT: Record<string, Slot | null> = {
  Helm: "helm",
  Armor: "armor",
  "Right Hand": "weapon",
  "Right Hand Switch": "weapon",
  "Left Hand": "offhand",
  "Left Hand Switch": "offhand",
  Gloves: "gloves",
  Belt: "belt",
  Boots: "boots",
  Amulet: "amulet",
  "Left Ring": "ring",
  "Right Ring": "ring",
};

export function slotFromRawItem(item: {
  location?: { equipment?: string } | null;
  slot?: string;
}): Slot | null {
  const equipment =
    (item.location && typeof item.location === "object" && "equipment" in item.location
      ? (item.location as { equipment?: string }).equipment
      : null) ?? item.slot ?? "";

  return SLOT_BY_EQUIPMENT[equipment] ?? null;
}
