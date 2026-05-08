import type { CharmsAggregate, CharmModEntry } from "@/lib/aggregate";

export function CharmPanel({ data }: { data: CharmsAggregate }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Avg charms" value={data.avgCount.toFixed(1)} />
        <Stat
          label="Annihilus"
          value={`${(data.annihilus.pct * 100).toFixed(0)}%`}
          rare
        />
        <Stat
          label="Hellfire Torch"
          value={`${(data.torch.pct * 100).toFixed(0)}%`}
          rare
        />
        <Stat
          label="Gheed's Fortune"
          value={`${(data.gheeds.pct * 100).toFixed(0)}%`}
          rare
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <ModList title="Top Grand Charm mods" mods={data.topGcMods} />
        <ModList title="Top Small Charm mods" mods={data.topScMods} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  rare,
}: {
  label: string;
  value: string;
  rare?: boolean;
}) {
  return (
    <div className="d2-panel rounded-sm p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-xl font-semibold tabular-nums mt-1 ${
          rare ? "rarity-unique" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ModList({ title, mods }: { title: string; mods: CharmModEntry[] }) {
  return (
    <div>
      <h4 className="d2-title text-sm mb-2">{title}</h4>
      {mods.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">— No data —</p>
      ) : (
        <table className="d2-table w-full text-sm">
          <tbody>
            {mods.slice(0, 10).map((m) => (
              <tr key={m.modName}>
                <td className="py-1.5">{m.displayLabel}</td>
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
