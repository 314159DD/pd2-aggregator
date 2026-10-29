"use client";

import { useState, type ReactNode } from "react";

/** Collapsible stone panel with a Cinzel heading (the old page's Section). */
export function Section({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="d2-panel rounded-sm" aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-[#c9a04b]/5 outline-none focus-visible:outline-2 focus-visible:outline-accent-text ${
          open ? "border-b border-[#3d2817]" : ""
        }`}
      >
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
          <h2 className="d2-title text-xl truncate">{title}</h2>
          {subtitle && <span className="text-xs text-muted-ink tabular-nums">{subtitle}</span>}
        </div>
        <span className="text-[#c9a04b] text-sm shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }} aria-hidden>
          ▶
        </span>
      </button>
      {open && <div className="p-5">{children}</div>}
    </section>
  );
}

export function NoData({ children = "no data" }: { children?: ReactNode }) {
  return <p className="text-sm text-muted-ink italic">— {children} —</p>;
}
