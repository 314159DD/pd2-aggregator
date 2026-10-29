import { API_BASE } from "@/lib/api";
import type { MarketDemand } from "./demand";

export async function getMarketDemand(
  items: string[],
  days = 7,
  gameMode: "softcore" | "hardcore" = "softcore",
  signal?: AbortSignal,
): Promise<MarketDemand> {
  const p = new URLSearchParams({ items: items.join(","), gameMode, days: String(days) });
  const r = await fetch(`${API_BASE}/market/demand?${p}`, { signal });
  if (!r.ok) throw new Error(`market/demand HTTP ${r.status}`);
  return r.json();
}
