import itemSlots from "./static/item-slots.json";
import skillPrereqs from "./static/skill-prereqs.json";
import skillClassification from "./static/skill-classification.json";
import modDictionary from "./static/mod-dictionary.json";
import runewordRunes from "./static/runeword-runes.json";

export type MetaSlot =
  | "helm"
  | "armor"
  | "weapon"
  | "offhand"
  | "gloves"
  | "belt"
  | "boots"
  | "amulet"
  | "ring";

/** Display order of the old Meta tables. */
export const META_SLOTS: MetaSlot[] = [
  "weapon",
  "offhand",
  "helm",
  "armor",
  "gloves",
  "belt",
  "boots",
  "amulet",
  "ring",
];

export function slotFromItemName(name: string): MetaSlot | null {
  const map = itemSlots as Record<string, string>;
  return Object.prototype.hasOwnProperty.call(map, name) ? (map[name] as MetaSlot) : null;
}

export const SLOT_BY_EQUIPMENT: Record<string, MetaSlot> = {
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

export const SKILL_PREREQS = skillPrereqs as Record<
  string,
  Record<string, { prereqs: string[]; receivesBonusesFrom: string[] }>
>;

export function skillRole(className: string, skill: string): "core" | "synergy" {
  const cls = (skillClassification as Record<string, Record<string, string>>)[className];
  if (!cls || !Object.prototype.hasOwnProperty.call(cls, skill)) return "core";
  return cls[skill] === "synergy" ? "synergy" : "core";
}

export const MOD_DICTIONARY = modDictionary as Record<
  string,
  { category: string; displayLabel: string }
>;

export const RUNE_NAMES = [
  "El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul",
  "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem",
  "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber",
  "Jah", "Cham", "Zod",
] as const;

export const RUNE_ITEM_NAMES: string[] = RUNE_NAMES.map((r) => r + " Rune");

export function runewordRecipe(name: string): string[] | null {
  const map = runewordRunes as Record<string, string[]>;
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null;
}
