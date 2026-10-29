import { Bar } from "@/components/lx/Bar";
import { Card } from "@/components/lx/Card";
import { formatHr, formatPct } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { ItemUsageEntry } from "@/lib/builds/types";
import { buildMarketUrl } from "@/lib/price/marketUrl";
import { ItemIcon } from "./ItemIcon";

export function ShoppingList({ items, archive = false }: { items: ItemUsageEntry[]; archive?: boolean }) {
  const top = items.slice(0, 10);
  const sum = top.reduce((s, i) => s + (i.medianHr ?? 0), 0);
  const partial = top.some((i) => i.medianHr === null);

  return (
    <Card className="flex flex-col gap-3 p-5" aria-label="Shopping list">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Shopping list</h2>
        {!archive && (
          <span
            className="font-mono text-sm text-ink tabular-nums"
            title={partial ? "Some items have no price yet" : undefined}
          >
            {`Σ ${formatHr(sum)} HR${partial ? "+" : ""}`}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-soft">
        {archive
          ? "The 10 items most worn by characters matching your filters. Past seasons have no market prices."
          : "The 10 items most worn by characters matching your filters, at current market prices."}
      </p>
      {top.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-soft">No items match these filters.</p>
      ) : (
        <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {top.map((i) => (
            <li key={i.name} className="flex min-w-0 items-center gap-2.5">
              <ItemIcon item={i} />
              <span title={i.name} className={`min-w-0 flex-1 truncate text-sm ${qualityClass(i.itemType)}`}>{i.name}</span>
              <Bar pct={i.pct} className="w-10 shrink-0" />
              <span className="w-9 shrink-0 text-right font-mono text-xs text-ink-soft tabular-nums">{formatPct(i.pct)}</span>
              {!archive && (
                <span className="min-w-[4.5rem] shrink-0 rounded-full bg-well px-2 py-0.5 text-center font-mono text-xs text-ink tabular-nums">
                  {i.medianHr === null ? "n/a" : `${formatHr(i.medianHr)} HR`}
                </span>
              )}
              {!archive && i.medianHr !== null && (
                <a
                  href={buildMarketUrl({ itemType: i.itemType, name: i.name })}
                  target="_blank"
                  rel="noopener"
                  className="shrink-0 text-xs text-accent-text underline-offset-2 hover:underline"
                >
                  Market
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
