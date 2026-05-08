import type { BuildSheet as BuildSheetData } from "@/lib/shape/buildSheet";

export function BuildSheet({ data }: { data: BuildSheetData }) {
  return (
    <div className="space-y-6">
      {/* Skills */}
      <div>
        <h3 className="font-semibold mb-1">Skill frequency (top 12 of class)</h3>
        {data.skillFrequency.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="font-normal">Skill</th>
                <th className="font-normal text-right">Count</th>
                <th className="font-normal text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {data.skillFrequency.map((sk) => (
                <tr key={sk.name} className="border-t">
                  <td className="py-1">{sk.name}</td>
                  <td className="text-right tabular-nums">{sk.numOccurrences.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{sk.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Level distribution */}
      <div>
        <h3 className="font-semibold mb-1">Level distribution</h3>
        {data.levelDistribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <div className="text-sm flex flex-wrap gap-2">
            {data.levelDistribution.map((b) => (
              <span key={b.level} className="rounded bg-muted px-2 py-0.5">
                L{b.level}: <span className="font-semibold">{b.count.toLocaleString()}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mercenary */}
      <div>
        <h3 className="font-semibold mb-1">Mercenary</h3>
        <div className="text-sm">
          Top type: <span className="font-semibold">{data.mercenary.topType || "—"}</span>
        </div>
        {Object.entries(data.mercenary.topItemsBySlot).length > 0 && (
          <div className="mt-2 space-y-2">
            {Object.entries(data.mercenary.topItemsBySlot).map(([slot, items]) => (
              <div key={slot} className="text-sm">
                <span className="capitalize text-muted-foreground">{slot}:</span>{" "}
                {items.map((it, i) => (
                  <span key={it.itemName}>
                    {i > 0 && ", "}
                    {it.itemName} ({it.pct.toFixed(0)}%)
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
