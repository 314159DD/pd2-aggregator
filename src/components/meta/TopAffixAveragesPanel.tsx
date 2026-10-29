import type { AvgStat } from "@/lib/meta/types";
import { fin } from "./shared";

/** Cross-slot affix averages: what a typical character of the cohort has summed across all gear. */
export function TopAffixAveragesPanel({ rows, topN = 8 }: { rows: AvgStat[]; topN?: number }) {
  const visible = (rows ?? []).filter((s) => s.charsWithMod > 0).slice(0, topN);
  if (visible.length === 0) return null;
  return (
    <div>
      <h3 className="d2-sublabel mb-2">Most common affixes</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visible.map((s) => {
          const decimals = s.modName.includes("hp") || s.modName.includes("mana") ? 0 : 1;
          return (
            <div key={s.modName} className="rounded-sm border border-[#3d2817] px-3 py-2 text-center">
              <div className="d2-sublabel text-[10px] mb-0.5 truncate">{s.displayLabel}</div>
              <div className="text-xl font-semibold tabular-nums rarity-unique">
                {fin(s.avgValue).toFixed(decimals)}
                {s.suffix}
              </div>
              <div className="text-[10px] text-muted-ink tabular-nums mt-0.5">{(fin(s.pctOfChars) * 100).toFixed(0)}% of chars</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
