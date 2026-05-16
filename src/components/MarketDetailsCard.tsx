"use client";
import { formatPrice } from "@/lib/price/parse";
import type { PriceEntry } from "@/lib/price/snapshot";

export function MarketDetailsCard({ entry }: { entry: PriceEntry }) {
  return (
    <span className="block w-72 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] p-3 text-xs">
      <span className="block rarity-unique font-bold mb-2">Market</span>
      <span className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="flex justify-between">
          <span className="text-muted-foreground">Median</span>
          <span className="tabular-nums font-semibold text-foreground">
            {formatPrice(entry.medianHr)}
          </span>
        </span>
        <span className="flex justify-between">
          <span className="text-muted-foreground">Samples</span>
          <span className="tabular-nums text-foreground">{entry.sampleCount}</span>
        </span>
        <span className="flex justify-between">
          <span className="text-muted-foreground">Min</span>
          <span className="tabular-nums text-foreground">{formatPrice(entry.low)}</span>
        </span>
        <span className="flex justify-between">
          <span className="text-muted-foreground">Max</span>
          <span className="tabular-nums text-foreground">{formatPrice(entry.high)}</span>
        </span>
      </span>
    </span>
  );
}
