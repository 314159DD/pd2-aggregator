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
  if (entry.type === "Unique" && entry.uniqueId != null) {
    p.set("item.unique.id", String(entry.uniqueId));
  } else if (entry.type === "Runeword" && entry.runewordKey) {
    p.set("item.is_runeword", "true");
    p.set("item.runeword.key", entry.runewordKey);
  } else {
    p.set("item.quality.name", "Set");
    p.set("item.name", name);
  }
  return `${BASE}?${p.toString()}`;
}
