import type { AffixModsBySlot } from "@/lib/aggregate";

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

export function AffixFrequencyTable({ data }: { data: AffixModsBySlot }) {
  return (
    <div className="space-y-5">
      {SLOT_ORDER.map((slot, idx) => {
        const mods = data[slot];
        return (
          <div key={slot}>
            {idx > 0 && <hr className="d2-rule mb-5" />}
            <div className="d2-slot-block">
              <h3 className="d2-sublabel mb-2">{slot}</h3>
              {!mods || mods.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  — no rare/magic/crafted items —
                </p>
              ) : (
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
                            i < 3
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
                          {m.medianValue ? m.medianValue.toFixed(0) : "—"}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {m.p75Value ? m.p75Value.toFixed(0) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
