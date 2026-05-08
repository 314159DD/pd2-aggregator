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

/**
 * Build a RAW_PAGE_RESPONSE with a given total and N characters per page.
 * The loader uses `total` to compute how many pages to fetch.
 */
function makePageResponse(total: number, charsPerPage: number = 2) {
  return {
    total,
    characters: Array.from({ length: charsPerPage }, () => makePaladinChar()),
  };
}

const SERVER_RESPONSES: Record<string, unknown> = {
  "item-usage": [ITEM_USAGE_ROW],
  "skill-usage": [SKILL_USAGE_ROW],
  "merc-type-usage": [MERC_TYPE_ROW],
  "merc-item-usage": [MERC_ITEM_ROW],
  "level-distribution": LEVEL_DIST,
};

/**
 * Create a fetch mock that:
 * - routes server-aggregate URLs by pattern
 * - routes raw character pages by inspecting the `page=` query param
 *   (page 1 returns `page1Response`, all later pages return `laterPageResponse`)
 */
function mockFetchWithPages(
  page1Response: { total: number; characters: unknown[] },
  laterPageResponse: { total: number; characters: unknown[] } = page1Response,
) {
  vi.spyOn(global, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      // Server aggregates
      for (const [pattern, body] of Object.entries(SERVER_RESPONSES)) {
        if (url.includes(pattern)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Raw character pages
      if (url.includes("characters?")) {
        const u = new URL(url);
        const page = Number(u.searchParams.get("page") ?? "1");
        const body = page === 1 ? page1Response : laterPageResponse;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    },
  );
}

/** Simple mock where every page returns the same response. */
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

/** Default request — Paladin HC 85, no skill requirements */
const HC_PALA: GuideRequest = {
  filter: HC_PALA_FILTER,
  skills: [],
};

/** Different minLevel — triggers separate server AND raw cache misses */
const HC_PALA_80: GuideRequest = {
  filter: HC_PALA_80_FILTER,
  skills: [],
};

// A small page response: total=4, 2 chars per page → 2 pages needed
const SMALL_PAGE = makePageResponse(4, 2);

const DEFAULT_RESPONSES = {
  ...SERVER_RESPONSES,
  "characters?": SMALL_PAGE,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await clearCache();
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — Phase 1 (server aggregates)
// ---------------------------------------------------------------------------

describe("loadGuide — server aggregates", () => {
  // Test 1: First call fires fetch, returns source:"live", populates cache
  it("1. first call fires fetch and returns source:live", async () => {
    // total=4 → ceil(4/50)=1 page needed
    mockFetchWithPages(makePageResponse(4, 4));
    const result = await loadGuide(HC_PALA);

    expect(result.source).toBe("live");
    expect(result.request).toEqual(HC_PALA);
    expect(result.itemUsageSampleSize).toBe(100);
    expect(result.skillUsageSampleSize).toBe(100);
    expect(result.fetchedAt).toBeGreaterThan(0);
    // 5 server endpoints + 1 raw page (total=4, fits in 1 page)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(6);
  });

  // Test 2: Second call within TTL returns source:"cache" with no fetch
  it("2. second call within TTL hits cache (no fetch)", async () => {
    mockFetchWithPages(makePageResponse(4, 4));

    await loadGuide(HC_PALA);
    const fetchCallsAfterFirst = vi.mocked(fetch).mock.calls.length;

    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(fetchCallsAfterFirst);
  });

  // Test 3: Different filter => separate cache entry, fires fetch
  it("3. different filter creates a separate cache entry", async () => {
    mockFetchWithPages(makePageResponse(4, 4));

    await loadGuide(HC_PALA);
    const result80 = await loadGuide(HC_PALA_80);

    expect(result80.source).toBe("live");
    expect(result80.request.filter).toEqual(HC_PALA_80_FILTER);
    // Both requests fire all fetches (different raw key due to different minLevel)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(12);
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
    mockFetchWithPages(makePageResponse(4, 4));

    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;

    // Advance time past server TTL (1 hour + 1 ms) but NOT past raw TTL (24h)
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 3_600_001);

    const second = await loadGuide(HC_PALA);
    expect(second.source).toBe("live");
    // Server fetch again (5 more), raw still fresh (no raw fetch)
    const callsAfterSecond = vi.mocked(fetch).mock.calls.length;
    expect(callsAfterSecond - callsAfterFirst).toBe(5);
  });

  // Test 6: Live fetch fails AND cache exists (stale) => returns stale cache
  it("6. stale cache returned when live fetch fails", async () => {
    mockFetchWithPages(makePageResponse(4, 4));
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");

    // Advance past server TTL
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 3_600_001);

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await loadGuide(HC_PALA);
    expect(result.source).toBe("cache");
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
    mockFetchWithPages(makePageResponse(4, 4));

    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");
    const callsAfterWarm = vi.mocked(fetch).mock.calls.length;

    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");

    await clearCache();

    const afterClear = await loadGuide(HC_PALA);
    expect(afterClear.source).toBe("live");
    // Should have fetched again
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterWarm * 2);
  });
});

// ---------------------------------------------------------------------------
// Tests — Phase 2 (raw sample + client aggregates)
// ---------------------------------------------------------------------------

describe("loadGuide — raw sample + client aggregates", () => {
  // Test 9: Cold start — both caches miss, fetches everything, returns live with client aggregates
  it("9. cold start returns source:live with non-empty client aggregates", async () => {
    // total=4, fits in 1 page
    mockFetchWithPages(makePageResponse(4, 4));

    const result = await loadGuide(HC_PALA);

    expect(result.source).toBe("live");
    expect(result.rawSamplePoolSize).toBeGreaterThan(0);
    expect(result.rawSampleTotalAvailable).toBe(4);
    expect(result.truncated).toBe(false);
    expect(result.filteredPoolSize).toBeGreaterThanOrEqual(0);
    expect(result.clientAggregates).toBeDefined();
    expect(typeof result.clientAggregates.poolSize).toBe("number");
    expect(result.clientAggregates.affixModsBySlot).toBeDefined();
    expect(result.clientAggregates.charms).toBeDefined();
  });

  // Test 10: Fetches multiple pages when total > PAGE_SIZE
  it("10. fetches multiple pages when total > 50", async () => {
    // total=100 → ceil(100/50)=2 pages
    const page1 = makePageResponse(100, 50);
    const page2 = makePageResponse(100, 50);
    mockFetchWithPages(page1, page2);

    const result = await loadGuide(HC_PALA);

    expect(result.source).toBe("live");
    expect(result.rawSamplePoolSize).toBe(100); // 2 pages × 50 chars
    expect(result.rawSampleTotalAvailable).toBe(100);
    expect(result.truncated).toBe(false);
    // 5 server + 2 raw pages = 7 calls
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(7);
  });

  // Test 11: Caps at MAX_PAGES (30 pages = 1500 chars)
  it("11. caps at MAX_PAGES=30 when total is very large", async () => {
    // total=2000 → would need 40 pages, capped at 30
    const hugePage = makePageResponse(2000, 50);
    mockFetchWithPages(hugePage, hugePage);

    const result = await loadGuide(HC_PALA);

    expect(result.truncated).toBe(true);
    expect(result.rawSampleTotalAvailable).toBe(2000);
    // 30 pages × 50 = 1500 chars
    expect(result.rawSamplePoolSize).toBe(1500);
    // 5 server + 30 raw pages = 35 calls
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(35);
  });

  // Test 12: Same request twice — second is source:cache with no additional fetches
  it("12. same request twice: second call is source:cache, no fetches", async () => {
    mockFetchWithPages(makePageResponse(4, 4));

    await loadGuide(HC_PALA);
    const calls1 = vi.mocked(fetch).mock.calls.length;

    const second = await loadGuide(HC_PALA);
    expect(second.source).toBe("cache");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls1);
  });

  // Test 13: Different className — BOTH server and raw cache miss (class is now in raw key)
  it("13. different className triggers both server and raw cache misses", async () => {
    mockFetchWithPages(makePageResponse(4, 4));

    // Warm with Paladin
    await loadGuide(HC_PALA);
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;

    // Request with Sorceress — className in raw key → raw cache MISS
    const HC_SORC: GuideRequest = {
      filter: { gameMode: "hardcore", className: "Sorceress", minLevel: 85 },
      skills: [],
    };

    const result = await loadGuide(HC_SORC);
    expect(result.source).toBe("live");
    const callsAfterSecond = vi.mocked(fetch).mock.calls.length;
    // Both server (5) and raw (1 page for total=4) re-fetched = 6 new calls
    expect(callsAfterSecond - callsAfterFirst).toBe(6);
  });

  // Test 14: Raw fetch fails, server fetches succeed, no raw cache → re-throws
  it("14. raw fetch fail with no raw cache re-throws", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("characters?")) {
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

  // Test 15: Raw fetch fails, stale raw cache exists → uses stale
  it("15. stale raw cache used when raw fetch fails", async () => {
    mockFetchWithPages(makePageResponse(4, 4));

    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");
    const rawPoolSize = first.rawSamplePoolSize;

    // Advance past raw TTL (24h + 1ms)
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 86_400_001);

    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("characters?")) {
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

    const result = await loadGuide(HC_PALA);
    expect(result.rawSamplePoolSize).toBe(rawPoolSize);
    // Source is "live" because server was re-fetched
    expect(result.source).toBe("live");
  });

  // Test 16: clearCache() empties both server and raw cache keys
  it("16. clearCache empties both server and raw cache keys", async () => {
    mockFetchWithPages(makePageResponse(4, 4));

    await loadGuide(HC_PALA);
    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");

    await clearCache();

    const afterClear = await loadGuide(HC_PALA);
    expect(afterClear.source).toBe("live");
  });

  // Test 17: onProgress callback is called during multi-page fetch
  it("17. onProgress callback receives progress messages", async () => {
    // total=100 → 2 pages
    mockFetchWithPages(makePageResponse(100, 50), makePageResponse(100, 50));

    const messages: string[] = [];
    await loadGuide(HC_PALA, (msg) => messages.push(msg));

    // Should have received at least one progress message
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("Fetching");
  });
});
