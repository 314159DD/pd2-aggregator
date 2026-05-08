import type { CharmsAggregate, CharmModEntry } from "@/lib/aggregate";

export function CharmPanel({ data }: { data: CharmsAggregate }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Avg charms" value={data.avgCount.toFixed(1)} />
        <Stat
          label="Annihilus"
          value={`${(data.annihilus.pct * 100).toFixed(0)}%`}
        />
        <Stat
          label="Hellfire Torch"
          value={`${(data.torch.pct * 100).toFixed(0)}%`}
        />
        <Stat
          label="Gheed's Fortune"
          value={`${(data.gheeds.pct * 100).toFixed(0)}%`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <ModList title="Top GC mods" mods={data.topGcMods} />
        <ModList title="Top SC mods" mods={data.topScMods} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ModList({
  title,
  mods,
}: {
  title: string;
  mods: CharmModEntry[];
}) {
  return (
    <div>
      <h4 className="font-semibold mb-1">{title}</h4>
      {mods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {mods.slice(0, 10).map((m) => (
              <tr key={m.modName} className="border-t">
                <td className="py-1">{m.displayLabel}</td>
                <td className="text-right tabular-nums">
                  {(m.pct * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
