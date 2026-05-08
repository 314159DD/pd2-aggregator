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

// D2-flavored category colors that pop on dark parchment.
const CATEGORY_COLOR: Record<string, string> = {
  skill: "text-[#d4a8ff]",       // arcane violet (skill bonuses)
  resist: "text-[#ffaa3a]",      // gold-orange resist
  stat: "text-[#7d8cff]",        // magic-blue for raw stats
  damage: "text-[#ff6464]",      // blood red
  speed: "text-[#62e88c]",       // emerald speed
  leech: "text-[#ff8acd]",       // life-leech pink
  utility: "text-[#ffd47a]",     // utility gold
  defense: "text-[#a0b8c8]",     // steel
  proc: "text-[#ff9a3a]",        // proc orange
  other: "text-muted-foreground",
};

export function AffixFrequencyTable({ data }: { data: AffixModsBySlot }) {
  return (
    <div className="space-y-5">
      {SLOT_ORDER.map((slot) => {
        const mods = data[slot];
        if (!mods || mods.length === 0) {
          return (
            <div key={slot}>
              <h3 className="d2-title text-base mb-2">{slot}</h3>
              <p className="text-sm text-muted-foreground italic">
                — No rare/magic/crafted items in this slot —
              </p>
            </div>
          );
        }
        return (
          <div key={slot}>
            <h3 className="d2-title text-base mb-2">{slot}</h3>
            <table className="d2-table w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Mod</th>
                  <th className="text-right">%</th>
                  <th className="text-right">Median</th>
                  <th className="text-right">P75</th>
                </tr>
              </thead>
              <tbody>
                {mods.slice(0, 12).map((m, i) => (
                  <tr key={m.modName}>
                    <td
                      className={`py-1.5 ${CATEGORY_COLOR[m.category] ?? ""} ${
                        i < 5 ? "font-semibold" : ""
                      }`}
                    >
                      {m.displayLabel}
                    </td>
                    <td className="text-right tabular-nums text-foreground">
                      {(m.pct * 100).toFixed(0)}%
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {m.medianValue ? m.medianValue.toFixed(0) : "-"}
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">
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
