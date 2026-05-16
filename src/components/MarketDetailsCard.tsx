"use client";
import { useEffect, useState } from "react";
import { fetchHoverPrice, type HoverPrice } from "@/lib/price/pd2trader";

type Status = "idle" | "loading" | "loaded" | "error";

function formatHr(n: number): string {
  if (n >= 100) return `${n.toFixed(0)} HR`;
  if (n >= 10) return `${n.toFixed(1)} HR`;
  return `${n.toFixed(2)} HR`;
}

export function MarketDetailsCard({
  name,
  gameMode,
  active,
}: {
  name: string;
  gameMode: "hardcore" | "softcore";
  active: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<HoverPrice | null>(null);

  useEffect(() => {
    if (!active || status !== "idle") return;
    setStatus("loading");
    fetchHoverPrice(name, gameMode)
      .then((r) => {
        setData(r);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, [active, status, name, gameMode]);

  const avg = data?.average;
  const corruptions = data?.corruptions ?? [];
  const topCorr = corruptions.slice(0, 8);

  return (
    <span className="block w-80 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] p-3 text-xs">
      <span className="block rarity-unique font-bold mb-2">{name}</span>

      {(status === "idle" || status === "loading") && (
        <span className="block space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="block h-3 bg-[#2a1e10] rounded-sm animate-pulse" />
          ))}
        </span>
      )}

      {status === "error" && (
        <span className="block text-muted-foreground italic">market unavailable</span>
      )}

      {status === "loaded" && !avg && (
        <span className="block text-muted-foreground italic">no price data</span>
      )}

      {status === "loaded" && avg && (
        <>
          <span className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="flex justify-between">
              <span className="text-muted-foreground">Average</span>
              <span className="tabular-nums text-foreground">{formatHr(avg.averagePrice)}</span>
            </span>
            <span className="flex justify-between">
              <span className="text-muted-foreground">Median</span>
              <span className="tabular-nums font-semibold text-foreground">{formatHr(avg.medianPrice)}</span>
            </span>
            <span className="flex justify-between">
              <span className="text-muted-foreground">Min</span>
              <span className="tabular-nums text-foreground">{formatHr(avg.minPrice)}</span>
            </span>
            <span className="flex justify-between">
              <span className="text-muted-foreground">Max</span>
              <span className="tabular-nums text-foreground">{formatHr(avg.maxPrice)}</span>
            </span>
          </span>

          <span className="block mt-2 pt-2 border-t border-[#5e4a1f]/50 space-y-1">
            <span className="flex justify-between">
              <span className="text-muted-foreground">Samples</span>
              <span className="tabular-nums text-foreground">{avg.sampleCount}</span>
            </span>
            {avg.priceChange7Days && (
              <span className="flex justify-between">
                <span className="text-muted-foreground">7d Change</span>
                <span
                  className={`tabular-nums ${
                    avg.priceChange7Days.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {avg.priceChange7Days.changePercent >= 0 ? "+" : ""}
                  {avg.priceChange7Days.changePercent.toFixed(1)}%
                </span>
              </span>
            )}
          </span>

          {topCorr.length > 0 && (
            <span className="block mt-2 pt-2 border-t border-[#5e4a1f]/50">
              <span className="block text-muted-foreground uppercase tracking-wider text-[10px] mb-1">
                Top Corruptions
              </span>
              <span className="block space-y-0.5">
                {topCorr.map((c) => (
                  <span key={c.corruptionName} className="flex justify-between gap-2">
                    <span className="truncate text-foreground/90">{c.corruptionName}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ({c.sampleCount}) {formatHr(c.medianPrice)}
                    </span>
                  </span>
                ))}
              </span>
            </span>
          )}
        </>
      )}
    </span>
  );
}
