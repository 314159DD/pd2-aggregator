"use client";
import { useEffect, useState } from "react";
import { fetchListings, type Listing } from "@/lib/price/marketApi";
import { formatPrice } from "@/lib/price/parse";
import type { PriceEntry } from "@/lib/price/snapshot";

type Status = "idle" | "loading" | "loaded" | "error";

export function MarketDetailsCard({
  entry,
  name,
  active,
}: {
  entry: PriceEntry;
  name: string;
  active: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<Listing[]>([]);

  useEffect(() => {
    if (!active || status !== "idle") return;
    setStatus("loading");
    fetchListings(entry, name)
      .then((r) => {
        setRows(r);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, [active, status, entry, name]);

  return (
    <span className="block w-72 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] p-3 text-xs">
      <span className="block rarity-unique font-bold mb-1">Current listings</span>
      {status === "idle" && (
        <span className="block text-muted-foreground italic">hover to load</span>
      )}
      {status === "loading" && (
        <span className="block space-y-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="block h-3 bg-[#2a1e10] rounded-sm animate-pulse" />
          ))}
        </span>
      )}
      {status === "loaded" && rows.length === 0 && (
        <span className="block text-muted-foreground italic">no current listings</span>
      )}
      {status === "loaded" && rows.length > 0 && (
        <span className="block space-y-1">
          {rows.map((l) => (
            <span key={l.listingId} className="flex items-baseline gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${l.isOnline ? "bg-emerald-400" : "bg-zinc-600"}`}
                aria-label={l.isOnline ? "online" : "offline"}
              />
              <a
                href={`https://www.projectdiablo2.com/market/listing/${l.listingId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate hover:underline"
              >
                {l.sellerName}
              </a>
              <span className="tabular-nums text-foreground">{formatPrice(l.priceHr)}</span>
              <span className="tabular-nums text-muted-foreground">il{l.ilvl}</span>
            </span>
          ))}
        </span>
      )}
      {status === "error" && (
        <span className="block text-muted-foreground italic">market unavailable</span>
      )}
    </span>
  );
}
