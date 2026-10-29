"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/lx/Tooltip";
import { formatHr } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { ItemData } from "@/lib/meta/items-data";
import type { TopItem } from "@/lib/meta/types";

function attributes(d: ItemData | undefined): string[] {
  const raw = d?.afterAttributes ?? d?.beforeAttributes ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function priceLine(item: TopItem): string {
  const p = item.price;
  if (!p) return "No price yet";
  return p.source === "sold" ? `${p.samples} sold in the last 7 days` : `${p.samples} open asks in the last 7 days`;
}

/** Hover and focus tooltip for one top item: attributes from items.json, own price, rune cost. No network. */
export function ItemPriceTip({
  item,
  gameMode,
  itemsData,
  children,
}: {
  item: TopItem;
  gameMode: "softcore" | "hardcore";
  itemsData: Map<string, ItemData>;
  children: ReactNode;
}) {
  const attrs = attributes(itemsData.get(item.itemName));
  const est = item.runeCostEstimated ? "~" : "";
  const content = (
    <div className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2 text-left leading-relaxed whitespace-normal">
      <p className={`text-sm font-semibold ${qualityClass(item.itemType)}`}>{item.itemName}</p>
      {attrs.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {attrs.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-0.5 border-t border-[var(--line-strong)] pt-2">
        {item.price && <p className="font-mono tabular-nums">{`Median ${formatHr(item.price.medianHr)} HR`}</p>}
        <p className="text-ink-soft">{priceLine(item)}</p>
        <p className="text-muted-ink capitalize">{gameMode} ladder</p>
      </div>
      {item.itemType === "Runeword" && item.runes && item.runes.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-[var(--line-strong)] pt-2">
          <p>{item.runes.map((r) => r.rune).join(" + ")}</p>
          {item.runes.map((r, i) => (
            <p key={`${r.rune}-${i}`} className="flex justify-between gap-3 font-mono tabular-nums">
              <span>{r.rune}</span>
              <span>{r.medianHr === null ? "n/a, counted as 0.01" : `${formatHr(r.medianHr)} HR`}</span>
            </p>
          ))}
          {item.runeCostHr !== null && <p className="font-mono tabular-nums">{`Total ${est}${formatHr(item.runeCostHr)} HR`}</p>}
        </div>
      )}
    </div>
  );
  return (
    <Tooltip content={content} className="max-w-full">
      <span tabIndex={0} className="min-w-0 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
        {children}
      </span>
    </Tooltip>
  );
}
