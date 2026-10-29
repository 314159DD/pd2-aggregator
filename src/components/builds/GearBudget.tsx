"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Card } from "@/components/lx/Card";
import { GEAR_BUDGET_STOPS, budgetIndex } from "@/lib/builds/budget";

export const budgetLabel = (v: number | null): string => (v === null ? "Any" : `≤ ${v.toFixed(2)} HR`);

const LAST = GEAR_BUDGET_STOPS.length - 1;

export function GearBudget({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  // A pending edit overrides the URL value only until the URL value changes (clear filters, back button, our own commit).
  const [draft, setDraft] = useState<{ idx: number; from: number | null } | null>(null);
  const idx = draft && draft.from === value ? draft.idx : budgetIndex(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const label = budgetLabel(GEAR_BUDGET_STOPS[idx]);

  function change(i: number) {
    setDraft({ idx: i, from: value });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(GEAR_BUDGET_STOPS[i]), 250);
  }

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gear-budget-title" className="text-sm font-semibold text-ink">
          Gear budget
        </h2>
        <output className="font-mono text-sm tabular-nums text-accent-text">{label}</output>
      </div>
      <input
        type="range"
        min={0}
        max={LAST}
        step={1}
        value={idx}
        aria-labelledby="gear-budget-title"
        aria-valuetext={label}
        onChange={(e) => change(Number(e.target.value))}
        className="lx-range mt-4"
        style={{ "--fill": `${(idx / LAST) * 100}%` } as CSSProperties}
      />
      <p className="mt-3 text-xs text-muted-ink">Only characters whose priced gear is worth at most this much.</p>
    </Card>
  );
}
