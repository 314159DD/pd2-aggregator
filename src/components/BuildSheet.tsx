import type { BuildSheet as BuildSheetData } from "@/lib/shape/buildSheet";

export function BuildSheet({ data }: { data: BuildSheetData }) {
  return (
    <div className="space-y-6">
      {/* Skills */}
      <div>
        <h3 className="d2-title text-base mb-2">Skill frequency</h3>
        {data.skillFrequency.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">— No data —</p>
        ) : (
          <table className="d2-table w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Skill</th>
                <th className="text-right">Count</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {data.skillFrequency.map((sk, i) => (
                <tr key={sk.name}>
                  <td
                    className={`py-1.5 ${
                      i < 3 ? "rarity-unique font-semibold" : "text-foreground"
                    }`}
                  >
                    {sk.name}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {sk.numOccurrences.toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums text-foreground">
                    {sk.pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Level distribution */}
      <div>
        <h3 className="d2-title text-base mb-2">Level distribution</h3>
        {data.levelDistribution.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">— No data —</p>
        ) : (
          <div className="text-sm flex flex-wrap gap-2">
            {data.levelDistribution.map((b) => (
              <span
                key={b.level}
                className="d2-panel rounded-sm px-2.5 py-1"
              >
                <span className="text-muted-foreground">L{b.level}</span>{" "}
                <span className="font-semibold tabular-nums">
                  {b.count.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mercenary */}
      <div>
        <h3 className="d2-title text-base mb-2">Mercenary</h3>
        <div className="text-sm">
          <span className="text-muted-foreground">Top type: </span>
          <span className="rarity-unique font-semibold">
            {data.mercenary.topType || "—"}
          </span>
        </div>
        {Object.entries(data.mercenary.topItemsBySlot).length > 0 && (
          <div className="mt-3 space-y-1.5">
            {Object.entries(data.mercenary.topItemsBySlot).map(
              ([slot, items]) => (
                <div key={slot} className="text-sm">
                  <span className="capitalize text-muted-foreground uppercase tracking-wider text-xs">
                    {slot}:
                  </span>{" "}
                  {items.map((it, i) => (
                    <span key={it.itemName} className="rarity-unique">
                      {i > 0 && (
                        <span className="text-muted-foreground">, </span>
                      )}
                      {it.itemName}{" "}
                      <span className="text-muted-foreground tabular-nums">
                        ({it.pct.toFixed(0)}%)
                      </span>
                    </span>
                  ))}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
