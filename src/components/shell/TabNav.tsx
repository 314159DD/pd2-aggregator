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

function TabNavView({ query, search }: { query: string; search: string }) {
  const pathname = usePathname() ?? "/";
  const active = activeTab(pathname);
  // Both tabs default to softcore; the Meta link from /builds* still names the mode explicitly.
  const metaQuery = active === "builds" ? (query || "?gameMode=softcore") : query;
  // On Meta itself the link keeps the whole URL state (class, level, skills, mode, char).
  const tabs = [
    { id: "builds", label: "Builds", href: `/builds${query}` },
    { id: "meta", label: "Meta", href: `/${active === "meta" ? search : metaQuery}` },
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

/** gameMode and season are the only params that make sense on both tabs. */
function carry(mode: string | null | undefined, season: string | null | undefined): string {
  const p = new URLSearchParams();
  if (mode === "hardcore" || mode === "softcore") p.set("gameMode", mode);
  if (season && /^\d+$/.test(season)) p.set("season", season);
  const q = p.toString();
  return q ? `?${q}` : "";
}

function TabNavWithMode() {
  const params = useSearchParams();
  const mode = params?.get("gameMode");
  const season = params?.get("season");
  const raw = params?.toString() ?? "";
  return (
    <TabNavView
      query={carry(mode, season)}
      search={raw ? `?${raw}` : ""}
    />
  );
}

/** Only the gameMode carry-over reads the URL; the tabs themselves prerender (same markup as fallback). */
export function TabNav() {
  return (
    <Suspense fallback={<TabNavView query="" search="" />}>
      <TabNavWithMode />
    </Suspense>
  );
}
