import { useMemo } from "react";
import type { TopItemsBySlot } from "@/lib/shape/topItems";
import { ItemTooltip, useItemsData } from "./ItemTooltip";
import { usePriceSnapshot } from "@/lib/price/snapshot";
import { useLivePrices, useRunePrices } from "@/lib/price/pd2trader";
import { useRunewordRecipes, computeRunewordCost } from "@/lib/price/runewords";
import { formatPrice } from "@/lib/price/parse";
import { MarketLinkButton } from "./MarketLinkButton";

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

export function ItemFrequencyTable({
  data,
  gameMode,
}: {
  data: TopItemsBySlot;
  gameMode: "hardcore" | "softcore";
}) {
  const itemsData = useItemsData();
  const priceData = usePriceSnapshot();
  const allNames = useMemo(
    () => SLOT_ORDER.flatMap((slot) => data[slot].map((it) => it.itemName)),
    [data],
  );
  const livePrices = useLivePrices(allNames, gameMode);
  const recipes = useRunewordRecipes();
  const runePrices = useRunePrices(gameMode);
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
                    <col style={{ width: "5rem" }} />
                    <col style={{ width: "1.5rem" }} />
                  </colgroup>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.itemName}>
                        <td className={`py-1 pr-3 ${rarityClass(it.itemType)}`}>
                          <ItemTooltip
                            name={it.itemName}
                            itemType={it.itemType}
                            itemsData={itemsData}
                            gameMode={gameMode}
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
                        <td className="py-1 text-right tabular-nums text-muted-foreground align-top">
                          {(() => {
                            const live = livePrices.get(it.itemName);
                            const isRuneword = it.itemType.toLowerCase() === "runeword";
                            const recipe = isRuneword ? recipes[it.itemName] : undefined;
                            const runeCost = recipe ? computeRunewordCost(recipe, runePrices) : null;

                            // Live price line. If we have one, show it. If pd2trader
                            // resolved but had no listings, fall through to rune-cost
                            // (for runewords) or blank.
                            const liveResolved = livePrices.has(it.itemName);
                            const liveLine = live
                              ? formatPrice(live.medianPrice)
                              : liveResolved
                                ? null
                                : <span className="text-muted-foreground/40">…</span>;

                            const runeLine = runeCost != null ? (
                              <span className="block text-[10px] text-muted-foreground/70 italic">
                                runes {formatPrice(runeCost)}
                              </span>
                            ) : null;

                            // Fallback: no live price but it's a runeword with rune
                            // cost available — promote rune cost to the main line.
                            if (liveLine === null && runeCost != null) {
                              return (
                                <span className="block italic">{formatPrice(runeCost)}</span>
                              );
                            }
                            if (liveLine === null) return "";
                            return (
                              <>
                                <span className="block">{liveLine}</span>
                                {runeLine}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-1 text-right">
                          {(() => {
                            const entry = priceData.get(it.itemName);
                            return entry ? <MarketLinkButton entry={entry} name={it.itemName} /> : null;
                          })()}
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
