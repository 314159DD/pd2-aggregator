import type { TopItemsBySlot } from "@/lib/shape/topItems";
import { ItemTooltip, useItemsData } from "./ItemTooltip";

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
  const itemsData = useItemsData();
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
                  <colgroup>
                    <col />
                    <col style={{ width: "5.5rem" }} />
                    <col style={{ width: "4rem" }} />
                    <col style={{ width: "4rem" }} />
                  </colgroup>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.itemName}>
                        <td className={`py-1 pr-3 ${rarityClass(it.itemType)}`}>
                          <ItemTooltip
                            name={it.itemName}
                            itemType={it.itemType}
                            itemsData={itemsData}
                          >
                            {it.itemName}
                          </ItemTooltip>
                        </td>
                        <td className="py-1 text-right text-xs uppercase tracking-wider text-muted-foreground/70">
                          {it.itemType}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {it.count.toLocaleString()}
                        </td>
                        <td className="py-1 text-right tabular-nums text-foreground">
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
