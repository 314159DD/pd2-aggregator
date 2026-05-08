import type { TopItemsBySlot } from "@/lib/shape/topItems";

const SLOT_ORDER = ["weapon", "offhand", "helm", "armor", "gloves", "belt", "boots", "amulet", "ring"] as const;

export function ItemFrequencyTable({ data }: { data: TopItemsBySlot }) {
  return (
    <div className="space-y-4">
      {SLOT_ORDER.map((slot) => {
        const items = data[slot];
        return (
          <div key={slot}>
            <h3 className="font-semibold capitalize mb-1">{slot}</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fixed-quality items mapped for this slot.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="font-normal">Item</th>
                    <th className="font-normal">Type</th>
                    <th className="font-normal text-right">Count</th>
                    <th className="font-normal text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.itemName} className="border-t">
                      <td className="py-1">{it.itemName}</td>
                      <td className="text-muted-foreground">{it.itemType}</td>
                      <td className="text-right tabular-nums">{it.count.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{it.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
