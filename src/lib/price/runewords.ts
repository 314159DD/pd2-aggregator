"use client";
import { useEffect, useState } from "react";

let cache: Record<string, string[]> | null = null;
let inflight: Promise<Record<string, string[]>> | null = null;

function load(): Promise<Record<string, string[]>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/runeword-runes.json")
    .then((r) => {
      if (!r.ok) throw new Error(`runeword-runes.json HTTP ${r.status}`);
      return r.json() as Promise<Record<string, string[]>>;
    })
    .then((j) => {
      cache = j;
      return j;
    })
    .catch(() => {
      cache = {};
      return cache;
    });
  return inflight;
}

export function useRunewordRecipes(): Record<string, string[]> {
  const [recipes, setRecipes] = useState<Record<string, string[]>>(cache ?? {});
  useEffect(() => {
    let live = true;
    load().then((next) => {
      if (live) setRecipes(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return recipes;
}

export function computeRunewordCost(
  recipe: string[],
  runePrices: Map<string, number>,
): number | null {
  let total = 0;
  for (const rune of recipe) {
    const p = runePrices.get(rune);
    if (p == null) return null;
    total += p;
  }
  return Math.round(total * 100) / 100;
}
