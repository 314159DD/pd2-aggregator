"use client";
import { parsePriceHr } from "./parse";
import type { PriceEntry } from "./snapshot";

export type Listing = {
  listingId: string;
  sellerName: string;
  priceHr: number;
  ilvl: number;
  isOnline: boolean;
};

type RawListing = {
  _id: string;
  price?: string;
  item?: { item_level?: number; account_id?: string };
  user_last_online?: string;
};

type RawPage = { total: number; data: RawListing[] };

// Five-minute online window matches the proxy cache TTL; anything older
// is unlikely to respond to whispers anyway.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const cache = new Map<string, Promise<Listing[]>>();

function cacheKey(entry: PriceEntry, name: string): string {
  if (entry.type === "Unique") return `u:${entry.uniqueId}`;
  if (entry.type === "Runeword") return `r:${entry.runewordKey}`;
  return `s:${name}`;
}

function buildProxyUrl(entry: PriceEntry, name: string): string {
  const p = new URLSearchParams();
  p.set("$limit", "5");
  p.set("$sort[price]", "1");
  if (entry.type === "Unique" && entry.uniqueId != null) {
    p.set("item.unique.id", String(entry.uniqueId));
  } else if (entry.type === "Runeword" && entry.runewordKey) {
    p.set("item.is_runeword", "true");
    p.set("item.runeword.key", entry.runewordKey);
  } else {
    p.set("item.quality.name", "Set");
    p.set("item.name", name);
  }
  return `/api/market?${p.toString()}`;
}

export function fetchListings(entry: PriceEntry, name: string): Promise<Listing[]> {
  const key = cacheKey(entry, name);
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = fetch(buildProxyUrl(entry, name))
    .then((r) => {
      if (!r.ok) throw new Error(`market HTTP ${r.status}`);
      return r.json() as Promise<RawPage>;
    })
    .then((page) => {
      const now = Date.now();
      const rows: Listing[] = [];
      for (const raw of page.data) {
        const price = parsePriceHr(raw.price);
        if (price === null) continue;
        const onlineMs = raw.user_last_online
          ? now - new Date(raw.user_last_online).getTime()
          : Infinity;
        rows.push({
          listingId: raw._id,
          sellerName: raw.item?.account_id ?? "unknown",
          priceHr: price,
          ilvl: raw.item?.item_level ?? 0,
          isOnline: onlineMs < ONLINE_WINDOW_MS,
        });
      }
      return rows;
    });

  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}
