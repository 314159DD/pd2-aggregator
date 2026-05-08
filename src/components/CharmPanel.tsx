import type { CharmsAggregate, CharmModEntry } from "@/lib/aggregate";

export function CharmPanel({ data }: { data: CharmsAggregate }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Avg charms" value={data.avgCount.toFixed(1)} />
        <Stat
          label="Annihilus"
          value={`${(data.annihilus.pct * 100).toFixed(0)}%`}
          gold
        />
        <Stat
          label="Hellfire Torch"
          value={`${(data.torch.pct * 100).toFixed(0)}%`}
          gold
        />
        <Stat
          label="Gheed's Fortune"
          value={`${(data.gheeds.pct * 100).toFixed(0)}%`}
          gold
        />
      </div>

      <hr className="d2-rule" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        <div className="d2-slot-block">
          <h3 className="d2-sublabel mb-2">Grand charm mods</h3>
          <ModList mods={data.topGcMods} />
        </div>
        <div className="d2-slot-block">
          <h3 className="d2-sublabel mb-2">Small charm mods</h3>
          <ModList mods={data.topScMods} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="rounded-sm border border-[#3d2817] px-3 py-2">
      <div className="d2-sublabel text-[10px] mb-0.5">{label}</div>
      <div
        className={`text-xl font-semibold tabular-nums ${
          gold ? "rarity-unique" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ModList({ mods }: { mods: CharmModEntry[] }) {
  if (mods.length === 0) {
    return <p className="text-sm text-muted-foreground italic">— no data —</p>;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {mods.slice(0, 10).map((m, i) => (
          <tr key={m.modName}>
            <td
              className={`py-1 ${
                i < 3 ? "rarity-unique font-semibold" : "text-foreground"
              }`}
            >
              {m.displayLabel}
            </td>
            <td className="py-1 text-right tabular-nums text-foreground w-12">
              {(m.pct * 100).toFixed(0)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
