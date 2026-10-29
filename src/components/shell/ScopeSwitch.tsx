"use client";

import { useEffect, useState } from "react";
import { Segment } from "@/components/lx/Segment";
import { API_BASE } from "@/lib/api";
import { useScope } from "@/lib/builds/scope";

type Season = { season: number; name: string; current: boolean };
type SeasonsResponse = { current: number; seasons: Season[] };

function seasonLabel(s: Season): string {
  return `${s.name} (S${s.season})${s.current ? " · current" : ""}`;
}

/** Season select and Softcore/Hardcore segment; both write into the URL. */
export function ScopeSwitch() {
  const [scope, setScope] = useScope();
  const [data, setData] = useState<SeasonsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/builds/seasons`)
      .then((r) => (r.ok ? (r.json() as Promise<SeasonsResponse>) : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const known = (n: number | null | undefined) => n != null && (data?.seasons ?? []).some((s) => s.season === n);
  const selected = known(scope.season) ? scope.season! : data?.current ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Season"
        value={String(selected)}
        onChange={(e) => setScope({ season: Number(e.target.value) })}
        className="feld h-8 min-h-8 cursor-pointer rounded-full py-0 pr-3 pl-3.5 text-[13px] font-medium"
      >
        {(data?.seasons ?? []).map((s) => (
          <option key={s.season} value={s.season}>
            {seasonLabel(s)}
          </option>
        ))}
        {!data && <option value="">Season</option>}
      </select>
      <Segment
        ariaLabel="Game mode"
        value={scope.gameMode}
        onChange={(v) => setScope({ gameMode: v === "hardcore" ? "hardcore" : "softcore" })}
        items={[
          { value: "softcore", label: "Softcore" },
          { value: "hardcore", label: "Hardcore" },
        ]}
      />
    </div>
  );
}
