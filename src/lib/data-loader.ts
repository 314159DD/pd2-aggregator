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
  samplePages?: number; // default 5
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
  filteredPoolSize: number; // chars matching className + skills
  /** Raw (unfiltered) character sample — used for diff lookup fallback. */
  rawSample: Character[];
  // Provenance
  source: LoadSource;
  fetchedAt: number;
};

// ---------------------------------------------------------------------------
// Cache internals
// ---------------------------------------------------------------------------

const SERVER_TTL_MS = 3_600_000; // 1 hour
const RAW_TTL_MS = 86_400_000; // 24 hours

const DEFAULT_SAMPLE_PAGES = 5;

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
};

function serverCacheKey(f: CommonFilter): string {
  return `guide:server:${f.gameMode}|${f.className ?? "*"}|${f.minLevel ?? 0}`;
}

function rawCacheKey(
  gameMode: string,
  minLevel: number | undefined,
  samplePages: number,
): string {
  return `guide:raw:${gameMode}|${minLevel ?? 0}|${samplePages}`;
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

async function fetchServerAggregates(filter: CommonFilter): Promise<ServerCacheEntry> {
  const [itemUsage, skillUsage, mercTypes, mercItems, levelDist] =
    await Promise.all([
      getItemUsage(filter),
      getSkillUsage(filter),
      getMercTypeUsage(filter),
      getMercItemUsage(filter),
      getLevelDistribution(filter),
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
// Raw character fetch
// ---------------------------------------------------------------------------

async function fetchRawCharacters(
  filter: CommonFilter,
  samplePages: number,
): Promise<Character[]> {
  const pages = await Promise.all(
    Array.from({ length: samplePages }, (_, i) =>
      getCharactersPage(filter, i + 1),
    ),
  );

  const characters: Character[] = [];
  for (const page of pages) {
    for (const c of page.characters) {
      characters.push(c as Character);
    }
  }
  return characters;
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
 * - Server cache key includes className (different classes → different server stats).
 * - Raw cache key includes only gameMode + minLevel + samplePages — className and
 *   skills are NOT part of the key because filtering is done client-side from the
 *   cached raw set.
 *
 * On live-fetch failure:
 * - Server fail + no server cache → re-throws.
 * - Raw fail + stale raw cache → uses stale raw set (logs warning).
 * - Raw fail + no raw cache → re-throws.
 */
export async function loadGuide(req: GuideRequest): Promise<LoadedGuide> {
  const { filter, skills, samplePages: rawSamplePages = DEFAULT_SAMPLE_PAGES } = req;

  const sKey = serverCacheKey(filter);
  const rKey = rawCacheKey(filter.gameMode, filter.minLevel, rawSamplePages);

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
    return assemble(req, cachedServer, cachedRaw.characters, "cache");
  }

  // 3. Fire missing fetches in parallel — track whether any live data was fetched
  let serverLive = false;
  let rawLive = false;

  const serverPromise: Promise<ServerCacheEntry> = serverFresh
    ? Promise.resolve(cachedServer)
    : fetchServerAggregates(filter)
        .then((result) => {
          serverLive = true;
          return result;
        })
        .catch((err) => {
          if (cachedServer) return cachedServer; // stale fallback
          throw err;
        });

  const rawPromise: Promise<Character[]> = rawFresh
    ? Promise.resolve(cachedRaw.characters)
    : fetchRawCharacters(filter, rawSamplePages)
        .then((chars) => {
          rawLive = true;
          return chars;
        })
        .catch((err: unknown) => {
          if (cachedRaw) return cachedRaw.characters; // stale fallback
          throw err;
        });

  let serverResult: ServerCacheEntry;
  let rawResult: Character[];

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
      _storeSet(rKey, { fetchedAt: Date.now(), characters: rawResult }),
    );
  }
  await Promise.all(writePromises);

  // Source is "live" only if at least one live fetch succeeded
  const source: LoadSource = serverLive || rawLive ? "live" : "cache";
  return assemble(req, serverResult, rawResult, source);
}

// ---------------------------------------------------------------------------
// Assembly helper
// ---------------------------------------------------------------------------

function assemble(
  req: GuideRequest,
  server: ServerCacheEntry,
  rawChars: Character[],
  source: LoadSource,
): LoadedGuide {
  const { filter, skills } = req;

  // 5. Filter raw set client-side by className + skills
  const filtered = filterCharacters(
    rawChars,
    {
      className: filter.className ?? "",
      skills,
      minCharLevel: filter.minLevel,
    },
  );

  // 6. Run client aggregation
  const clientAggregates = aggregateClientSide(filtered, modDictionary);

  return {
    request: req,
    topItemsBySlot: server.topItemsBySlot,
    itemUsageSampleSize: server.itemUsageSampleSize,
    buildSheet: server.buildSheet,
    skillUsageSampleSize: server.skillUsageSampleSize,
    clientAggregates,
    rawSamplePoolSize: rawChars.length,
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
