import { API_BASE } from "@/lib/api";
import { metaApiParams, type MetaState } from "./state";
import type { CharacterDiff, MetaCohort } from "./types";

export async function getMeta(s: MetaState, signal?: AbortSignal): Promise<MetaCohort> {
  const r = await fetch(`${API_BASE}/meta?${metaApiParams(s)}`, { signal });
  if (!r.ok) throw new Error(`meta HTTP ${r.status}`);
  return r.json();
}

/** Resolves to null when the character is unknown (404). */
export async function getMetaDiff(s: MetaState, name: string, signal?: AbortSignal): Promise<CharacterDiff | null> {
  const p = metaApiParams(s);
  p.set("char", name);
  const r = await fetch(`${API_BASE}/meta/diff?${p}`, { signal });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`meta/diff HTTP ${r.status}`);
  const body = (await r.json()) as { diff: CharacterDiff };
  return body.diff;
}
