"use client";

import { useState } from "react";
import { Button } from "@/components/lx/Button";
import { Segment } from "@/components/lx/Segment";
import { formatCount, formatPct } from "@/lib/builds/format";
import { acrossSlots } from "@/lib/meta/across-slots";
import { META_SLOTS, type AffixSlot, type MetaSlot } from "@/lib/meta/types";
import { Empty, MetaCard, cap, fin } from "./shared";

const TOP = 8;

const num = (v: number): string => {
  const n = fin(v);
  return Number.isInteger(n) ? formatCount(n) : n.toFixed(1);
};

export function AffixCard({ data }: { data: Record<MetaSlot, AffixSlot> }) {
  const [view, setView] = useState<"slot" | "all">("slot");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (slot: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (!n.delete(slot)) n.add(slot);
      return n;
    });
  const across = acrossSlots(data ?? ({} as Record<MetaSlot, AffixSlot>));
  return (
    <MetaCard
      title="Most common affixes"
      caption="Magic, rare and crafted items only."
      className="lg:col-span-7"
      action={
        <Segment
          ariaLabel="Affix view"
          value={view}
          onChange={(v) => setView(v as "slot" | "all")}
          items={[
            { value: "slot", label: "By slot" },
            { value: "all", label: "All slots" },
          ]}
        />
      }
    >
      {view === "slot" ? (
        <div className="flex flex-col gap-5">
          {META_SLOTS.map((slot) => {
            const g = data?.[slot] ?? { items: 0, mods: [] };
            return (
              <section key={slot} aria-label={cap(slot)} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-ink">{`${cap(slot)} · ${formatCount(fin(g.items))} items`}</h3>
                {g.mods.length === 0 ? (
                  <Empty>No magic, rare or crafted items in this slot.</Empty>
                ) : (
                  <div className="mat-thick overflow-x-auto rounded-2xl">
                    <table className="tabelle min-w-[30rem]">
                      <thead>
                        <tr>
                          <th scope="col">Affix</th>
                          <th scope="col" className="text-right!">Count</th>
                          <th scope="col" className="text-right!">Share</th>
                          <th scope="col" className="text-right!">Median</th>
                          <th scope="col" className="text-right!">P75</th>
                        </tr>
                      </thead>
                      <tbody className="kaskade-zeilen">
                        {(open.has(slot) ? g.mods : g.mods.slice(0, TOP)).map((m) => (
                          <tr key={m.modName}>
                            <td className="text-ink">{m.displayLabel}</td>
                            <td className="text-right font-mono text-xs text-ink-soft tabular-nums">{formatCount(fin(m.count))}</td>
                            <td className="text-right font-mono text-xs text-ink tabular-nums">{formatPct(fin(m.pct) * 100)}</td>
                            <td className="text-right font-mono text-xs text-ink-soft tabular-nums">{num(m.medianValue)}</td>
                            <td className="text-right font-mono text-xs text-ink-soft tabular-nums">{num(m.p75Value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {g.mods.length > TOP && (
                  <Button variant="ghost" size="sm" className="self-start" aria-expanded={open.has(slot)} onClick={() => toggle(slot)}>
                    <span aria-hidden className="aufklapp-pfeil inline-block">{"\u203a"}</span>
                    {open.has(slot) ? "Show top 8" : `Show all ${formatCount(g.mods.length)}`}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      ) : across.mods.length === 0 ? (
        <Empty>No magic, rare or crafted items in this cohort.</Empty>
      ) : (
        <div className="mat-thick overflow-x-auto rounded-2xl">
          <table className="tabelle min-w-[24rem]">
            <thead>
              <tr>
                <th scope="col">Affix</th>
                <th scope="col" className="text-right!">Count</th>
                <th scope="col" className="text-right!">% of items</th>
              </tr>
            </thead>
            <tbody>
              {across.mods.map((m) => (
                <tr key={m.modName}>
                  <td className="text-ink">{m.displayLabel}</td>
                  <td className="text-right font-mono text-xs text-ink-soft tabular-nums">{formatCount(fin(m.count))}</td>
                  <td className="text-right font-mono text-xs text-ink tabular-nums">{formatPct(fin(m.pct) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MetaCard>
  );
}
