import type { AffixModsBySlot, AffixMod, AvgStat } from "@/lib/aggregate";

// Meta-flags in PD2 that appear as modifiers but are not rollable mods.
// Filter them out of all affix displays.
const META_FLAG_LABELS = new Set(["corrupted", "desecrated", "mirrored"]);

function isMetaFlag(displayLabel: string): boolean {
  return META_FLAG_LABELS.has(displayLabel.toLowerCase().trim());
}

const SLOT_ORDER = [
  "weapon",
  "offhand",
  "helm",
  "armor",
  "gloves",
  "belt",
  "boots",
  "amulet",
  "ring",
] as const;

type AcrossSlotsRow = {
  modName: string;
  displayLabel: string;
  count: number;
  pct: number; // 0..1
};

function aggregateAcrossSlots(data: AffixModsBySlot): {
  totalItems: number;
  mods: AcrossSlotsRow[];
} {
  let totalItems = 0;
  const counts = new Map<string, { displayLabel: string; count: number }>();

  for (const slot of SLOT_ORDER) {
    const mods = data[slot];
    if (!mods || mods.length === 0) continue;
    // Derive items-in-slot from any mod with non-zero pct: itemsInSlot = count / pct
    const sample = mods.find((m) => m.pct > 0 && m.count > 0);
    if (sample) {
      totalItems += sample.count / sample.pct;
    }
    for (const m of mods) {
      if (isMetaFlag(m.displayLabel)) continue;
      const cur = counts.get(m.modName) ?? {
        displayLabel: m.displayLabel,
        count: 0,
      };
      cur.count += m.count;
      counts.set(m.modName, cur);
    }
  }

  const allMods: AcrossSlotsRow[] = [...counts.entries()]
    .map(([modName, v]) => ({
      modName,
      displayLabel: v.displayLabel,
      count: v.count,
      pct: totalItems > 0 ? v.count / totalItems : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalItems: Math.round(totalItems), mods: allMods };
}

export function AffixFrequencyTable({
  data,
  avgStats = [],
}: {
  data: AffixModsBySlot;
  avgStats?: AvgStat[];
}) {
  const summary = aggregateAcrossSlots(data);
  const visibleAvgStats = avgStats.filter((s) => s.charsWithMod > 0);

  return (
    <div className="space-y-5">
      {/* Average build stats block */}
      {visibleAvgStats.length > 0 && (
        <>
          <div>
            <h3 className="d2-sublabel mb-2">Average build stats</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {visibleAvgStats.map((s) => (
                <div
                  key={s.modName}
                  className="rounded-sm border border-[#3d2817] px-3 py-2"
                >
                  <div className="d2-sublabel text-[10px] mb-0.5">
                    {s.displayLabel}
                  </div>
                  <div className="text-xl font-semibold tabular-nums rarity-unique">
                    {s.avgValue.toFixed(
                      s.modName.includes("hp") || s.modName.includes("mana")
                        ? 0
                        : 1,
                    )}
                    {s.suffix}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    {(s.pctOfChars * 100).toFixed(0)}% of chars
                  </div>
                </div>
              ))}
            </div>
          </div>
          <hr className="d2-rule" />
        </>
      )}

      {/* Cross-slot summary */}
      {summary.mods.length > 0 && (
        <div className="d2-slot-block" style={{ borderLeftColor: "#c9a04b" }}>
          <h3 className="d2-sublabel mb-2">
            All slots combined{" "}
            <span className="text-muted-foreground/60 normal-case tracking-normal text-[10px] font-normal">
              (n={summary.totalItems.toLocaleString()} rolled items)
            </span>
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                <th className="font-normal text-left pb-1">Mod</th>
                <th className="font-normal text-right pb-1 w-14">%</th>
                <th className="font-normal text-right pb-1 w-14">Count</th>
              </tr>
            </thead>
            <tbody>
              {summary.mods.slice(0, 15).map((m, i) => (
                <tr key={m.modName}>
                  <td
                    className={`py-1 ${
                      i < 5
                        ? "rarity-unique font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {m.displayLabel}
                  </td>
                  <td className="py-1 text-right tabular-nums text-foreground">
                    {(m.pct * 100).toFixed(0)}%
                  </td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">
                    {m.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-slot breakdown */}
      <hr className="d2-rule" />
      <div className="d2-sublabel text-muted-foreground/70">By slot</div>

      <div className="space-y-5">
        {SLOT_ORDER.map((slot, idx) => {
          const mods = data[slot];
          // Filter meta-flags from per-slot display
          const filteredMods = mods
            ? mods.filter((m) => !isMetaFlag(m.displayLabel))
            : null;
          return (
            <div key={slot}>
              {idx > 0 && <hr className="d2-rule mb-5" />}
              <div className="d2-slot-block">
                <h3 className="d2-sublabel mb-2">{slot}</h3>
                {!filteredMods || filteredMods.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    — no rare/magic/crafted items —
                  </p>
                ) : (
                  <SlotTable mods={filteredMods} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotTable({ mods }: { mods: AffixMod[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          <th className="font-normal text-left pb-1">Mod</th>
          <th className="font-normal text-right pb-1 w-14">%</th>
          <th className="font-normal text-right pb-1 w-14">Med</th>
          <th className="font-normal text-right pb-1 w-14">P75</th>
        </tr>
      </thead>
      <tbody>
        {mods.slice(0, 12).map((m, i) => (
          <tr key={m.modName}>
            <td
              className={`py-1 ${
                i < 3 ? "rarity-unique font-semibold" : "text-foreground"
              }`}
            >
              {m.displayLabel}
            </td>
            <td className="py-1 text-right tabular-nums text-foreground">
              {(m.pct * 100).toFixed(0)}%
            </td>
            <td className="py-1 text-right tabular-nums text-muted-foreground">
              {m.medianValue ? m.medianValue.toFixed(0) : "—"}
            </td>
            <td className="py-1 text-right tabular-nums text-muted-foreground">
              {m.p75Value ? m.p75Value.toFixed(0) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
