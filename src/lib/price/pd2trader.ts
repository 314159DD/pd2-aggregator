"use client";

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

const cache = new Map<string, Promise<HoverPrice>>();

function key(itemName: string, gameMode: "hardcore" | "softcore"): string {
  return `${gameMode}:${itemName}`;
}

function commonParams(gameMode: "hardcore" | "softcore"): URLSearchParams {
  const p = new URLSearchParams();
  p.set("isHardcore", gameMode === "hardcore" ? "true" : "false");
  p.set("isLadder", "true");
  return p;
}

async function fetchAverage(itemName: string, gameMode: "hardcore" | "softcore"): Promise<AveragePrice | null> {
  const p = commonParams(gameMode);
  p.set("itemName", itemName);
  p.set("hours", "168");
  const res = await fetch(`${BASE}/item-prices/average?${p.toString()}`);
  if (!res.ok) return null;
  return res.json() as Promise<AveragePrice>;
}

async function fetchCorruptions(itemName: string, gameMode: "hardcore" | "softcore"): Promise<CorruptionPrice[]> {
  const p = commonParams(gameMode);
  p.set("itemName", itemName);
  const res = await fetch(`${BASE}/item-prices/corruption-prices?${p.toString()}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { corruptionPrices?: CorruptionPrice[] };
  return body.corruptionPrices ?? [];
}

export function fetchHoverPrice(itemName: string, gameMode: "hardcore" | "softcore"): Promise<HoverPrice> {
  const k = key(itemName, gameMode);
  const hit = cache.get(k);
  if (hit) return hit;

  const promise = Promise.all([
    fetchAverage(itemName, gameMode).catch(() => null),
    fetchCorruptions(itemName, gameMode).catch(() => []),
  ]).then(([average, corruptions]) => ({ average, corruptions }));

  cache.set(k, promise);
  promise.catch(() => cache.delete(k));
  return promise;
}
