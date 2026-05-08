import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getMercItemUsage,
  getLevelDistribution,
} from "./api";
import type { CommonFilter } from "./api";
import { shapeTopItemsBySlot } from "./shape/topItems";
import type { TopItemsBySlot } from "./shape/topItems";
import { shapeBuildSheet } from "./shape/buildSheet";
import type { BuildSheet } from "./shape/buildSheet";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LoadSource = "live" | "cache";

export type LoadedGuide = {
  filter: CommonFilter;
  topItemsBySlot: TopItemsBySlot;
  itemUsageSampleSize: number;
  buildSheet: BuildSheet;
  skillUsageSampleSize: number;
  source: LoadSource;
  fetchedAt: number;
};

// ---------------------------------------------------------------------------
// Cache internals
// ---------------------------------------------------------------------------

const GUIDE_TTL_MS = 3_600_000; // 1 hour

type CacheEntry = {
  fetchedAt: number;
  payload: LoadedGuide;
};

function filterKey(f: CommonFilter): string {
  return `${f.gameMode}|${f.className ?? "*"}|${f.minLevel ?? 0}`;
}

function cacheKey(f: CommonFilter): string {
  return `guide:${filterKey(f)}`;
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
// Core fetch + shape
// ---------------------------------------------------------------------------

async function fetchAndShape(filter: CommonFilter): Promise<LoadedGuide> {
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

  const now = Date.now();

  const guide: LoadedGuide = {
    filter,
    topItemsBySlot,
    itemUsageSampleSize: itemUsage[0]?.totalSample ?? 0,
    buildSheet,
    skillUsageSampleSize: skillUsage[0]?.totalSample ?? 0,
    source: "live",
    fetchedAt: now,
  };

  // TODO Phase 2: sampled raw char fetch + filter + affixMods + charms

  return guide;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load guide data for the given filter. Orchestrates parallel API calls and
 * caches the result in IndexedDB for 1 hour (or in-memory when IndexedDB is
 * unavailable). On live-fetch failure, falls back to any stale cache entry. If
 * there is no cache, re-throws the error.
 */
export async function loadGuide(filter: CommonFilter): Promise<LoadedGuide> {
  const key = cacheKey(filter);

  // Try the cache first
  const cached = await _storeGet<CacheEntry>(key);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < GUIDE_TTL_MS) {
    return { ...cached.payload, source: "cache" };
  }

  // Cache miss or expired — attempt live fetch
  try {
    const guide = await fetchAndShape(filter);
    const entry: CacheEntry = { fetchedAt: guide.fetchedAt, payload: guide };
    await _storeSet(key, entry);
    return guide;
  } catch (err) {
    // Live fetch failed — return stale cache if available, otherwise rethrow
    if (cached) {
      return { ...cached.payload, source: "cache" };
    }
    throw err;
  }
}

/**
 * Wipe all guide entries from the cache store. Intended for debug/dev use.
 */
export async function clearCache(): Promise<void> {
  await _storeClear();
}
