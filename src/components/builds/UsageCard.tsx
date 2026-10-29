"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { SearchField } from "@/components/lx/SearchField";
import { formatCount, formatPct } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { ItemUsageEntry, MercUsageEntry, UsageEntry } from "@/lib/builds/types";

type Entry = UsageEntry | ItemUsageEntry | MercUsageEntry;

type Props<E extends Entry> = {
  title: "Skills" | "Items" | "Mercenary" | "Merc items";
  entries: E[];
  selected: string[];
  onToggle: (name: string) => void;
  icon?: (e: E) => ReactNode;
};

const TOP = 8;

export function UsageCard<E extends Entry>({ title, entries, selected, onToggle, icon }: Props<E>) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const rows = all || q ? matches : matches.slice(0, TOP);
  const canToggle = !q && entries.length > TOP;
  const noun = title.toLowerCase();

  return (
    <Card className="flex flex-col gap-3 p-5" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <span className="font-mono text-xs text-ink-soft tabular-nums">{formatCount(entries.length)}</span>
      </div>
      <SearchField
        placeholder={`Search ${formatCount(entries.length)} ${noun}...`}
        aria-label={`Search ${noun}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-soft">No matches</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((e) => {
            const on = selected.includes(e.name);
            const itemType = "itemType" in e ? e.itemType : null;
            const act = "act" in e ? e.act : null;
            return (
              <li key={e.name}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(e.name)}
                  className="drueckbar relative flex min-h-9 w-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-1 text-left text-sm outline-none hover:bg-well focus-visible:outline-2 focus-visible:outline-accent-text"
                  style={on ? { boxShadow: "inset 2px 0 0 var(--accent-text)" } : undefined}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0"
                    style={{ width: `${Number.isFinite(e.pct) ? Math.min(100, Math.max(0, e.pct)) : 0}%`, background: "color-mix(in oklab, var(--glow) 18%, transparent)" }}
                  />
                  {icon && <span className="relative shrink-0">{icon(e)}</span>}
                  <span className="relative flex min-w-0 flex-1 flex-col">
                    <span className={`truncate ${itemType ? qualityClass(itemType) : "text-ink"}`}>{e.name}</span>
                    {act !== null && <span className="text-[11px] text-ink-soft">Act {act}</span>}
                  </span>
                  <span className="relative font-mono text-xs text-ink-soft tabular-nums">{formatPct(e.pct)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {canToggle && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? "Show top 8" : `Show all ${formatCount(entries.length)}`}
        </Button>
      )}
    </Card>
  );
}
