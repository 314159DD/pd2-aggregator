"use client";

import { Bar } from "@/components/lx/Bar";
import { buttonClass } from "@/components/lx/Button";
import { ItemIcon } from "@/components/builds/ItemIcon";
import { formatCount, formatHr, formatPct } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import { useItemsData } from "@/lib/meta/items-data";
import { META_SLOTS, type MetaCohort } from "@/lib/meta/types";
import { buildMarketUrl } from "@/lib/price/marketUrl";
import uniqueIds from "../../../data/unique-ids.json";
import { ItemPriceTip } from "./ItemPriceTip";
import { Empty, MetaCard, cap, fin } from "./shared";

const UNIQUE_IDS = uniqueIds as Record<string, number>;

export function TopItemsCard({ data, gameMode }: { data: MetaCohort["topItemsBySlot"]; gameMode: "softcore" | "hardcore" }) {
  const itemsData = useItemsData();
  return (
    <MetaCard title="Top items by slot" className="lg:col-span-7">
      <div className="flex flex-col gap-5">
        {META_SLOTS.map((slot) => {
          const rows = data?.[slot] ?? [];
          return (
            <section key={slot} aria-label={cap(slot)} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">{cap(slot)}</h3>
              {rows.length === 0 ? (
                <Empty>No unique, set or runeword items in this slot.</Empty>
              ) : (
                <div className="mat-thick overflow-x-auto rounded-2xl">
                  <table className="tabelle min-w-[34rem]">
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col" className="text-right!">Count</th>
                        <th scope="col">Share</th>
                        <th scope="col">Price</th>
                        <th scope="col"><span className="sr-only">Market</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((it) => {
                        const est = it.runeCostEstimated ? "~" : "";
                        const runeCost = it.runeCostHr !== null && it.runeCostHr !== undefined ? `${est}${formatHr(it.runeCostHr)} HR` : null;
                        const showRune = it.itemType === "Runeword" && runeCost !== null;
                        const capsule = it.price ? `${formatHr(it.price.medianHr)} HR` : showRune ? runeCost : "n/a";
                        const href = buildMarketUrl({
                          itemType: it.itemType,
                          name: it.itemName,
                          uniqueId: it.itemType === "Unique" ? UNIQUE_IDS[it.itemName] : undefined,
                        });
                        return (
                          <tr key={`${it.itemType}-${it.itemName}`}>
                            <td>
                              <div className="flex min-w-0 items-center gap-2.5">
                                <ItemIcon item={{ name: it.itemName, itemType: it.itemType, invCode: it.invCode }} />
                                <div className="flex min-w-0 flex-col">
                                  <ItemPriceTip item={it} gameMode={gameMode} itemsData={itemsData}>
                                    <span className={`truncate text-sm ${qualityClass(it.itemType)}`}>{it.itemName}</span>
                                  </ItemPriceTip>
                                  <span className="text-[11px] text-muted-ink">{it.itemType}</span>
                                </div>
                              </div>
                            </td>
                            <td className="text-right font-mono text-xs text-ink-soft tabular-nums">{formatCount(fin(it.count))}</td>
                            <td className="w-40">
                              <div className="flex items-center gap-2">
                                <Bar pct={fin(it.pct)} className="flex-1" />
                                <span className="w-10 text-right font-mono text-xs text-ink tabular-nums">{formatPct(fin(it.pct))}</span>
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="well rounded-full px-2.5 py-0.5 font-mono text-xs whitespace-nowrap text-ink tabular-nums">{capsule}</span>
                                {showRune && <span className="text-[11px] whitespace-nowrap text-muted-ink">{`Runes ${runeCost}`}</span>}
                              </div>
                            </td>
                            <td className="text-right">
                              <a href={href} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                                Market
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </MetaCard>
  );
}
