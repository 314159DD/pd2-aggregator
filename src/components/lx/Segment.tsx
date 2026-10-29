"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GleitMarker } from "./gleit-marker";

export const SEGMENT_EINTRAG =
  "inline-flex h-8 items-center justify-center rounded-full px-3 sm:px-4 text-[13px] font-medium whitespace-nowrap text-ink-soft transition-[background-color,color,box-shadow] duration-(--dauer-kurz) ease-arrive outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";
export const SEGMENT_AN =
  "bg-surface text-ink shadow-[inset_0_1px_0_var(--edge),0_1px_2px_color-mix(in_oklab,var(--shadow-c)_10%,transparent),0_4px_10px_-4px_color-mix(in_oklab,var(--shadow-c)_22%,transparent)]";
const AKTIV = '[data-slot="segment-eintrag"][aria-pressed="true"]';

/** Well capsule; the active choice is a raised surface that glides between segments. */
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
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="segment"
      className={cn("well inline-flex max-w-full gap-0.5 rounded-full p-1", className)}
    >
      <GleitMarker ziel={AKTIV} className={cn("rounded-full", SEGMENT_AN)} />
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            data-slot="segment-eintrag"
            className={cn(SEGMENT_EINTRAG, on && SEGMENT_AN)}
            onClick={() => onChange(it.value)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
