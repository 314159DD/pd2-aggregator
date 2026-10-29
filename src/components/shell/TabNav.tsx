"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { GleitMarker } from "@/components/lx/gleit-marker";
import { SEGMENT_AN, SEGMENT_EINTRAG } from "@/components/lx/Segment";

/** Builds is active on /builds*, Meta on / and /meta. */
function activeTab(pathname: string): "builds" | "meta" | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/builds" || p.startsWith("/builds/")) return "builds";
  if (p === "/" || p === "/meta") return "meta";
  return null;
}

function TabNavView({ query }: { query: string }) {
  const active = activeTab(usePathname() ?? "/");
  const tabs = [
    { id: "builds", label: "Builds", href: `/builds${query}` },
    { id: "meta", label: "Meta", href: `/${query}` },
  ] as const;

  return (
    <nav aria-label="Sections" data-slot="segment" className="well inline-flex gap-0.5 rounded-full p-1">
      <GleitMarker ziel='[data-slot="segment-eintrag"][aria-current="page"]' className={cn("rounded-full", SEGMENT_AN)} />
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            data-slot="segment-eintrag"
            className={cn(SEGMENT_EINTRAG, on && SEGMENT_AN)}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabNavWithMode() {
  const mode = useSearchParams()?.get("gameMode");
  return <TabNavView query={mode === "hardcore" || mode === "softcore" ? `?gameMode=${mode}` : ""} />;
}

/** Only the gameMode carry-over reads the URL; the tabs themselves prerender (same markup as fallback). */
export function TabNav() {
  return (
    <Suspense fallback={<TabNavView query="" />}>
      <TabNavWithMode />
    </Suspense>
  );
}
