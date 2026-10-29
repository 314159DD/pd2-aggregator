import type { Scope } from "./scope";
import { toApiParams, type BuildsState } from "./url-state";
import type {
  BuildShareHistory,
  BuildsCharactersPage,
  BuildsUsage,
  CharacterDetail,
  CharacterHistory,
  CharacterPreview,
  PricesResponse,
  SeasonsResponse,
} from "./types";

// Same base as src/lib/api.ts.
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.pd2meta.info/api/v1";

const scopeParams = (scope: Scope): string => {
  const p = new URLSearchParams();
  if (scope.season !== null) p.set("season", String(scope.season));
  p.set("gameMode", scope.gameMode);
  return p.toString();
};

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { signal });
  if (!r.ok) throw new Error(`API ${r.status} for ${path.split("?")[0]}`);
  return (await r.json()) as T;
}

async function getJsonOrNull<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const r = await fetch(`${BASE}${path}`, { signal });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API ${r.status} for ${path.split("?")[0]}`);
  return (await r.json()) as T;
}

const enc = encodeURIComponent;

export const getUsage = (s: BuildsState, signal?: AbortSignal) =>
  getJson<BuildsUsage>(`/builds/usage?${toApiParams(s).toString()}`, signal);
export const getBuildCharacters = (s: BuildsState, signal?: AbortSignal) =>
  getJson<BuildsCharactersPage>(`/builds/characters?${toApiParams(s).toString()}`, signal);
export const getPreview = (name: string, scope: Scope, signal?: AbortSignal) =>
  getJsonOrNull<CharacterPreview>(`/builds/characters/${enc(name)}?${scopeParams(scope)}`, signal);
export const getSeasons = (signal?: AbortSignal) => getJson<SeasonsResponse>("/builds/seasons", signal);
export const getHistory = (scope: Scope, signal?: AbortSignal) =>
  getJson<BuildShareHistory>(`/builds/history?${scopeParams(scope)}`, signal);
export const getPrices = (scope: Scope, signal?: AbortSignal) =>
  getJson<PricesResponse>(`/prices?${scopeParams(scope)}`, signal);
export const getCharacter = (name: string, scope: Scope, signal?: AbortSignal) =>
  getJsonOrNull<CharacterDetail>(`/characters/${enc(name)}?${scopeParams(scope)}`, signal);
export const getCharacterHistory = (name: string, scope: Scope, signal?: AbortSignal) =>
  getJsonOrNull<CharacterHistory>(`/characters/${enc(name)}/history?${scopeParams(scope)}`, signal);
export const getAccount = (name: string, season: number | null, signal?: AbortSignal) =>
  getJson<{ characters: Array<Record<string, unknown>>; total: number }>(
    `/characters/accounts/${enc(name)}${season === null ? "" : `?season=${season}`}`,
    signal,
  );

export async function queueAccount(name: string, signal?: AbortSignal): Promise<"queued" | "invalid" | "rate-limited"> {
  const r = await fetch(`${BASE}/accounts/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountName: name }),
    signal,
  });
  if (r.status === 400) return "invalid";
  if (r.status === 429) return "rate-limited";
  if (!r.ok) throw new Error(`API ${r.status} for /accounts/queue`);
  return "queued";
}
