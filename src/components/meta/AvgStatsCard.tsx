import { formatCount, formatPct } from "@/lib/builds/format";
import type { AvgStat, CoreStat } from "@/lib/meta/types";
import { Empty, MetaCard, fin } from "./shared";

function statValue(v: number): string {
  const n = fin(v);
  return Math.abs(n) < 10 ? n.toFixed(1) : formatCount(Math.round(n));
}

export function AvgStatsCard({ core, avg }: { core: CoreStat[]; avg: AvgStat[] }) {
  return (
    <MetaCard title="Average build stats" className="lg:col-span-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(core ?? []).map((c) => (
          <div key={c.key} className="well flex flex-col gap-0.5 rounded-xl px-3 py-2">
            <span className="text-xs text-muted-ink">{c.label}</span>
            <span className="font-mono text-base text-ink tabular-nums">{formatCount(Math.round(fin(c.avg)))}</span>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-semibold text-ink">Top stats from gear and charms</h3>
      {!avg || avg.length === 0 ? (
        <Empty>No gear stats for this cohort.</Empty>
      ) : (
        <ul className="flex flex-col">
          {(avg ?? []).map((s) => (
            <li key={s.modName} className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] py-2 first:border-t-0">
              <span className="min-w-0 truncate text-sm text-ink">{s.displayLabel}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="font-mono text-sm text-ink tabular-nums">
                  {statValue(s.avgValue)}
                  {s.suffix}
                </span>
                <span className="text-xs text-muted-ink">on {formatPct(fin(s.pctOfChars) * 100)} of characters</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </MetaCard>
  );
}
