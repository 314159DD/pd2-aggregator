"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Freshness } from "./Freshness";
import { ScopeSwitch } from "./ScopeSwitch";
import { TabNav } from "./TabNav";
import { ThemeToggle } from "./ThemeToggle";

/** Sticky glass bar on its own lit stage band; the page below keeps its own look. */
export function SiteHeader() {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const showScope = path === "/" || path === "/meta" || path === "/builds";
  return (
    <div className="lx lx-stage sticky top-0 z-40 px-3 py-3 sm:px-5">
      <header className="mat-thin mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-panel)] px-4 py-2.5">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.012em] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
          PD2 Meta
        </Link>
        <TabNav />
        {showScope && (
          <Suspense fallback={<div aria-hidden className="h-10 w-[22.5rem] max-w-full" />}>
            <ScopeSwitch />
          </Suspense>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Freshness />
          <ThemeToggle />
        </div>
      </header>
    </div>
  );
}
