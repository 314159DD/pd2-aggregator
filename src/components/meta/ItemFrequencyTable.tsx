"use client";

import { useItemsData } from "@/lib/meta/items-data";
import { META_SLOTS, type MetaCohort } from "@/lib/meta/types";
import { buildMarketUrl } from "@/lib/price/marketUrl";
import { formatPrice } from "@/lib/price/parse";
import uniqueIds from "../../../data/unique-ids.json";
import { ItemPriceTip } from "./ItemPriceTip";
import { formatCount } from "@/lib/builds/format";
import { fin } from "./shared";

const UNIQUE_IDS = uniqueIds as Record<string, number>;

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

function MarketLink({ itemType, name }: { itemType: string; name: string }) {
  return (
    <a
      href={buildMarketUrl({ itemType, name, uniqueId: itemType === "Unique" ? UNIQUE_IDS[name] : undefined })}
      target="_blank"
      rel="noopener noreferrer"
      title="View on pd2 market"
      aria-label={`View ${name} on the pd2 market`}
      className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-muted-ink hover:text-ink hover:bg-[#2a1e10] transition-colors"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
        <path d="M6 1.5h4.793L1.146 11.146l.708.708L11.5 2.207V7h1V1.5zM2.5 13.5V6.793L1.5 7.793V14.5h6.707l1-1H2.5z" />
      </svg>
    </a>
  );
}

export function ItemFrequencyTable({ data, gameMode }: { data: MetaCohort["topItemsBySlot"]; gameMode: "softcore" | "hardcore" }) {
  const itemsData = useItemsData();
  return (
    <div className="space-y-5">
      {META_SLOTS.map((slot, idx) => {
        const items = data?.[slot] ?? [];
        return (
          <div key={slot}>
            {idx > 0 && <hr className="d2-rule mb-5" />}
            <div className="d2-slot-block" role="group" aria-label={slot}>
              <h3 className="d2-sublabel mb-2">{slot}</h3>
              {items.length === 0 ? (
                <p className="text-sm text-muted-ink italic">— no fixed-quality items mapped —</p>
              ) : (
                <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
                  <colgroup>
                    <col />
                    <col style={{ width: "5.5rem" }} />
                    <col style={{ width: "4rem" }} />
                    <col style={{ width: "4rem" }} />
                    <col style={{ width: "5rem" }} />
                    <col style={{ width: "1.5rem" }} />
                  </colgroup>
                  <tbody>
                    {items.map((it) => {
                      const isRuneword = it.itemType === "Runeword";
                      const runeCost = isRuneword && it.runeCostHr != null ? formatPrice(it.runeCostHr) : null;
                      return (
                        <tr key={`${it.itemType}-${it.itemName}`}>
                          <td className={`py-1 pr-3 ${rarityClass(it.itemType)}`}>
                            <ItemPriceTip item={it} gameMode={gameMode} itemsData={itemsData}>
                              <span className="cursor-help">{it.itemName}</span>
                            </ItemPriceTip>
                          </td>
                          <td className="py-1 text-right text-xs uppercase tracking-wider text-muted-ink/70">{it.itemType}</td>
                          <td className="py-1 text-right tabular-nums text-muted-ink">{formatCount(fin(it.count))}</td>
                          <td className="py-1 text-right tabular-nums text-ink">{fin(it.pct).toFixed(1)}%</td>
                          <td className="py-1 text-right tabular-nums text-muted-ink align-top">
                            {it.price ? (
                              <>
                                <span className="block">{formatPrice(it.price.medianHr)}</span>
                                {runeCost && <span className="block text-[10px] text-muted-ink/70 italic">runes {runeCost}</span>}
                              </>
                            ) : runeCost ? (
                              <span className="block italic">{runeCost}</span>
                            ) : null}
                          </td>
                          <td className="py-1 text-right">
                            <MarketLink itemType={it.itemType} name={it.itemName} />
                          </td>
                        </tr>
                      );
                    })}
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
