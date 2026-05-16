// Temporary local type so this file compiles before Task 5 lands.
// Task 5 will replace this with: import type { PriceEntry } from "./snapshot";
type PriceEntry = {
  type: "Unique" | "Set" | "Runeword";
  uniqueId?: number;
  runewordKey?: string;
  medianHr: number;
  low: number;
  high: number;
  sampleCount: number;
};

const BASE = "https://www.projectdiablo2.com/market";

export function buildMarketUrl(entry: PriceEntry, name: string): string {
  const p = new URLSearchParams();
  switch (entry.type) {
    case "Unique":
      if (entry.uniqueId == null) {
        throw new Error(`buildMarketUrl: Unique entry "${name}" is missing uniqueId`);
      }
      p.set("item.unique.id", String(entry.uniqueId));
      break;
    case "Runeword":
      if (entry.runewordKey == null) {
        throw new Error(`buildMarketUrl: Runeword entry "${name}" is missing runewordKey`);
      }
      p.set("item.is_runeword", "true");
      p.set("item.runeword.key", entry.runewordKey);
      break;
    case "Set":
      p.set("item.quality.name", "Set");
      p.set("item.name", name);
      break;
  }
  return `${BASE}?${p.toString()}`;
}
