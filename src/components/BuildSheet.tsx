import type { BuildSheet as BuildSheetData } from "@/lib/shape/buildSheet";

export function BuildSheet({ data }: { data: BuildSheetData }) {
  return (
    <div className="space-y-5">
      {/* Skills */}
      <div className="d2-slot-block">
        <h3 className="d2-sublabel mb-2">Skill frequency</h3>
        {data.skillFrequency.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">— no data —</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.skillFrequency.map((sk, i) => (
                <tr key={sk.name}>
                  <td
                    className={`py-1 ${
                      i < 3 ? "rarity-unique font-semibold" : "text-foreground"
                    }`}
                  >
                    {sk.name}
                  </td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground pl-3">
                    {sk.numOccurrences.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular-nums text-foreground w-14">
                    {sk.pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <hr className="d2-rule" />

      {/* Level distribution */}
      <div className="d2-slot-block">
        <h3 className="d2-sublabel mb-2">Level distribution</h3>
        {data.levelDistribution.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">— no data —</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 text-sm">
            {data.levelDistribution.map((b) => (
              <span
                key={b.level}
                className="px-2 py-0.5 rounded-sm border border-[#3d2817] text-foreground"
              >
                <span className="text-muted-foreground">L</span>
                {b.level}
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold tabular-nums">
                  {b.count.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <hr className="d2-rule" />

      {/* Mercenary */}
      <div className="d2-slot-block">
        <h3 className="d2-sublabel mb-2">Mercenary</h3>
        <div className="text-sm mb-2">
          <span className="text-muted-foreground">Top type: </span>
          <span className="rarity-unique font-semibold">
            {data.mercenary.topType || "—"}
          </span>
        </div>
        {Object.entries(data.mercenary.topItemsBySlot).length > 0 && (
          <div className="space-y-1">
            {Object.entries(data.mercenary.topItemsBySlot).map(
              ([slot, items]) => (
                <div key={slot} className="text-sm flex items-baseline gap-2">
                  <span className="d2-sublabel w-16 shrink-0 text-[10px]">
                    {slot}
                  </span>
                  <span>
                    {items.map((it, i) => (
                      <span key={it.itemName} className="rarity-unique">
                        {i > 0 && (
                          <span className="text-muted-foreground">, </span>
                        )}
                        {it.itemName}{" "}
                        <span className="text-muted-foreground tabular-nums text-xs">
                          ({it.pct.toFixed(0)}%)
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
