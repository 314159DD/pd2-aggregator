import type { CharmsAggregate, CharmModEntry } from "@/lib/aggregate";

export function CharmPanel({ data }: { data: CharmsAggregate }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Avg charms" value={data.avgCount.toFixed(1)} subtitle="per character" />
        <Stat
          label="Annihilus"
          value={String(data.annihilus.count)}
          subtitle="characters"
          gold
        />
        <Stat
          label="Hellfire Torch"
          value={String(data.torch.count)}
          subtitle="characters"
          gold
        />
        <Stat
          label="Gheed's Fortune"
          value={String(data.gheeds.count)}
          subtitle="characters"
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
  subtitle,
  gold,
}: {
  label: string;
  value: string;
  subtitle?: string;
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
      {subtitle && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

function ModList({ mods }: { mods: CharmModEntry[] }) {
  if (mods.length === 0) {
    return <p className="text-sm text-muted-foreground italic">— no data —</p>;
  }
  return (
    <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          <th className="font-normal text-left pb-1">Mod</th>
          <th className="font-normal text-right pb-1 w-14">Count</th>
        </tr>
      </thead>
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
            <td className="py-1 text-right tabular-nums text-foreground w-14">
              {m.count.toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
