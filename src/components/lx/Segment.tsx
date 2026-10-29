"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SEGMENT_EINTRAG =
  "d2-btn inline-flex h-9 items-center justify-center px-4 text-sm whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

/** Row of square-ish stone buttons (the old Game mode buttons); the active choice is the gold gradient. */
export function Segment({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: Array<{ value: string; label: ReactNode }>;
  value: string;
  onChange(v: string): void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} data-slot="segment" className={cn("inline-flex max-w-full gap-2", className)}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            data-slot="segment-eintrag"
            className={SEGMENT_EINTRAG}
            onClick={() => onChange(it.value)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
