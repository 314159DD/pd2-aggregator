"use client";
import { useState, type ReactNode } from "react";
import { MarketDetailsCard } from "./MarketDetailsCard";
import { useItemsData, type ItemData } from "@/lib/meta/items-data";
export { useItemsData };
export type { ItemData };

interface Props {
  name: string;
  itemType?: string;
  itemsData: Map<string, ItemData>;
  gameMode?: "hardcore" | "softcore";
  children: ReactNode;
}

export function ItemTooltip({ name, itemType, itemsData, gameMode, children }: Props) {
  const data = itemsData.get(name);
  const attrs = data?.afterAttributes ?? data?.beforeAttributes ?? "";
  const lines = attrs.split(",").map((s) => s.trim()).filter(Boolean);
  const [hovering, setHovering] = useState(false);

  return (
    <span
      className="relative inline-block group/tt"
      onMouseEnter={() => setHovering(true)}
    >
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
        {gameMode && (
          <MarketDetailsCard name={name} gameMode={gameMode} active={hovering} />
        )}
      </span>
    </span>
  );
}
