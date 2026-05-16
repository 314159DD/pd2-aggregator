"use client";
import { useEffect, useState } from "react";

const BASE = "https://pd2trader.com";

export type AveragePrice = {
  itemName: string;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  movingAverage7Days: number;
  sampleCount: number;
  priceChange7Days?: { change: number; changePercent: number; previousMedianPrice: number };
};

export type CorruptionPrice = {
  corruptionName: string;
  averagePrice: number;
  medianPrice: number;
  sampleCount: number;
  socketPrices?: {
    socketCount: number;
    averagePrice: number;
    medianPrice: number;
    sampleCount: number;
  }[];
};

export type HoverPrice = {
  average: AveragePrice | null;
  corruptions: CorruptionPrice[];
};

const averageCache = new Map<string, Promise<AveragePrice | null>>();
const corruptionCache = new Map<string, Promise<CorruptionPrice[]>>();

function key(itemName: string, gameMode: "hardcore" | "softcore"): string {
  return `${gameMode}:${itemName}`;
}

function commonParams(gameMode: "hardcore" | "softcore"): URLSearchParams {
  const p = new URLSearchParams();
  p.set("isHardcore", gameMode === "hardcore" ? "true" : "false");
  p.set("isLadder", "true");
  return p;
}

export function fetchAveragePrice(itemName: string, gameMode: "hardcore" | "softcore"): Promise<AveragePrice | null> {
  const k = key(itemName, gameMode);
  const hit = averageCache.get(k);
  if (hit) return hit;

  const p = commonParams(gameMode);
  p.set("itemName", itemName);
  p.set("hours", "168");
  const promise = fetch(`${BASE}/item-prices/average?${p.toString()}`)
    .then((r) => (r.ok ? (r.json() as Promise<AveragePrice>) : null))
    .catch(() => null);

  averageCache.set(k, promise);
  return promise;
}

function fetchCorruptions(itemName: string, gameMode: "hardcore" | "softcore"): Promise<CorruptionPrice[]> {
  const k = key(itemName, gameMode);
  const hit = corruptionCache.get(k);
  if (hit) return hit;

  const p = commonParams(gameMode);
  p.set("itemName", itemName);
  const promise = fetch(`${BASE}/item-prices/corruption-prices?${p.toString()}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ corruptionPrices?: CorruptionPrice[] }>) : { corruptionPrices: [] }))
    .then((body) => body.corruptionPrices ?? [])
    .catch(() => []);

  corruptionCache.set(k, promise);
  return promise;
}

export function fetchHoverPrice(itemName: string, gameMode: "hardcore" | "softcore"): Promise<HoverPrice> {
  return Promise.all([
    fetchAveragePrice(itemName, gameMode),
    fetchCorruptions(itemName, gameMode),
  ]).then(([average, corruptions]) => ({ average, corruptions }));
}

export const RUNE_NAMES = [
  "El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul",
  "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem",
  "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber",
  "Jah", "Cham", "Zod",
] as const;

// Waits for all 33 rune /average requests to resolve before publishing the
// map — partial state would let computeRunewordCost emit a too-low sum that
// jumps upward as each rune lands, which reads as a UI flicker.
export function useRunePrices(
  gameMode: "hardcore" | "softcore",
): { prices: Map<string, number>; loaded: boolean } {
  const [state, setState] = useState<{ prices: Map<string, number>; loaded: boolean }>(
    { prices: new Map(), loaded: false },
  );

  useEffect(() => {
    let cancelled = false;
    setState({ prices: new Map(), loaded: false });
    Promise.all(
      RUNE_NAMES.map((rune) =>
        fetchAveragePrice(`${rune} Rune`, gameMode).then((p) => ({
          rune,
          price: p?.medianPrice ?? null,
        })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const m = new Map<string, number>();
      for (const { rune, price } of results) {
        if (price != null) m.set(rune, price);
      }
      setState({ prices: m, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, [gameMode]);

  return state;
}

// Hook for batch inline-column lookups. Fires one /average request per name
// (deduped at module level by fetchAveragePrice), returns a Map keyed by name.
// Browser caps concurrent requests to the same origin at ~6, so larger tables
// naturally throttle without us doing anything.
export function useLivePrices(
  names: string[],
  gameMode: "hardcore" | "softcore",
): Map<string, AveragePrice | null> {
  const namesKey = names.join("|");
  const [prices, setPrices] = useState<Map<string, AveragePrice | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const next = new Map<string, AveragePrice | null>();
    for (const name of names) {
      fetchAveragePrice(name, gameMode).then((p) => {
        if (cancelled) return;
        next.set(name, p);
        setPrices(new Map(next));
      });
    }
    return () => {
      cancelled = true;
    };
    // names is stabilized through namesKey to avoid refetching on reference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, gameMode]);

  return prices;
}
