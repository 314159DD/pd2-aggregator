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

const CATEGORY_COLOR: Record<string, string> = {
  skill: "text-violet-700",
  resist: "text-amber-700",
  stat: "text-blue-700",
  damage: "text-rose-700",
  speed: "text-emerald-700",
  leech: "text-fuchsia-700",
  utility: "text-teal-700",
  defense: "text-slate-700",
  proc: "text-orange-700",
  other: "text-muted-foreground",
};

export function AffixFrequencyTable({ data }: { data: AffixModsBySlot }) {
  return (
    <div className="space-y-4">
      {SLOT_ORDER.map((slot) => {
        const mods = data[slot];
        if (!mods || mods.length === 0) {
          return (
            <div key={slot}>
              <h3 className="font-semibold capitalize mb-1">{slot}</h3>
              <p className="text-sm text-muted-foreground">
                No rare/magic/crafted items in this slot.
              </p>
            </div>
          );
        }
        return (
          <div key={slot}>
            <h3 className="font-semibold capitalize mb-1">{slot}</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="font-normal">Mod</th>
                  <th className="font-normal text-right">%</th>
                  <th className="font-normal text-right">Median</th>
                  <th className="font-normal text-right">P75</th>
                </tr>
              </thead>
              <tbody>
                {mods.slice(0, 12).map((m, i) => (
                  <tr key={m.modName} className="border-t">
                    <td
                      className={`py-1 ${CATEGORY_COLOR[m.category] ?? ""} ${
                        i < 5 ? "font-semibold" : ""
                      }`}
                    >
                      {m.displayLabel}
                    </td>
                    <td className="text-right tabular-nums">
                      {(m.pct * 100).toFixed(0)}%
                    </td>
                    <td className="text-right tabular-nums">
                      {m.medianValue ? m.medianValue.toFixed(0) : "-"}
                    </td>
                    <td className="text-right tabular-nums">
                      {m.p75Value ? m.p75Value.toFixed(0) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
