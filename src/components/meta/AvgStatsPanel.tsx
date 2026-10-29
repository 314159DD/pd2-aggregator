import type { CoreStat } from "@/lib/meta/types";
import { NoData } from "./Section";
import { formatCount } from "@/lib/builds/format";
import { fin } from "./shared";

export function AvgStatsPanel({ rows }: { rows: CoreStat[] }) {
  if (!rows || rows.length === 0) return <NoData>no stats data</NoData>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {rows.map((s) => (
        <div key={s.key} className="rounded-sm border border-[#3d2817] px-3 py-2 text-center">
          <div className="d2-sublabel text-[10px] mb-0.5">{s.label}</div>
          <div className="text-xl font-semibold tabular-nums rarity-unique">{formatCount(Math.round(fin(s.avg)))}</div>
        </div>
      ))}
    </div>
  );
}
