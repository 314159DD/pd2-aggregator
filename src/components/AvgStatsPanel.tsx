import type { CoreStat } from "@/lib/aggregate";

export function AvgStatsPanel({ rows }: { rows: CoreStat[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">— no stats data —</p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {rows.map((s) => (
        <div
          key={s.key}
          className="rounded-sm border border-[#3d2817] px-3 py-2 text-center"
        >
          <div className="d2-sublabel text-[10px] mb-0.5">{s.label}</div>
          <div className="text-xl font-semibold tabular-nums rarity-unique">
            {Math.round(s.avg).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
