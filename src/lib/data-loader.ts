import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getMercItemUsage,
  getLevelDistribution,
  getCharactersPage,
} from "./api";
import type { CommonFilter } from "./api";
import { shapeTopItemsBySlot } from "./shape/topItems";
import type { TopItemsBySlot } from "./shape/topItems";
import { shapeBuildSheet } from "./shape/buildSheet";
import type { BuildSheet } from "./shape/buildSheet";
import { filterCharacters } from "./filter";
import type { SkillRequirement } from "./filter";
import { aggregateClientSide } from "./aggregate";
import type { ClientAggregates } from "./aggregate";
import type { Character } from "./types";
import modDictionaryRaw from "../../data/mod-dictionary.json";
import type { ModDictionary } from "./aggregate/types";

const modDictionary = modDictionaryRaw as ModDictionary;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LoadSource = "live" | "cache";

export type GuideRequest = {
  filter: CommonFilter;
  skills: SkillRequirement[];
  /** @deprecated samplePages is ignored — the loader always fetches the full
   *  class-filtered pool. Kept for backward compat so callers don't type-error. */
  samplePages?: number;
};

export type LoadedGuide = {
  request: GuideRequest;
  // Server-aggregate sections (unchanged)
  topItemsBySlot: TopItemsBySlot;
  itemUsageSampleSize: number;
  buildSheet: BuildSheet;
  skillUsageSampleSize: number;
  // Client-aggregate sections (new)
  clientAggregates: ClientAggregates;
  rawSamplePoolSize: number; // total raw chars fetched (across pages)
  /** Equal to rawSamplePoolSize unless the total exceeded MAX_PAGES * PAGE_SIZE,
   *  in which case rawSampleTotalAvailable > rawSamplePoolSize. */
  rawSampleTotalAvailable: number;
  /** True when the pool exceeded MAX_PAGES * PAGE_SIZE and was truncated. */
  truncated: boolean;
  filteredPoolSize: number; // chars matching className + skills
  /** Raw (unfiltered) character sample — used for diff lookup fallback. */
  rawSample: Character[];
  // Provenance
  source: LoadSource;
  fetchedAt: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVER_TTL_MS = 3_600_000; // 1 hour
const RAW_TTL_MS = 86_400_000; // 24 hours

/** Hard ceiling on pages fetched for the raw pool. 30 pages * 50 chars = 1500 chars max. */
const MAX_PAGES = 30;
const PAGE_SIZE = 50;
/** Max concurrent page fetches to avoid hammering the API. */
const CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// Cache internals
// ---------------------------------------------------------------------------

type ServerCacheEntry = {
  fetchedAt: number;
  topItemsBySlot: TopItemsBySlot;
  itemUsageSampleSize: number;
  buildSheet: BuildSheet;
  skillUsageSampleSize: number;
};

type RawCacheEntry = {
  fetchedAt: number;
  characters: Character[];
  totalAvailable: number;
};

function serverCacheKey(f: CommonFilter, skills: SkillRequirement[]): string {
  // Cohort changes when skills change → key must include them.
  // Sort by name so order-independent submissions hit the same cache entry.
  const s = skills
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sk) => `${sk.name}@${sk.minLevel}`)
    .join(",");
  return `guide:server:${f.gameMode}|${f.className ?? "*"}|${f.minLevel ?? 0}|${s}`;
}

function rawCacheKey(f: CommonFilter): string {
  // Raw pool is the full class-filtered character set — independent of the
  // skill filter (which we apply client-side over the pool). One raw cache
  // entry per class, reused across many skill combos.
  return `guide:raw:${f.gameMode}|${f.className ?? "*"}|${f.minLevel ?? 0}`;
}

// ---------------------------------------------------------------------------
// Storage adapter — idb-keyval in real browser; in-memory Map in test/SSR
// environments that lack IndexedDB (e.g. jsdom without fake-indexeddb).
// ---------------------------------------------------------------------------

/** In-memory fallback used when IndexedDB is unavailable. */
const _memStore = new Map<string, unknown>();

const _hasIDB =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as Record<string, unknown>).indexedDB !== "undefined";

async function _storeGet<T>(key: string): Promise<T | undefined> {
  if (_hasIDB) {
    const { get } = await import("idb-keyval");
    return get<T>(key);
  }
  return _memStore.get(key) as T | undefined;
}

async function _storeSet(key: string, value: unknown): Promise<void> {
  if (_hasIDB) {
    const { set } = await import("idb-keyval");
    await set(key, value);
    return;
  }
  _memStore.set(key, value);
}

async function _storeClear(): Promise<void> {
  if (_hasIDB) {
    const { clear } = await import("idb-keyval");
    await clear();
    return;
  }
  _memStore.clear();
}

// ---------------------------------------------------------------------------
// Server-aggregate fetch + shape
// ---------------------------------------------------------------------------

async function fetchServerAggregates(
  filter: CommonFilter,
  skills: SkillRequirement[],
): Promise<ServerCacheEntry> {
  const [itemUsage, skillUsage, mercTypes, mercItems, levelDist] =
    await Promise.all([
      getItemUsage(filter, skills),
      getSkillUsage(filter, skills),
      getMercTypeUsage(filter, skills),
      getMercItemUsage(filter, skills),
      getLevelDistribution(filter, skills),
    ]);

  const topItemsBySlot = shapeTopItemsBySlot(itemUsage);
  const buildSheet = shapeBuildSheet({
    skills: skillUsage,
    levelDist,
    mercTypes,
    mercItems,
    gameMode: filter.gameMode,
  });

  return {
    fetchedAt: Date.now(),
    topItemsBySlot,
    itemUsageSampleSize: itemUsage[0]?.totalSample ?? 0,
    buildSheet,
    skillUsageSampleSize: skillUsage[0]?.totalSample ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Raw character fetch — full pool
// ---------------------------------------------------------------------------

/**
 * Fetch the complete class-filtered character pool for the given filter.
 *
 * Strategy:
 * 1. Fetch page 1 to learn `total`.
 * 2. Compute pagesNeeded = ceil(total / PAGE_SIZE), capped at MAX_PAGES.
 * 3. Fetch remaining pages 2..N in parallel with concurrency CONCURRENCY.
 * 4. Return the concatenated pool and the original `total` from the API.
 */
async function fetchRawCharacters(
  filter: CommonFilter,
  onProgress?: (msg: string) => void,
): Promise<{ characters: Character[]; totalAvailable: number }> {
  // Page 1 — tells us the total
  onProgress?.("Fetching page 1…");
  const page1 = await getCharactersPage(filter, 1);
  const totalAvailable = page1.total;

  const pagesNeeded = Math.min(Math.ceil(totalAvailable / PAGE_SIZE), MAX_PAGES);

  const characters: Character[] = (page1.characters as Character[]).slice();

  if (pagesNeeded <= 1) {
    return { characters, totalAvailable };
  }

  onProgress?.(`Fetching pages 2–${pagesNeeded} of ${pagesNeeded}…`);

  // Fetch remaining pages with bounded concurrency
  const pageNumbers = Array.from({ length: pagesNeeded - 1 }, (_, i) => i + 2);

  for (let i = 0; i < pageNumbers.length; i += CONCURRENCY) {
    const batch = pageNumbers.slice(i, i + CONCURRENCY);
    const first = batch[0];
    const last = batch[batch.length - 1];
    onProgress?.(`Fetching page ${first}–${last} of ${pagesNeeded}…`);
    const pages = await Promise.all(batch.map((p) => getCharactersPage(filter, p)));
    for (const page of pages) {
      for (const c of page.characters) {
        characters.push(c as Character);
      }
    }
  }

  return { characters, totalAvailable };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load guide data for the given request. Orchestrates parallel server-aggregate
 * and raw-character fetches, caches results separately (server: 1h TTL,
 * raw: 24h TTL), runs client-side filtering + aggregation, and assembles a
 * complete LoadedGuide.
 *
 * Cache strategy:
 * - Server cache key: gameMode + className + minLevel
 * - Raw cache key: gameMode + className + minLevel (className now included
 *   because we fetch the server-filtered pool, not all characters)
 *
 * On live-fetch failure:
 * - Server fail + no server cache → re-throws.
 * - Raw fail + stale raw cache → uses stale raw set (logs warning).
 * - Raw fail + no raw cache → re-throws.
 *
 * @param onProgress Optional callback called with human-readable progress strings
 *   during raw-pool fetching (e.g. "Fetching page 3–8 of 13…").
 */
export async function loadGuide(
  req: GuideRequest,
  onProgress?: (msg: string) => void,
): Promise<LoadedGuide> {
  const { filter, skills } = req;

  const sKey = serverCacheKey(filter, skills);
  const rKey = rawCacheKey(filter);

  // 1. Read both caches in parallel
  const now = Date.now();
  const [cachedServer, cachedRaw] = await Promise.all([
    _storeGet<ServerCacheEntry>(sKey),
    _storeGet<RawCacheEntry>(rKey),
  ]);

  const serverFresh =
    cachedServer !== undefined && now - cachedServer.fetchedAt < SERVER_TTL_MS;
  const rawFresh =
    cachedRaw !== undefined && now - cachedRaw.fetchedAt < RAW_TTL_MS;

  // 2. If both fresh: assemble from cache
  if (serverFresh && rawFresh) {
    return assemble(req, cachedServer, cachedRaw.characters, cachedRaw.totalAvailable, "cache");
  }

  // 3. Fire missing fetches in parallel — track whether any live data was fetched
  let serverLive = false;
  let rawLive = false;

  const serverPromise: Promise<ServerCacheEntry> = serverFresh
    ? Promise.resolve(cachedServer)
    : fetchServerAggregates(filter, skills)
        .then((result) => {
          serverLive = true;
          return result;
        })
        .catch((err) => {
          if (cachedServer) return cachedServer; // stale fallback
          throw err;
        });

  const rawPromise: Promise<{ characters: Character[]; totalAvailable: number }> = rawFresh
    ? Promise.resolve({ characters: cachedRaw.characters, totalAvailable: cachedRaw.totalAvailable })
    : fetchRawCharacters(filter, onProgress)
        .then((result) => {
          rawLive = true;
          return result;
        })
        .catch((err: unknown) => {
          if (cachedRaw) return { characters: cachedRaw.characters, totalAvailable: cachedRaw.totalAvailable }; // stale fallback
          throw err;
        });

  let serverResult: ServerCacheEntry;
  let rawResult: { characters: Character[]; totalAvailable: number };

  try {
    [serverResult, rawResult] = await Promise.all([serverPromise, rawPromise]);
  } catch (err) {
    throw new Error(
      `loadGuide fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4. Write fresh data back to caches (only if a live fetch actually ran)
  const writePromises: Promise<void>[] = [];
  if (serverLive) {
    writePromises.push(_storeSet(sKey, serverResult));
  }
  if (rawLive) {
    writePromises.push(
      _storeSet(rKey, {
        fetchedAt: Date.now(),
        characters: rawResult.characters,
        totalAvailable: rawResult.totalAvailable,
      }),
    );
  }
  await Promise.all(writePromises);

  // Source is "live" only if at least one live fetch succeeded
  const source: LoadSource = serverLive || rawLive ? "live" : "cache";
  return assemble(req, serverResult, rawResult.characters, rawResult.totalAvailable, source);
}

// ---------------------------------------------------------------------------
// Assembly helper
// ---------------------------------------------------------------------------

function assemble(
  req: GuideRequest,
  server: ServerCacheEntry,
  rawChars: Character[],
  totalAvailable: number,
  source: LoadSource,
): LoadedGuide {
  const { filter, skills } = req;

  // Filter raw set client-side by className + skills
  const filtered = filterCharacters(
    rawChars,
    {
      className: filter.className ?? "",
      skills,
      minCharLevel: filter.minLevel,
    },
  );

  // Run client aggregation (className enables prereq-classified skill usage)
  const clientAggregates = aggregateClientSide(
    filtered,
    modDictionary,
    filter.className,
  );

  const truncated = totalAvailable > MAX_PAGES * PAGE_SIZE;

  return {
    request: req,
    topItemsBySlot: server.topItemsBySlot,
    itemUsageSampleSize: server.itemUsageSampleSize,
    buildSheet: server.buildSheet,
    skillUsageSampleSize: server.skillUsageSampleSize,
    clientAggregates,
    rawSamplePoolSize: rawChars.length,
    rawSampleTotalAvailable: totalAvailable,
    truncated,
    filteredPoolSize: filtered.length,
    rawSample: rawChars,
    source,
    fetchedAt: server.fetchedAt,
  };
}

/**
 * Wipe all guide entries from the cache store. Intended for debug/dev use.
 */
export async function clearCache(): Promise<void> {
  await _storeClear();
}
