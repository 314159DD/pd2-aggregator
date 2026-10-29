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

/** Dot plus "updated 3m ago · 2,906 characters" from /stats; warn colour after 10 minutes. */
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
      className={cn(
        "hidden items-center gap-2 text-xs md:inline-flex",
        stale ? "text-warn" : "text-muted-ink",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", stale ? "bg-warn" : "bg-ok")} />
      <span>
        updated {ago(age)} <span aria-hidden>·</span>{" "}
        <span className="font-mono tabular-nums">{nf.format(total)}</span> characters
      </span>
    </p>
  );
}
