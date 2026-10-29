"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

type Stats = {
  heartbeatAt: string | null;
  characters: { softcore: number; hardcore: number };
};

const STALE_MS = 10 * 60_000;
const nf = new Intl.NumberFormat("en-US");

function ago(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}h ago` : `${min}m ago`;
}

/** Old header line: "● LIVE · 3M AGO" from /stats; gold dot and "STALE" after 10 minutes. */
export function Freshness() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/stats`)
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .then((d) => {
        if (!cancelled && d) setStats(d);
      })
      .catch(() => {});
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  if (!stats?.heartbeatAt) return null;
  const age = now - new Date(stats.heartbeatAt).getTime();
  const stale = age > STALE_MS;
  const total = stats.characters.softcore + stats.characters.hardcore;

  return (
    <p
      data-stale={stale ? "" : undefined}
      title={`${nf.format(total)} characters`}
      className="text-xs tracking-widest text-muted-ink uppercase tabular-nums"
    >
      <span aria-hidden className={cn(stale ? "rarity-unique" : "rarity-set")}>
        ●
      </span>{" "}
      {stale ? "stale" : "live"} <span aria-hidden>·</span> {ago(age)}
    </p>
  );
}
