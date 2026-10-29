import { formatCount, formatPct } from "@/lib/builds/format";
import type { CharmModEntry, CharmsAggregate } from "@/lib/meta/types";
import { Empty, MetaCard, fin } from "./shared";

function Tile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="well flex flex-col gap-0.5 rounded-xl px-3 py-2">
      <span className="text-xs text-muted-ink">{label}</span>
      <span className="font-mono text-base text-ink tabular-nums">{value}</span>
      {caption && <span className="text-[11px] text-muted-ink">{caption}</span>}
    </div>
  );
}

function ModList({ title, rows }: { title: string; rows: CharmModEntry[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <Empty>No charms in this cohort.</Empty>
      ) : (
        <ul className="flex flex-col">
          {rows.map((m) => (
            <li key={m.modName} className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] py-2 first:border-t-0">
              <span className="min-w-0 truncate text-sm text-ink">{m.displayLabel}</span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="font-mono text-xs text-ink-soft tabular-nums">{formatCount(fin(m.count))}</span>
                <span className="min-w-12 text-right font-mono text-sm text-ink tabular-nums">{formatPct(fin(m.pct) * 100)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CharmsCard({ data }: { data: CharmsAggregate }) {
  const tile = (label: string, v: { count: number; pct: number } | undefined) => (
    <Tile label={label} value={formatPct(fin(v?.pct) * 100)} caption={`${formatCount(fin(v?.count))} characters`} />
  );
  return (
    <MetaCard title="Charm patterns" className="lg:col-span-5">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Charms per character" value={fin(data?.avgCount).toFixed(1)} />
        {tile("Annihilus", data?.annihilus)}
        {tile("Hellfire Torch", data?.torch)}
        {tile("Gheed's Fortune", data?.gheeds)}
      </div>
      <ModList title="Grand charms" rows={data?.topGcMods ?? []} />
      <ModList title="Small and large charms" rows={data?.topScMods ?? []} />
    </MetaCard>
  );
}
