"use client";
import { useEffect, useState } from "react";

export type PriceEntry = {
  type: "Unique" | "Set" | "Runeword";
  uniqueId?: number;
  runewordKey?: string;
  medianHr: number;
  low: number;
  high: number;
  sampleCount: number;
};

type SnapshotFile = {
  generatedAt: string;
  items: Record<string, PriceEntry>;
};

let cache: Map<string, PriceEntry> | null = null;
let inflight: Promise<Map<string, PriceEntry>> | null = null;

function loadSnapshot(): Promise<Map<string, PriceEntry>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/price-snapshot.json")
    .then((r) => {
      if (!r.ok) throw new Error(`price-snapshot.json HTTP ${r.status}`);
      return r.json() as Promise<SnapshotFile>;
    })
    .then((f) => {
      const m = new Map<string, PriceEntry>();
      for (const [name, entry] of Object.entries(f.items)) m.set(name, entry);
      cache = m;
      return m;
    })
    .catch(() => {
      const m = new Map<string, PriceEntry>();
      cache = m;
      return m;
    });
  return inflight;
}

export function usePriceSnapshot(): Map<string, PriceEntry> {
  const [m, setM] = useState<Map<string, PriceEntry>>(cache ?? new Map());
  useEffect(() => {
    let live = true;
    loadSnapshot().then((next) => {
      if (live) setM(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return m;
}
