const BASE = "https://www.projectdiablo2.com/market";

type Args = {
  itemType: string;
  name: string;
  uniqueId?: number;
  runewordKey?: string;
};

// Builds a best-effort deeplink to the pd2 market.
// Sets only need the name; uniques and runewords prefer ID/key but fall back
// to name-based filters when those aren't available.
export function buildMarketUrl({ itemType, name, uniqueId, runewordKey }: Args): string {
  const p = new URLSearchParams();
  const t = itemType.toLowerCase();

  if (t === "unique") {
    if (uniqueId != null) {
      p.set("item.unique.id", String(uniqueId));
    } else {
      p.set("item.quality.name", "Unique");
      p.set("item.name", name);
    }
  } else if (t === "runeword") {
    p.set("item.is_runeword", "true");
    if (runewordKey != null) {
      p.set("item.runeword.key", runewordKey);
    } else {
      p.set("item.name", name);
    }
  } else if (t === "set") {
    p.set("item.quality.name", "Set");
    p.set("item.name", name);
  } else {
    // Unknown type — best-effort name search.
    p.set("item.name", name);
  }

  return `${BASE}?${p.toString()}`;
}
