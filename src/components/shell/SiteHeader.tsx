"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Freshness } from "./Freshness";
import { ScopeSwitch } from "./ScopeSwitch";
import { TabNav } from "./TabNav";

/** Width of the page column: Meta keeps the old 976px column (max-w-5xl with its p-6), the Builds pages need the wide table. */
export function shellWidth(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/builds" || p.startsWith("/builds/") ? "max-w-7xl" : "max-w-[61rem]";
}

/** The beer button of the old page, copied as it was. */
function BeerButton() {
  // Hand-rolled to match the BMC generator settings (color #c29946, black outline) so it blends
  // with the D2 gold theme. The BMC script is on every ad blocker's default list, so no JS button.
  return (
    <a
      href="https://www.buymeacoffee.com/SteenC"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a beer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black text-black text-xs font-semibold hover:brightness-110 active:brightness-95 transition"
      style={{ backgroundColor: "#c29946", fontFamily: '"Bree Serif", "Georgia", serif' }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden fill="none">
        {/* glass + beer */}
        <path d="M6 9h9v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9z" stroke="#000" strokeWidth={1.6} strokeLinejoin="round" fill="#FFDD00" />
        {/* handle */}
        <path d="M15 11h2a2.5 2.5 0 0 1 0 5h-2" stroke="#000" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        {/* foam */}
        <path d="M5 9a2 2 0 0 1 2.2-2 2 2 0 0 1 3.8-.6A2 2 0 0 1 15 7a2 2 0 0 1 1 2z" stroke="#000" strokeWidth={1.4} strokeLinejoin="round" fill="#fff" />
      </svg>
      Buy me a beer
    </a>
  );
}

/** Old page header: gold title left, beer button and freshness right; tabs and scope underneath. */
export function SiteHeader() {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const showScope = path === "/" || path === "/meta" || path === "/builds";
  return (
    <div className="lx px-4 pt-4 sm:px-6 sm:pt-6">
      <header className={`mx-auto flex w-full ${shellWidth(path)} flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3d2817] pb-3">
          <p className="d2-title text-3xl sm:text-4xl">
            <Link href="/" className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
              PD2 Meta Info
            </Link>
          </p>
          <div className="flex flex-col items-end gap-1">
            <BeerButton />
            <Freshness />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <TabNav />
          {showScope && (
            <Suspense fallback={<div aria-hidden className="h-9 w-[20rem] max-w-full" />}>
              <ScopeSwitch />
            </Suspense>
          )}
        </div>
      </header>
    </div>
  );
}
