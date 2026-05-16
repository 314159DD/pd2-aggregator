"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { PriceEntry } from "@/lib/price/snapshot";
import { MarketDetailsCard } from "./MarketDetailsCard";

export type ItemData = {
  gearId: { name: string; itemCategory?: string };
  itemType?: string;
  requiredLevel?: string;
  afterAttributes?: string;
  beforeAttributes?: string;
  imageUrl?: string;
};

// Module-level cache so we fetch once per session even if many tables mount.
let cache: Map<string, ItemData> | null = null;
let inflight: Promise<Map<string, ItemData>> | null = null;

async function loadItems(): Promise<Map<string, ItemData>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/items.json")
    .then((r) => {
      if (!r.ok) throw new Error(`items.json HTTP ${r.status}`);
      return r.json() as Promise<ItemData[]>;
    })
    .then((arr) => {
      const m = new Map<string, ItemData>();
      for (const it of arr) m.set(it.gearId.name, it);
      cache = m;
      return m;
    })
    .catch(() => {
      // Tooltip is non-critical — return empty map so children stay clickable.
      const m = new Map<string, ItemData>();
      cache = m;
      return m;
    });
  return inflight;
}

export function useItemsData(): Map<string, ItemData> {
  const [m, setM] = useState<Map<string, ItemData>>(cache ?? new Map());
  useEffect(() => {
    let live = true;
    loadItems().then((next) => {
      if (live) setM(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return m;
}

interface Props {
  name: string;
  itemType?: string;
  itemsData: Map<string, ItemData>;
  priceEntry?: PriceEntry;
  children: ReactNode;
}

export function ItemTooltip({ name, itemType, itemsData, priceEntry, children }: Props) {
  const data = itemsData.get(name);
  const attrs = data?.afterAttributes ?? data?.beforeAttributes ?? "";
  const lines = attrs.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <span className="relative inline-block group/tt">
      <span className="cursor-help">{children}</span>
      <span
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 flex gap-2 opacity-0 transition-opacity duration-150 group-hover/tt:opacity-100"
        role="tooltip"
      >
        {data && (
          <span className="w-72 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] p-3 text-xs shadow-lg">
            <span className="flex items-start gap-3">
              {data.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.imageUrl}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  className="shrink-0"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              <span className="flex-1 min-w-0">
                <span className="block rarity-unique font-bold truncate">{name}</span>
                {(data.itemType || itemType) && (
                  <span className="block text-muted-foreground">
                    {data.itemType ?? itemType}
                  </span>
                )}
                {data.requiredLevel && (
                  <span className="block text-muted-foreground mt-0.5">
                    {data.requiredLevel}
                  </span>
                )}
              </span>
            </span>
            {lines.length > 0 && (
              <span className="block mt-2 space-y-0.5">
                {lines.map((l, i) => (
                  <span key={i} className="block rarity-magic leading-snug">
                    {l}
                  </span>
                ))}
              </span>
            )}
          </span>
        )}
        {priceEntry && <MarketDetailsCard entry={priceEntry} />}
      </span>
    </span>
  );
}
