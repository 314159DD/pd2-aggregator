"use client";
import { useEffect, useState } from "react";

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
