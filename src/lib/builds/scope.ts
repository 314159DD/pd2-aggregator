"use client";

import { useCallback } from "react";
import type { SeasonsResponse } from "@/lib/builds/types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Scope = { season: number | null; gameMode: "softcore" | "hardcore" };

/** Reads the shared scope from the URL; unknown or malformed values fall back to the defaults. */
export function readScope(p: URLSearchParams): Scope {
  const raw = p.get("season");
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return {
    season: Number.isSafeInteger(n) && n > 0 ? n : null,
    gameMode: p.get("gameMode")?.toLowerCase() === "hardcore" ? "hardcore" : "softcore",
  };
}

/** True only when both are known and the season is not the current one; false while seasons load. */
export function isArchiveSeason(season: number | null, seasons: SeasonsResponse | null): boolean {
  return season !== null && seasons !== null && season !== seasons.current;
}

/** Scope from the URL plus a setter that rewrites season/gameMode in place and resets paging. */
export function useScope(): [Scope, (next: Partial<Scope>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const paramString = useSearchParams()?.toString() ?? "";
  const scope = readScope(new URLSearchParams(paramString));

  const setScope = useCallback(
    (next: Partial<Scope>) => {
      const p = new URLSearchParams(paramString);
      const merged = { ...readScope(p), ...next };
      if (merged.season === null) p.delete("season");
      else p.set("season", String(merged.season));
      p.set("gameMode", merged.gameMode);
      p.delete("page");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [router, pathname, paramString],
  );

  return [scope, setScope];
}
