import type { TopItemsBySlot } from "@/lib/shape/topItems";

const SLOT_ORDER = [
  "weapon",
  "offhand",
  "helm",
  "armor",
  "gloves",
  "belt",
  "boots",
  "amulet",
  "ring",
] as const;

function rarityClass(itemType: string): string {
  const t = itemType.toLowerCase();
  if (t === "unique") return "rarity-unique";
  if (t === "set") return "rarity-set";
  if (t === "runeword") return "rarity-runeword";
  if (t === "rare") return "rarity-rare";
  if (t === "magic") return "rarity-magic";
  if (t === "crafted") return "rarity-crafted";
  return "rarity-normal";
}

export function ItemFrequencyTable({ data }: { data: TopItemsBySlot }) {
  return (
    <div className="space-y-5">
      {SLOT_ORDER.map((slot, idx) => {
        const items = data[slot];
        return (
          <div key={slot}>
            {idx > 0 && <hr className="d2-rule mb-5" />}
            <div className="d2-slot-block">
              <h3 className="d2-sublabel mb-2">{slot}</h3>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  — no fixed-quality items mapped —
                </p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.itemName}>
                        <td className={`py-1 ${rarityClass(it.itemType)}`}>
                          {it.itemName}
                        </td>
                        <td className="py-1 text-xs text-muted-foreground/70 pl-3">
                          {it.itemType}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground pl-3">
                          {it.count.toLocaleString()}
                        </td>
                        <td className="py-1 text-right tabular-nums text-foreground pl-3 w-14">
                          {it.pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
