import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { loadGuide, clearCache } from "./data-loader";
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

const DEFAULT_RESPONSES: Record<string, unknown> = {
  "item-usage": [ITEM_USAGE_ROW],
  "skill-usage": [SKILL_USAGE_ROW],
  "merc-type-usage": [MERC_TYPE_ROW],
  "merc-item-usage": [MERC_ITEM_ROW],
  "level-distribution": LEVEL_DIST,
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
// Shared filter fixtures
// ---------------------------------------------------------------------------

const HC_PALA: CommonFilter = {
  gameMode: "hardcore",
  className: "Paladin",
  minLevel: 85,
};

const HC_PALA_80: CommonFilter = {
  gameMode: "hardcore",
  className: "Paladin",
  minLevel: 80,
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
// Tests
// ---------------------------------------------------------------------------

describe("loadGuide", () => {
  // Test 1: First call fires fetch, returns source:"live", populates cache
  it("1. first call fires fetch and returns source:live", async () => {
    mockFetchWith(DEFAULT_RESPONSES);
    const result = await loadGuide(HC_PALA);

    expect(result.source).toBe("live");
    expect(result.filter).toEqual(HC_PALA);
    expect(result.itemUsageSampleSize).toBe(100);
    expect(result.skillUsageSampleSize).toBe(100);
    expect(result.fetchedAt).toBeGreaterThan(0);
    // fetch should have been called 5 times (one per endpoint)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);
  });

  // Test 2: Second call within TTL returns source:"cache" with no fetch
  it("2. second call within TTL hits cache (no fetch)", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm the cache
    await loadGuide(HC_PALA);
    const fetchCallsAfterFirst = vi.mocked(fetch).mock.calls.length;
    expect(fetchCallsAfterFirst).toBe(5);

    // Second call
    const cached = await loadGuide(HC_PALA);
    expect(cached.source).toBe("cache");
    // fetch should NOT have been called again
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);
  });

  // Test 3: Different filter => separate cache entry, fires fetch
  it("3. different filter creates a separate cache entry", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    await loadGuide(HC_PALA);
    const result80 = await loadGuide(HC_PALA_80);

    expect(result80.source).toBe("live");
    expect(result80.filter).toEqual(HC_PALA_80);
    // 5 calls for each filter = 10 total
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);
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
  it("5. refetches after TTL expiry", async () => {
    mockFetchWith(DEFAULT_RESPONSES);

    // Warm the cache
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);

    // Advance time past TTL (1 hour + 1 ms)
    const originalDateNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 3_600_001);

    const second = await loadGuide(HC_PALA);
    expect(second.source).toBe("live");
    // fetch called again (5 more = 10 total)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);

    // Restore
    vi.spyOn(Date, "now").mockImplementation(originalDateNow);
  });

  // Test 6: Live fetch fails AND cache exists (stale) => returns stale cache
  it("6. stale cache returned when live fetch fails", async () => {
    // First successful fetch to populate cache
    mockFetchWith(DEFAULT_RESPONSES);
    const first = await loadGuide(HC_PALA);
    expect(first.source).toBe("live");

    // Advance past TTL so the cache is "stale"
    vi.spyOn(Date, "now").mockReturnValue(first.fetchedAt + 3_600_001);

    // Now mock fetch to fail
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await loadGuide(HC_PALA);
    expect(result.source).toBe("cache");
    // Should still have the data from the first call
    expect(result.itemUsageSampleSize).toBe(100);
  });

  // Test 7: Live fetch fails AND no cache => re-throws
  it("7. re-throws when fetch fails and no cache exists", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    await expect(loadGuide(HC_PALA)).rejects.toThrow("Network error");
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
    // 5 initial + 5 after clear = 10 total
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);
  });
});
