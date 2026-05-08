import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { loadGuide, clearCache } from "./data-loader";
import type { GuideRequest } from "./data-loader";
import type { CommonFilter } from "./api";

// ---------------------------------------------------------------------------
// Helpers — canned response bodies
// ---------------------------------------------------------------------------

const ITEM_USAGE_ROW = {
  item: "Harlequin Crest",
  itemType: "Unique",
  numOccurrences: 42,
  totalSample: 100,
  pct: 42,
};

const SKILL_USAGE_ROW = {
  name: "Holy Bolt",
  numOccurrences: 30,
  totalSample: 100,
  pct: 30,
};

const MERC_TYPE_ROW = {
  name: "Act 2 Defensive",
  numOccurrences: 50,
  totalSample: 100,
  pct: 50,
};

const MERC_ITEM_ROW = {
  item: "Harlequin Crest",
  itemType: "Unique",
  numOccurrences: 20,
  totalSample: 100,
  pct: 20,
};

const LEVEL_DIST = {
  hardcore: [{ level: 85, count: 10 }],
  softcore: [{ level: 85, count: 5 }],
};

/** Minimal character stub that satisfies filterCharacters for a Paladin. */
function makePaladinChar(overrides?: Record<string, unknown>) {
  return {
    accountName: "TestAccount",
    character: {
      name: "TestPaladin",
      level: 90,
      class: { id: 3, name: "Paladin" },
      life: 1000,
      mana: 200,
      stamina: 500,
      experience: 999999,
      attributes: { vitality: 300, strength: 100, dexterity: 75, energy: 25 },
      points: { stat: 0, skill: 0 },
      gold: { stash: 50000, character: 5000, total: 55000 },
      status: { is_dead: false, is_ladder: true, is_hardcore: true, is_expansion: true },
      skills: [{ id: 1, name: "Holy Bolt", level: 20 }],
      ...overrides,
    },
    realSkills: [],
    items: [],
    mercenary: {
      id: 1,
      name: "Ahvar",
      type: 2,
      experience: 0,
      description: "Act 2 Defensive",
      name_id: 1,
      items: [],
    },
    file: { header: 0, version: 97, checksum: 0, filesize: 1000, updated_at: 0 },
    lastUpdated: Date.now(),
  };
}

const RAW_PAGE_RESPONSE = {
  total: 50,
  characters: [makePaladinChar(), makePaladinChar()],
};

const SERVER_RESPONSES: Record<string, unknown> = {
  "item-usage": [ITEM_USAGE_ROW],
  "skill-usage": [SKILL_USAGE_ROW],
  "merc-type-usage": [MERC_TYPE_ROW],
  "merc-item-usage": [MERC_ITEM_ROW],
  "level-distribution": LEVEL_DIST,
};

const DEFAULT_RESPONSES: Record<string, unknown> = {
  ...SERVER_RESPONSES,
  "characters?gameMode=": RAW_PAGE_RESPONSE,
};

function mockFetchWith(byUrl: Record<string, unknown>) {
  vi.spyOn(global, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      for (const [pattern, body] of Object.entries(byUrl)) {
        if (url.includes(pattern)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response("not found", { status: 404 });
    },
  );
}

// ---------------------------------------------------------------------------
// Shared filter + request fixtures
// ---------------------------------------------------------------------------

const HC_PALA_FILTER: CommonFilter = {
  gameMode: "hardcore",
  className: "Paladin",
  minLevel: 85,
};

const HC_PALA_80_FILTER: CommonFilter = {
  gameMode: "hardcore",
  className: "Paladin",
  minLevel: 80,
};

/** Default request — Paladin HC 85, no skill requirements, 5 pages */
const HC_PALA: GuideRequest = {
  filter: HC_PALA_FILTER,
  skills: [],
  samplePages: 5,
};

/** Different minLevel — triggers separate server AND raw cache misses */
const HC_PALA_80: GuideRequest = {
  filter: HC_PALA_80_FILTER,
  skills: [],
  samplePages: 5,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Use clearCache() rather than idbClear() directly — the data-loader uses an
  // in-memory fallback when IndexedDB is unavailable (e.g. jsdom), so we must
  // clear through the same adapter.
  await clearCache();
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — Phase 1 (server aggregates, adapted to new signature)
// ---------------------------------------------------------------------------

describe("loadGuide — server aggregates", () => {
  // Test 1: First call fires fetch, returns source:"live", populates cache
  it("1. first call fires fetch and returns source:live", async () => {
    mockFetchWith(DEFAULT_RESPONSES);
    const result = await loadGuide(HC_PALA);

    expect(result.source).toBe("live");
    // request echo
    expect(result.request).toEqual(HC_PALA);
    expect(result.itemUsageSampleSize).toBe(100);
    expect(result.skillUsageSampleSize).toBe(100);
    expect(result.fetchedAt).toBeGreaterThan(0);
    // 5 server endpoints + 5 raw pages
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);
  });

  // Test 2: Second call within TTL returns source:"cache" with no fetch
  it("2. second call within TTL hits cache (no fetch)", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm the cache
    await loadGuide(HC_PALA);
    const fetchCallsAfterFirst = vi.mocked(fetch).mock.calls.length;
    expect(fetchCallsAfterFirst).toBe(10);

    // Second call
    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");
    // fetch should NOT have been called again
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);
  });

  // Test 3: Different filter => separate cache entry, fires fetch
  it("3. different filter creates a separate cache entry", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    await loadGuide(HC_PALA);
    const result80 = await loadGuide(HC_PALA_80);

    expect(result80.source).toBe("live");
    expect(result80.request.filter).toEqual(HC_PALA_80_FILTER);
    // 10 calls for each request = 20 total
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(20);
  });

  // Test 4: Empty item-usage response => itemUsageSampleSize: 0
  it("4. empty item-usage response yields itemUsageSampleSize:0", async () => {
    mockFetchWith({
      ...DEFAULT_RESPONSES,
      "item-usage": [],
    });

    const result = await loadGuide(HC_PALA);
    expect(result.itemUsageSampleSize).toBe(0);
  });

  // Test 5: After TTL expiry, refetches
  it("5. refetches after server TTL expiry", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm the cache
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);

    // Advance time past server TTL (1 hour + 1 ms) but NOT past raw TTL (24h)
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 3_600_001);

    const second = await loadGuide(HC_PALA);
    expect(second.source).toBe("live");
    // Server fetch again (5 more), raw still fresh (no fetch) = 15 total
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(15);
  });

  // Test 6: Live fetch fails AND cache exists (stale) => returns stale cache
  it("6. stale cache returned when live fetch fails", async () => {
    // First successful fetch to populate cache
    mockFetchWith(DEFAULT_RESPONSES);
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");

    // Advance past server TTL so the cache is "stale"
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 3_600_001);

    // Now mock fetch to fail for server endpoints only (raw still "fresh" TTL-wise
    // but we already advanced time past server TTL only — re-mock everything to fail)
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await loadGuide(HC_PALA);
    expect(result.source).toBe("cache");
    // Should still have the data from the first call
    expect(result.itemUsageSampleSize).toBe(100);
  });

  // Test 7: Live fetch fails AND no cache => re-throws
  it("7. re-throws when fetch fails and no cache exists", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    await expect(loadGuide(HC_PALA)).rejects.toThrow();
  });
});

// Test 8: clearCache() empties IDB
describe("clearCache", () => {
  it("8. clearCache empties IndexedDB", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm the cache
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");

    // Verify cache works
    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");

    // Clear the cache
    await clearCache();

    // Next call should refetch
    const afterClear = await loadGuide(HC_PALA);
    expect(afterClear.source).toBe("live");
    // 10 initial + 10 after clear = 20 total
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(20);
  });
});

// ---------------------------------------------------------------------------
// Tests — Phase 2 (raw sample + client aggregates)
// ---------------------------------------------------------------------------

describe("loadGuide — raw sample + client aggregates", () => {
  // Test 9: Cold start — both caches miss, fetches everything, returns live with client aggregates
  it("9. cold start returns source:live with non-empty client aggregates", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    const result = await loadGuide(HC_PALA);

    expect(result.source).toBe("live");
    expect(result.rawSamplePoolSize).toBeGreaterThan(0); // 5 pages × 2 chars = 10
    expect(result.filteredPoolSize).toBeGreaterThanOrEqual(0);
    expect(result.clientAggregates).toBeDefined();
    expect(typeof result.clientAggregates.poolSize).toBe("number");
    expect(result.clientAggregates.affixModsBySlot).toBeDefined();
    expect(result.clientAggregates.charms).toBeDefined();
  });

  // Test 10: Same request twice — second is source:cache with no additional fetches
  it("10. same request twice: second call is source:cache, no fetches", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    await loadGuide(HC_PALA);
    const calls1 = vi.mocked(fetch).mock.calls.length;

    const second = await loadGuide(HC_PALA);
    expect(second.source).toBe("cache");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls1); // no new fetches
  });

  // Test 11: Different className (same gameMode/minLevel) — server cache miss, raw cache HIT
  it("11. different className reuses raw cache, only re-fetches server aggregates", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm with Paladin
    await loadGuide(HC_PALA);
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length; // 10: 5 server + 5 raw

    // Request with Sorceress — same gameMode + minLevel + samplePages → raw cache HIT
    const HC_SORC: GuideRequest = {
      filter: { gameMode: "hardcore", className: "Sorceress", minLevel: 85 },
      skills: [],
      samplePages: 5,
    };

    const result = await loadGuide(HC_SORC);
    expect(result.source).toBe("live"); // server cache was different key → live
    const callsAfterSecond = vi.mocked(fetch).mock.calls.length;
    // Only 5 server-aggregate calls fired (raw cache reused)
    expect(callsAfterSecond - callsAfterFirst).toBe(5);
  });

  // Test 12: Different samplePages — raw cache miss (new raw cache key)
  it("12. different samplePages triggers raw cache miss", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm with 5 pages
    await loadGuide(HC_PALA);
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;

    // Request with 3 pages — different raw cache key
    const req3Pages: GuideRequest = { ...HC_PALA, samplePages: 3 };
    const result = await loadGuide(req3Pages);

    expect(result.source).toBe("live");
    const callsAfterSecond = vi.mocked(fetch).mock.calls.length;
    // Server cache key is the same (same className) → server HIT, raw MISS (3 pages)
    // So: 0 server fetches + 3 raw page fetches = 3 new calls
    expect(callsAfterSecond - callsAfterFirst).toBe(3);
    expect(result.rawSamplePoolSize).toBe(3 * RAW_PAGE_RESPONSE.characters.length);
  });

  // Test 13: Raw fetch fails, server fetches succeed, no raw cache → re-throws
  it("13. raw fetch fail with no raw cache re-throws", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("characters?gameMode=")) {
          throw new Error("raw fetch failed");
        }
        for (const [pattern, body] of Object.entries(SERVER_RESPONSES)) {
          if (url.includes(pattern)) {
            return new Response(JSON.stringify(body), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        return new Response("not found", { status: 404 });
      },
    );

    await expect(loadGuide(HC_PALA)).rejects.toThrow();
  });

  // Test 14: Raw fetch fails, stale raw cache exists → uses stale
  it("14. stale raw cache used when raw fetch fails", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm caches
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");
    const rawPoolSize = first.rawSamplePoolSize;

    // Advance past raw TTL (24h + 1ms)
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 86_400_001);

    // Raw fetch now fails, server fetch fails too → everything fails
    // We need server to succeed (its TTL is 1h, also expired) and raw to fail
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("characters?gameMode=")) {
          throw new Error("raw fetch failed");
        }
        // Server endpoints succeed
        for (const [pattern, body] of Object.entries(SERVER_RESPONSES)) {
          if (url.includes(pattern)) {
            return new Response(JSON.stringify(body), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        return new Response("not found", { status: 404 });
      },
    );

    const result = await loadGuide(HC_PALA);
    // Should not throw — raw uses stale fallback
    expect(result.rawSamplePoolSize).toBe(rawPoolSize);
    // Source is "live" because server was re-fetched
    expect(result.source).toBe("live");
  });

  // Test 15: clearCache() empties both server and raw cache keys
  it("15. clearCache empties both server and raw cache keys", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    await loadGuide(HC_PALA);
    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");

    await clearCache();

    const afterClear = await loadGuide(HC_PALA);
    expect(afterClear.source).toBe("live");
    // Both server (5) + raw (5) re-fetched = 10 calls (after the 10 warm + 10 after clear)
    // Total: 10 (warm) + 10 (after clear) = 20
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(20);
  });
});
