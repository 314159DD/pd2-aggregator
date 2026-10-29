import { Button } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { Sparkline } from "@/components/lx/Sparkline";
import { formatCount, formatPct } from "@/lib/builds/format";
import { classIconUrl } from "@/lib/builds/item-art";
import type { BuildShareHistory } from "@/lib/builds/types";
import { CLASS_NAMES } from "@/lib/builds/url-state";
import { cn } from "@/lib/utils";

const DAYS = 14;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const pctText = (v: number) => `${Math.round(v)}%`;

type Series = { values: number[]; xs: number[]; span: number };

/** Daily share of one class for the last 14 days with data, positioned by calendar day. */
function seriesFor(history: BuildShareHistory | null, cls: string): Series | null {
  if (!history) return null;
  const pts = history.days
    .filter((d) => d.total > 0 && Number.isFinite(dayNum(d.day)))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-DAYS)
    .map((d) => ({ x: dayNum(d.day), v: ((d.classes[cls] ?? 0) / d.total) * 100 }));
  if (pts.length < 2) return null;
  return { values: pts.map((p) => p.v), xs: pts.map((p) => p.x), span: Math.round(pts[pts.length - 1].x - pts[0].x) + 1 };
}

export function ClassShare({
  breakdown,
  selected,
  history,
  onToggle,
  onClear,
}: {
  breakdown: Record<string, number>;
  selected: string[];
  history: BuildShareHistory | null;
  onToggle: (cls: string) => void;
  onClear: () => void;
}) {
  const total = breakdown.total ?? 0;
  const ranked = [...CLASS_NAMES]
    .map((name) => ({ name, count: breakdown[name] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Class share</h2>
        <Button size="sm" variant={selected.length === 0 ? "primary" : "secondary"} aria-pressed={selected.length === 0} onClick={onClear}>
          All classes <span className="font-mono tabular-nums">{formatCount(total)}</span>
        </Button>
      </div>

      <div className="well mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full p-0.5" aria-hidden>
        {ranked.map((c, rank) =>
          c.count > 0 ? (
            <div
              key={c.name}
              title={c.name}
              className="h-full min-w-1 rounded-full transition-[width] duration-(--dauer-feder) ease-(--feder-glatt)"
              style={{
                width: `${share(c.count)}%`,
                background: `color-mix(in oklab, var(--glow) ${100 - 10 * rank}%, transparent)`,
                boxShadow: selected.includes(c.name) ? "inset 0 0 0 1.5px var(--accent-text)" : undefined,
              }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ranked.map((c) => {
          const on = selected.includes(c.name);
          const s = seriesFor(history, c.name);
          return (
            <li key={c.name}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(c.name)}
                className={cn(
                  "well drueckbar hebbar flex h-full w-full flex-col items-start gap-2 rounded-[var(--radius-box)] p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
                  on && "outline-2 -outline-offset-2 outline-accent-text",
                )}
              >
                <span className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={classIconUrl(c.name)} alt="" width={28} height={28} className="size-7 rounded-full object-cover" />
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                </span>
                <span className="flex items-baseline gap-2 font-mono text-xs tabular-nums">
                  <span className="text-sm text-ink">{formatPct(share(c.count))}</span>
                  <span className="text-muted-ink">{formatCount(c.count)}</span>
                </span>
                <span className="h-5">
                  {s && (
                    <Sparkline
                      values={s.values}
                      xs={s.xs}
                      label={`${c.name} share over ${s.span} days, ${pctText(s.values[0])} to ${pctText(s.values[s.values.length - 1])}`}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
