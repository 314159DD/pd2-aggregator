import type { TopItemsBySlot } from "@/lib/shape/topItems";

const SLOT_ORDER = ["weapon", "offhand", "helm", "armor", "gloves", "belt", "boots", "amulet", "ring"] as const;

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
      {SLOT_ORDER.map((slot) => {
        const items = data[slot];
        return (
          <div key={slot}>
            <h3 className="d2-title text-base mb-2">{slot}</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">— No fixed-quality items mapped for this slot —</p>
            ) : (
              <table className="d2-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Item</th>
                    <th className="text-left">Type</th>
                    <th className="text-right">Count</th>
                    <th className="text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.itemName}>
                      <td className={`py-1.5 font-semibold ${rarityClass(it.itemType)}`}>{it.itemName}</td>
                      <td className={`text-xs uppercase tracking-wider ${rarityClass(it.itemType)} opacity-70`}>{it.itemType}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{it.count.toLocaleString()}</td>
                      <td className="text-right tabular-nums text-foreground">{it.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
