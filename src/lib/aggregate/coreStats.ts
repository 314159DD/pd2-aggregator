import type { Character } from "../types";

export type CoreStat = {
  key: "strength" | "dexterity" | "vitality" | "energy" | "life" | "mana";
  label: string;
  avg: number;
};

/**
 * Average of each character's base stat panel across the cohort: strength,
 * dexterity, vitality, energy, life, mana. Resistances and gear-summed stats
 * are intentionally skipped — they cap and breakpoint, so an arithmetic mean
 * misrepresents them.
 */
export function aggregateCoreStats(chars: Character[]): CoreStat[] {
  const n = chars.length;
  if (n === 0) {
    return [
      { key: "strength", label: "Strength", avg: 0 },
      { key: "dexterity", label: "Dexterity", avg: 0 },
      { key: "vitality", label: "Vitality", avg: 0 },
      { key: "energy", label: "Energy", avg: 0 },
      { key: "life", label: "Life", avg: 0 },
      { key: "mana", label: "Mana", avg: 0 },
    ];
  }
  let str = 0,
    dex = 0,
    vit = 0,
    eng = 0,
    life = 0,
    mana = 0;
  for (const c of chars) {
    const a = c.character.attributes;
    str += a.strength ?? 0;
    dex += a.dexterity ?? 0;
    vit += a.vitality ?? 0;
    eng += a.energy ?? 0;
    life += c.character.life ?? 0;
    mana += c.character.mana ?? 0;
  }
  return [
    { key: "strength", label: "Strength", avg: str / n },
    { key: "dexterity", label: "Dexterity", avg: dex / n },
    { key: "vitality", label: "Vitality", avg: vit / n },
    { key: "energy", label: "Energy", avg: eng / n },
    { key: "life", label: "Life", avg: life / n },
    { key: "mana", label: "Mana", avg: mana / n },
  ];
}
