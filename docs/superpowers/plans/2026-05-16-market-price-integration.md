# Market price integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline median prices, a per-row market deeplink, and a live hover sidecar with the cheapest 5 listings to `ItemFrequencyTable`, pulling data from `api.projectdiablo2.com/market/listing`.

**Architecture:** Nightly `scripts/build-price-snapshot.ts` writes `public/price-snapshot.json` (median per item). Browser reads the static snapshot for the price column. Hover triggers a lazy live fetch through a Vercel Edge function at `api/market.ts` that bypasses the missing CORS header on `api.projectdiablo2.com`.

**Tech Stack:** Next.js 16 (static export), TypeScript, React 19, Tailwind 4, vitest, tsx, Vercel Edge Functions, GitHub Actions.

**Spec:** `docs/specs/2026-05-16-market-price-integration-design.md`

**Branch:** `sprint/3.1-market-prices` (already created)

---

## File map

**New:**
- `src/lib/price/parse.ts` — pure: `parsePriceHr`, `median`, `formatPrice`
- `src/lib/price/parse.test.ts`
- `src/lib/price/marketUrl.ts` — pure: `buildMarketUrl`
- `src/lib/price/marketUrl.test.ts`
- `src/lib/price/snapshot.ts` — browser: `usePriceSnapshot`, `PriceEntry` type
- `src/lib/price/marketApi.ts` — browser: `fetchListings`, `Listing` type
- `src/components/MarketLinkButton.tsx`
- `src/components/MarketDetailsCard.tsx`
- `scripts/build-price-snapshot.ts`
- `scripts/build-price-snapshot.test.ts` (against captured fixture)
- `scripts/fixtures/market-listing-uniques.json` (one captured page for unit test)
- `api/market.ts` — Vercel Edge function (proxy)
- `.github/workflows/refresh-price-snapshot.yml`
- `public/price-snapshot.json` (written by builder, committed)
- `data/unique-ids.json` (build cache, committed)
- `plan/sprints/sprint-3.1-market-prices.md`

**Modified:**
- `src/components/ItemFrequencyTable.tsx` — new price column + link button
- `src/components/ItemTooltip.tsx` — wrap card + sidecar in flex row
- `.gitignore` — add `data/price-snapshot.unmatched.json`
- `CLAUDE.md` — script command + status line
- `plan/roadmap.md` — sprint entry

---

## Task 1: Price parsing + median utilities

**Files:**
- Create: `src/lib/price/parse.ts`
- Create: `src/lib/price/parse.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/price/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePriceHr, median, formatPrice } from "./parse";

describe("parsePriceHr", () => {
  it("parses plain numeric strings", () => {
    expect(parsePriceHr("12")).toBe(12);
    expect(parsePriceHr("0.5")).toBe(0.5);
  });
  it("parses leading-dot fractions", () => {
    expect(parsePriceHr(".50")).toBe(0.5);
    expect(parsePriceHr(".25")).toBe(0.25);
  });
  it("returns null for invalid, zero, or negative prices", () => {
    expect(parsePriceHr("")).toBeNull();
    expect(parsePriceHr("0")).toBeNull();
    expect(parsePriceHr("-1")).toBeNull();
    expect(parsePriceHr("abc")).toBeNull();
    expect(parsePriceHr(undefined)).toBeNull();
  });
});

describe("median", () => {
  it("returns the middle value for odd-length arrays", () => {
    expect(median([1, 2, 3])).toBe(2);
  });
  it("averages the two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns NaN for empty arrays", () => {
    expect(median([])).toBeNaN();
  });
  it("handles unsorted input", () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });
});

describe("formatPrice", () => {
  it("renders whole HR without decimals", () => {
    expect(formatPrice(12)).toBe("12 HR");
    expect(formatPrice(1)).toBe("1 HR");
  });
  it("renders sub-1 HR with a tilde + 1 decimal", () => {
    expect(formatPrice(0.5)).toBe("~0.5 HR");
    expect(formatPrice(0.25)).toBe("~0.3 HR");
  });
  it("renders non-integer >1 HR with 1 decimal", () => {
    expect(formatPrice(2.5)).toBe("2.5 HR");
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- src/lib/price/parse.test.ts`
Expected: FAIL — module `./parse` not found.

- [ ] **Step 3: Implement**

`src/lib/price/parse.ts`:

```ts
export function parsePriceHr(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.startsWith(".") ? "0" + raw : raw;
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function formatPrice(hr: number): string {
  if (hr < 1) return `~${hr.toFixed(1)} HR`;
  if (Number.isInteger(hr)) return `${hr} HR`;
  return `${hr.toFixed(1)} HR`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- src/lib/price/parse.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/price/parse.ts src/lib/price/parse.test.ts
git commit -m @'
feat(price): price-string parsing + median + format utilities

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Market URL builder

**Files:**
- Create: `src/lib/price/marketUrl.ts`
- Create: `src/lib/price/marketUrl.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/price/marketUrl.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMarketUrl } from "./marketUrl";

describe("buildMarketUrl", () => {
  it("builds a unique-item URL using unique.id", () => {
    const url = buildMarketUrl(
      { type: "Unique", uniqueId: 247, medianHr: 0.5, low: 0.3, high: 1, sampleCount: 50 },
      "Stone of Jordan",
    );
    expect(url).toBe(
      "https://www.projectdiablo2.com/market?item.unique.id=247",
    );
  });

  it("builds a runeword URL using runeword.key", () => {
    const url = buildMarketUrl(
      { type: "Runeword", runewordKey: "Runeword62", medianHr: 2, low: 1.5, high: 3.5, sampleCount: 50 },
      "Insight",
    );
    expect(url).toBe(
      "https://www.projectdiablo2.com/market?item.is_runeword=true&item.runeword.key=Runeword62",
    );
  });

  it("builds a set URL using item.name + Set quality", () => {
    const url = buildMarketUrl(
      { type: "Set", medianHr: 3, low: 2, high: 5, sampleCount: 50 },
      "Tal Rasha's Lidless Eye",
    );
    expect(url).toBe(
      "https://www.projectdiablo2.com/market?item.quality.name=Set&item.name=Tal+Rasha%27s+Lidless+Eye",
    );
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- src/lib/price/marketUrl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/price/marketUrl.ts`:

```ts
import type { PriceEntry } from "./snapshot";

const BASE = "https://www.projectdiablo2.com/market";

export function buildMarketUrl(entry: PriceEntry, name: string): string {
  const p = new URLSearchParams();
  if (entry.type === "Unique" && entry.uniqueId != null) {
    p.set("item.unique.id", String(entry.uniqueId));
  } else if (entry.type === "Runeword" && entry.runewordKey) {
    p.set("item.is_runeword", "true");
    p.set("item.runeword.key", entry.runewordKey);
  } else {
    p.set("item.quality.name", "Set");
    p.set("item.name", name);
  }
  return `${BASE}?${p.toString()}`;
}
```

Note: `PriceEntry` is defined in Task 5 (`src/lib/price/snapshot.ts`). Until that file exists, this import will fail — that's intentional. The tests pass against an inline type because they construct objects literally. Add a stub at the top of `marketUrl.ts` if you're running Task 2 before Task 5:

```ts
// Temporary local type so this file compiles before Task 5 lands.
// Delete this block and uncomment the import when Task 5 ships.
type PriceEntry = {
  type: "Unique" | "Set" | "Runeword";
  uniqueId?: number;
  runewordKey?: string;
  medianHr: number;
  low: number;
  high: number;
  sampleCount: number;
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- src/lib/price/marketUrl.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/price/marketUrl.ts src/lib/price/marketUrl.test.ts
git commit -m @'
feat(price): market deeplink URL builder for uniques, sets, runewords

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 3: Snapshot builder script

**Files:**
- Create: `scripts/build-price-snapshot.ts`
- Create: `scripts/fixtures/market-listing-uniques.json`
- Create: `scripts/build-price-snapshot.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore**

Append to `.gitignore`:

```
# price-snapshot builder audit output
data/price-snapshot.unmatched.json
```

- [ ] **Step 2: Capture a real fixture for the test**

Run:

```powershell
Invoke-WebRequest -Uri 'https://api.projectdiablo2.com/market/listing?%24limit=5&item.unique.id=276' -OutFile scripts/fixtures/market-listing-uniques.json
```

This saves a real API response (Raven Frost) for use as a deterministic test fixture. Inspect with `Get-Content scripts/fixtures/market-listing-uniques.json | Select-Object -First 5` to confirm it contains `{"total":...,"data":[...]}` with valid `price` strings.

- [ ] **Step 3: Write the builder test**

`scripts/build-price-snapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { computePriceEntry } from "./build-price-snapshot";

describe("computePriceEntry", () => {
  it("computes median + low + high from a real API page", async () => {
    const raw = await readFile(
      join(process.cwd(), "scripts/fixtures/market-listing-uniques.json"),
      "utf8",
    );
    const page = JSON.parse(raw) as { data: { price: string; item: { corrupted?: boolean } }[] };
    const entry = computePriceEntry(page.data, { type: "Unique", uniqueId: 276 });
    expect(entry).not.toBeNull();
    if (entry === null) return; // narrows
    expect(entry.sampleCount).toBeGreaterThan(0);
    expect(entry.medianHr).toBeGreaterThan(0);
    expect(entry.low).toBeLessThanOrEqual(entry.medianHr);
    expect(entry.high).toBeGreaterThanOrEqual(entry.medianHr);
  });

  it("returns null when no parseable prices remain", () => {
    const entry = computePriceEntry(
      [{ price: "0", item: {} }, { price: "abc", item: {} }],
      { type: "Unique", uniqueId: 1 },
    );
    expect(entry).toBeNull();
  });

  it("drops corrupted listings", () => {
    const entry = computePriceEntry(
      [
        { price: "1", item: { corrupted: true } },
        { price: "2", item: { corrupted: false } },
      ],
      { type: "Unique", uniqueId: 1 },
    );
    expect(entry).not.toBeNull();
    expect(entry!.sampleCount).toBe(1);
    expect(entry!.medianHr).toBe(2);
  });
});
```

- [ ] **Step 4: Run test, verify failure**

Run: `npm test -- scripts/build-price-snapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the builder**

`scripts/build-price-snapshot.ts`:

```ts
/**
 * build-price-snapshot.ts
 *
 * Builds public/price-snapshot.json and data/unique-ids.json by harvesting
 * listings from api.projectdiablo2.com/market/listing.
 *
 * Schema for public/price-snapshot.json:
 *   {
 *     generatedAt: "2026-05-17T03:00:00Z",
 *     items: {
 *       "Stone of Jordan": {
 *         type: "Unique", uniqueId: 247,
 *         medianHr: 0.5, low: 0.3, high: 1.0, sampleCount: 50
 *       },
 *       ...
 *     }
 *   }
 *
 * Run:  npx tsx scripts/build-price-snapshot.ts
 * Re-run after each PD2 patch.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parsePriceHr, median } from "../src/lib/price/parse";

const API = "https://api.projectdiablo2.com/market/listing";
const PAGE_SIZE = 250;
const SAMPLE_PER_ITEM = 50;
const PACE_MS = 200;

type Identity =
  | { type: "Unique"; uniqueId: number }
  | { type: "Set" }
  | { type: "Runeword"; runewordKey: string };

type Listing = {
  price?: string;
  item?: { name?: string; corrupted?: boolean; unique?: { id?: number }; runeword?: { key?: string; name?: string } };
};

export type PriceEntry = {
  type: "Unique" | "Set" | "Runeword";
  uniqueId?: number;
  runewordKey?: string;
  medianHr: number;
  low: number;
  high: number;
  sampleCount: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<{ total: number; data: Listing[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

export function computePriceEntry(
  listings: Listing[],
  identity: Identity,
): PriceEntry | null {
  const prices = listings
    .filter((l) => !l.item?.corrupted)
    .map((l) => parsePriceHr(l.price))
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  const med = median(prices);
  return {
    type: identity.type,
    uniqueId: identity.type === "Unique" ? identity.uniqueId : undefined,
    runewordKey: identity.type === "Runeword" ? identity.runewordKey : undefined,
    medianHr: Math.round(med * 10) / 10,
    low: Math.round(Math.min(...prices) * 10) / 10,
    high: Math.round(Math.max(...prices) * 10) / 10,
    sampleCount: prices.length,
  };
}

async function harvestUniqueIds(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let skip = 0;
  for (;;) {
    const url = `${API}?%24limit=${PAGE_SIZE}&%24skip=${skip}&item.quality.name=Unique`;
    const page = await get(url);
    for (const l of page.data) {
      const name = l.item?.name;
      const id = l.item?.unique?.id;
      if (name && id != null && !map.has(name)) map.set(name, id);
    }
    skip += page.data.length;
    if (page.data.length < PAGE_SIZE || skip >= page.total) break;
    await sleep(PACE_MS);
  }
  return map;
}

async function harvestRunewordKeys(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let skip = 0;
  for (;;) {
    const url = `${API}?%24limit=${PAGE_SIZE}&%24skip=${skip}&item.is_runeword=true`;
    const page = await get(url);
    for (const l of page.data) {
      const name = l.item?.runeword?.name;
      const key = l.item?.runeword?.key;
      if (name && key && !map.has(name)) map.set(name, key);
    }
    skip += page.data.length;
    if (page.data.length < PAGE_SIZE || skip >= page.total) break;
    await sleep(PACE_MS);
  }
  return map;
}

async function harvestSetPieceNames(): Promise<Set<string>> {
  const set = new Set<string>();
  let skip = 0;
  for (;;) {
    const url = `${API}?%24limit=${PAGE_SIZE}&%24skip=${skip}&item.quality.name=Set`;
    const page = await get(url);
    for (const l of page.data) {
      const name = l.item?.name;
      if (name) set.add(name);
    }
    skip += page.data.length;
    if (page.data.length < PAGE_SIZE || skip >= page.total) break;
    await sleep(PACE_MS);
  }
  return set;
}

async function priceUnique(name: string, id: number): Promise<PriceEntry | null> {
  const url = `${API}?%24limit=${SAMPLE_PER_ITEM}&%24sort%5Bprice%5D=1&item.unique.id=${id}`;
  const page = await get(url);
  return computePriceEntry(page.data, { type: "Unique", uniqueId: id });
}

async function priceRuneword(name: string, key: string): Promise<PriceEntry | null> {
  const url = `${API}?%24limit=${SAMPLE_PER_ITEM}&%24sort%5Bprice%5D=1&item.is_runeword=true&item.runeword.key=${key}`;
  const page = await get(url);
  return computePriceEntry(page.data, { type: "Runeword", runewordKey: key });
}

async function priceSetPiece(name: string): Promise<PriceEntry | null> {
  const url = `${API}?%24limit=${SAMPLE_PER_ITEM}&%24sort%5Bprice%5D=1&item.quality.name=Set&item.name=${encodeURIComponent(name)}`;
  const page = await get(url);
  return computePriceEntry(page.data, { type: "Set" });
}

async function main() {
  const root = process.cwd();
  const itemSlots = JSON.parse(
    await readFile(join(root, "data", "item-slots.json"), "utf8"),
  ) as Record<string, string>;
  const knownNames = new Set(Object.keys(itemSlots));

  console.log("Harvesting unique IDs...");
  const uniqueIds = await harvestUniqueIds();
  console.log(`  found ${uniqueIds.size} uniques`);

  console.log("Harvesting runeword keys...");
  const runewordKeys = await harvestRunewordKeys();
  console.log(`  found ${runewordKeys.size} runewords`);

  console.log("Harvesting set piece names...");
  const setNames = await harvestSetPieceNames();
  console.log(`  found ${setNames.size} set pieces`);

  // Cache the ID map for incremental future runs.
  await writeFile(
    join(root, "data", "unique-ids.json"),
    JSON.stringify(Object.fromEntries([...uniqueIds].sort()), null, 2) + "\n",
    "utf8",
  );

  const items: Record<string, PriceEntry> = {};
  const unmatched: string[] = [];

  // Uniques
  let i = 0;
  for (const [name, id] of uniqueIds) {
    i++;
    if (i % 25 === 0) console.log(`  unique ${i}/${uniqueIds.size}: ${name}`);
    const entry = await priceUnique(name, id);
    if (entry) items[name] = entry;
    await sleep(PACE_MS);
  }

  // Runewords
  i = 0;
  for (const [name, key] of runewordKeys) {
    i++;
    if (i % 25 === 0) console.log(`  runeword ${i}/${runewordKeys.size}: ${name}`);
    const entry = await priceRuneword(name, key);
    if (entry) items[name] = entry;
    await sleep(PACE_MS);
  }

  // Set pieces
  i = 0;
  for (const name of setNames) {
    i++;
    if (i % 25 === 0) console.log(`  set ${i}/${setNames.size}: ${name}`);
    const entry = await priceSetPiece(name);
    if (entry) items[name] = entry;
    await sleep(PACE_MS);
  }

  // Audit: items in item-slots.json that we couldn't price
  for (const name of knownNames) {
    if (!(name in items)) unmatched.push(name);
  }

  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(
    join(root, "public", "price-snapshot.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        items: Object.fromEntries(Object.entries(items).sort()),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  if (unmatched.length > 0) {
    await writeFile(
      join(root, "data", "price-snapshot.unmatched.json"),
      JSON.stringify(unmatched.sort(), null, 2) + "\n",
      "utf8",
    );
  }

  console.log(`\nDone. ${Object.keys(items).length} priced items written.`);
  console.log(`Unmatched: ${unmatched.length} (see data/price-snapshot.unmatched.json)`);
}

// Only auto-run when invoked as a script, not when imported by the test.
if (process.argv[1] && process.argv[1].endsWith("build-price-snapshot.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm test -- scripts/build-price-snapshot.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Run the builder against the live API (one-shot)**

Run: `npx tsx scripts/build-price-snapshot.ts`
Expected: console output ending with `Done. <N> priced items written.` The runtime is ~5–10 minutes given pacing + page count.

Then inspect outputs:
- `public/price-snapshot.json` should contain `{ generatedAt: "...", items: { ... } }` with hundreds of entries.
- `data/unique-ids.json` should contain the name→id map.
- `data/price-snapshot.unmatched.json` should list items in `data/item-slots.json` that we couldn't price. Eyeball it — most entries should be obscure (rare bases, blue-quality affix items that aren't actually uniques/sets/runewords). If any popular item is in the unmatched list (e.g. "Stone of Jordan", "Shako"), open an issue but don't block the sprint.

- [ ] **Step 8: Commit**

```powershell
git add scripts/build-price-snapshot.ts scripts/build-price-snapshot.test.ts scripts/fixtures/market-listing-uniques.json .gitignore data/unique-ids.json public/price-snapshot.json
git commit -m @'
feat(price): nightly price snapshot builder + first snapshot

Harvests unique IDs, runeword keys, and set-piece names from
api.projectdiablo2.com/market/listing, then per-item samples the
cheapest 50 ladder listings to compute median + low + high in HR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: Vercel Edge proxy

**Files:**
- Create: `api/market.ts`

- [ ] **Step 1: Implement the Edge function**

`api/market.ts`:

```ts
export const config = { runtime: "edge" };

const ALLOWED_KEYS = new Set([
  "item.unique.id",
  "item.runeword.key",
  "item.is_runeword",
  "item.name",
  "item.quality.name",
  "is_ladder",
  "is_hardcore",
  "$limit",
  "$sort[price]",
  "$sort[bumped_at]",
]);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "$limit" && Number(v) > 25) {
      out.set(k, "25");
      continue;
    }
    out.set(k, v);
  }
  const upstream = `https://api.projectdiablo2.com/market/listing?${out.toString()}`;
  const res = await fetch(upstream);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
```

- [ ] **Step 2: Commit**

```powershell
git add api/market.ts
git commit -m @'
feat(price): Vercel Edge proxy for api.projectdiablo2.com/market/listing

Whitelists query keys, caps $limit at 25, adds Access-Control-Allow-Origin
and a 5-minute edge cache. Bypasses the missing CORS header on the
upstream API so the browser can lazy-fetch hover details.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

- [ ] **Step 3: Smoke test against a Vercel preview**

Push the branch and wait for Vercel to deploy a preview:

```powershell
git push -u origin sprint/3.1-market-prices
```

Vercel auto-deploys a preview at a URL like `https://pd2-aggregator-git-sprint-3-1-market-prices-<scope>.vercel.app`. From a browser console on that preview, run:

```js
fetch("/api/market?item.unique.id=276&%24limit=3")
  .then(r => r.json())
  .then(j => console.log(j.total, j.data.length, j.data[0].price));
```

Expected: logs a non-zero total, 3 listings, and a numeric-looking price string. If you see `total: 0` or an error, check the deployment logs in Vercel for the function.

---

## Task 5: usePriceSnapshot hook + PriceEntry type

**Files:**
- Create: `src/lib/price/snapshot.ts`

- [ ] **Step 1: Implement**

`src/lib/price/snapshot.ts`:

```ts
"use client";
import { useEffect, useState } from "react";

export type PriceEntry = {
  type: "Unique" | "Set" | "Runeword";
  uniqueId?: number;
  runewordKey?: string;
  medianHr: number;
  low: number;
  high: number;
  sampleCount: number;
};

type SnapshotFile = {
  generatedAt: string;
  items: Record<string, PriceEntry>;
};

let cache: Map<string, PriceEntry> | null = null;
let inflight: Promise<Map<string, PriceEntry>> | null = null;

function loadSnapshot(): Promise<Map<string, PriceEntry>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/price-snapshot.json")
    .then((r) => {
      if (!r.ok) throw new Error(`price-snapshot.json HTTP ${r.status}`);
      return r.json() as Promise<SnapshotFile>;
    })
    .then((f) => {
      const m = new Map<string, PriceEntry>();
      for (const [name, entry] of Object.entries(f.items)) m.set(name, entry);
      cache = m;
      return m;
    })
    .catch(() => {
      const m = new Map<string, PriceEntry>();
      cache = m;
      return m;
    });
  return inflight;
}

export function usePriceSnapshot(): Map<string, PriceEntry> {
  const [m, setM] = useState<Map<string, PriceEntry>>(cache ?? new Map());
  useEffect(() => {
    let live = true;
    loadSnapshot().then((next) => {
      if (live) setM(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return m;
}
```

- [ ] **Step 2: Remove the temporary stub in marketUrl.ts**

If Task 2 included the temporary `type PriceEntry` block at the top of `src/lib/price/marketUrl.ts`, delete it and switch to the import:

```ts
import type { PriceEntry } from "./snapshot";
```

Re-run: `npm test -- src/lib/price/marketUrl.test.ts`
Expected: PASS, still 3 tests.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/price/snapshot.ts src/lib/price/marketUrl.ts
git commit -m @'
feat(price): usePriceSnapshot hook + canonical PriceEntry type

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Live market API client

**Files:**
- Create: `src/lib/price/marketApi.ts`

- [ ] **Step 1: Implement**

`src/lib/price/marketApi.ts`:

```ts
"use client";
import { parsePriceHr } from "./parse";
import type { PriceEntry } from "./snapshot";

export type Listing = {
  listingId: string;
  sellerName: string;
  priceHr: number;
  ilvl: number;
  isOnline: boolean;
};

type RawListing = {
  _id: string;
  price?: string;
  item?: { item_level?: number; account_id?: string };
  user_last_online?: string;
};

type RawPage = { total: number; data: RawListing[] };

// Five-minute online-window matches the proxy cache TTL — anything older
// is unlikely to respond to whispers anyway.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const cache = new Map<string, Promise<Listing[]>>();

function cacheKey(entry: PriceEntry, name: string): string {
  if (entry.type === "Unique") return `u:${entry.uniqueId}`;
  if (entry.type === "Runeword") return `r:${entry.runewordKey}`;
  return `s:${name}`;
}

function buildProxyUrl(entry: PriceEntry, name: string): string {
  const p = new URLSearchParams();
  p.set("$limit", "5");
  p.set("$sort[price]", "1");
  if (entry.type === "Unique" && entry.uniqueId != null) {
    p.set("item.unique.id", String(entry.uniqueId));
  } else if (entry.type === "Runeword" && entry.runewordKey) {
    p.set("item.is_runeword", "true");
    p.set("item.runeword.key", entry.runewordKey);
  } else {
    p.set("item.quality.name", "Set");
    p.set("item.name", name);
  }
  return `/api/market?${p.toString()}`;
}

export function fetchListings(entry: PriceEntry, name: string): Promise<Listing[]> {
  const key = cacheKey(entry, name);
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = fetch(buildProxyUrl(entry, name))
    .then((r) => {
      if (!r.ok) throw new Error(`market HTTP ${r.status}`);
      return r.json() as Promise<RawPage>;
    })
    .then((page) => {
      const now = Date.now();
      const rows: Listing[] = [];
      for (const raw of page.data) {
        const price = parsePriceHr(raw.price);
        if (price === null) continue;
        const onlineMs = raw.user_last_online
          ? now - new Date(raw.user_last_online).getTime()
          : Infinity;
        rows.push({
          listingId: raw._id,
          sellerName: raw.item?.account_id ?? "unknown",
          priceHr: price,
          ilvl: raw.item?.item_level ?? 0,
          isOnline: onlineMs < ONLINE_WINDOW_MS,
        });
      }
      return rows;
    });

  cache.set(key, promise);
  // Evict on failure so the next hover retries.
  promise.catch(() => cache.delete(key));
  return promise;
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/lib/price/marketApi.ts
git commit -m @'
feat(price): browser-side live listings fetcher with per-item cache

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 7: MarketLinkButton component

**Files:**
- Create: `src/components/MarketLinkButton.tsx`

- [ ] **Step 1: Implement**

`src/components/MarketLinkButton.tsx`:

```tsx
import { buildMarketUrl } from "@/lib/price/marketUrl";
import type { PriceEntry } from "@/lib/price/snapshot";

export function MarketLinkButton({ entry, name }: { entry: PriceEntry; name: string }) {
  return (
    <a
      href={buildMarketUrl(entry, name)}
      target="_blank"
      rel="noopener noreferrer"
      title="View on pd2 market"
      className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-[#2a1e10] transition-colors"
      aria-label={`View ${name} on the pd2 market`}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
        <path d="M6 1.5h4.793L1.146 11.146l.708.708L11.5 2.207V7h1V1.5zM2.5 13.5V6.793L1.5 7.793V14.5h6.707l1-1H2.5z" />
      </svg>
    </a>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/components/MarketLinkButton.tsx
git commit -m @'
feat(price): MarketLinkButton — per-row deeplink to pd2 market

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 8: MarketDetailsCard component

**Files:**
- Create: `src/components/MarketDetailsCard.tsx`

- [ ] **Step 1: Implement**

`src/components/MarketDetailsCard.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { fetchListings, type Listing } from "@/lib/price/marketApi";
import { formatPrice } from "@/lib/price/parse";
import type { PriceEntry } from "@/lib/price/snapshot";

type Status = "idle" | "loading" | "loaded" | "error";

export function MarketDetailsCard({
  entry,
  name,
  active,
}: {
  entry: PriceEntry;
  name: string;
  active: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<Listing[]>([]);

  useEffect(() => {
    if (!active || status !== "idle") return;
    setStatus("loading");
    fetchListings(entry, name)
      .then((r) => {
        setRows(r);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, [active, status, entry, name]);

  return (
    <span className="block w-72 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] p-3 text-xs">
      <span className="block rarity-unique font-bold mb-1">Current listings</span>
      {status === "idle" && (
        <span className="block text-muted-foreground italic">hover to load</span>
      )}
      {status === "loading" && (
        <span className="block space-y-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="block h-3 bg-[#2a1e10] rounded-sm animate-pulse" />
          ))}
        </span>
      )}
      {status === "loaded" && rows.length === 0 && (
        <span className="block text-muted-foreground italic">no current listings</span>
      )}
      {status === "loaded" && rows.length > 0 && (
        <span className="block space-y-1">
          {rows.map((l) => (
            <span key={l.listingId} className="flex items-baseline gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${l.isOnline ? "bg-emerald-400" : "bg-zinc-600"}`}
                aria-label={l.isOnline ? "online" : "offline"}
              />
              <a
                href={`https://www.projectdiablo2.com/market/listing/${l.listingId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate hover:underline"
              >
                {l.sellerName}
              </a>
              <span className="tabular-nums text-foreground">{formatPrice(l.priceHr)}</span>
              <span className="tabular-nums text-muted-foreground">il{l.ilvl}</span>
            </span>
          ))}
        </span>
      )}
      {status === "error" && (
        <span className="block text-muted-foreground italic">market unavailable</span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/components/MarketDetailsCard.tsx
git commit -m @'
feat(price): MarketDetailsCard — live cheapest-5 listings on hover

Loading skeleton, empty state, error state. Module-cached so re-hover
of the same item is instant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 9: Wire MarketDetailsCard into ItemTooltip

**Files:**
- Modify: `src/components/ItemTooltip.tsx`

- [ ] **Step 1: Refactor ItemTooltip to render sidecar to the right**

The existing tooltip renders a single `<span>` card. We're going to wrap the hover-revealed region in a horizontal flex container and put `MarketDetailsCard` next to it.

Open `src/components/ItemTooltip.tsx`. Update the `Props` type and the return JSX.

Replace the existing `Props` block (around line 54–59) with:

```ts
import type { PriceEntry } from "@/lib/price/snapshot";
import { MarketDetailsCard } from "./MarketDetailsCard";

interface Props {
  name: string;
  itemType?: string;
  itemsData: Map<string, ItemData>;
  priceEntry?: PriceEntry;
  children: ReactNode;
}
```

Replace the function body's return statement (the existing `<span className="relative inline-block group/tt">...</span>` block) with:

```tsx
export function ItemTooltip({ name, itemType, itemsData, priceEntry, children }: Props) {
  const data = itemsData.get(name);
  const attrs = data?.afterAttributes ?? data?.beforeAttributes ?? "";
  const lines = attrs.split(",").map((s) => s.trim()).filter(Boolean);
  const [hovering, setHovering] = useState(false);

  return (
    <span
      className="relative inline-block group/tt"
      onMouseEnter={() => setHovering(true)}
    >
      <span className="cursor-help">{children}</span>
      <span
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 flex gap-2 opacity-0 transition-opacity duration-150 group-hover/tt:opacity-100"
        role="tooltip"
      >
        {data && (
          <span className="w-72 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] p-3 text-xs shadow-lg">
            <span className="flex items-start gap-3">
              {data.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.imageUrl}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  className="shrink-0"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              <span className="flex-1 min-w-0">
                <span className="block rarity-unique font-bold truncate">{name}</span>
                {(data.itemType || itemType) && (
                  <span className="block text-muted-foreground">
                    {data.itemType ?? itemType}
                  </span>
                )}
                {data.requiredLevel && (
                  <span className="block text-muted-foreground mt-0.5">
                    {data.requiredLevel}
                  </span>
                )}
              </span>
            </span>
            {lines.length > 0 && (
              <span className="block mt-2 space-y-0.5">
                {lines.map((l, i) => (
                  <span key={i} className="block rarity-magic leading-snug">
                    {l}
                  </span>
                ))}
              </span>
            )}
          </span>
        )}
        {priceEntry && (
          <MarketDetailsCard entry={priceEntry} name={name} active={hovering} />
        )}
      </span>
    </span>
  );
}
```

Add the `useState` import at the top:

```ts
import { useEffect, useState, type ReactNode } from "react";
```

(`useState` was not previously imported.)

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: clean, no errors.

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev`
Open: `http://localhost:3000`
Pick a build (e.g. Hammerdin) and hover an item in the top-items table. You should see two cards appear side-by-side: the existing item info on the left, "Current listings" on the right with a loading skeleton then 5 rows (or "no current listings").

If the sidecar overlaps the right edge of the screen at certain table widths, file a follow-up but don't block — the sprint primarily wants the data flowing.

- [ ] **Step 4: Commit**

```powershell
git add src/components/ItemTooltip.tsx
git commit -m @'
feat(price): wire MarketDetailsCard sidecar into ItemTooltip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 10: Add price column + MarketLinkButton to ItemFrequencyTable

**Files:**
- Modify: `src/components/ItemFrequencyTable.tsx`

- [ ] **Step 1: Wire up snapshot hook + new column**

Open `src/components/ItemFrequencyTable.tsx`. At the top, add imports:

```ts
import { usePriceSnapshot } from "@/lib/price/snapshot";
import { formatPrice } from "@/lib/price/parse";
import { MarketLinkButton } from "./MarketLinkButton";
```

In the component body, fetch the snapshot map next to the items map:

```ts
export function ItemFrequencyTable({ data }: { data: TopItemsBySlot }) {
  const itemsData = useItemsData();
  const priceData = usePriceSnapshot();
  // ... existing return ...
}
```

Update the `<colgroup>` to add two new columns (price + link button):

```tsx
<colgroup>
  <col />
  <col style={{ width: "5.5rem" }} />
  <col style={{ width: "4rem" }} />
  <col style={{ width: "4rem" }} />
  <col style={{ width: "5rem" }} />
  <col style={{ width: "1.5rem" }} />
</colgroup>
```

Update the `<ItemTooltip>` call to pass the priceEntry:

```tsx
<ItemTooltip
  name={it.itemName}
  itemType={it.itemType}
  itemsData={itemsData}
  priceEntry={priceData.get(it.itemName)}
>
  {it.itemName}
</ItemTooltip>
```

Replace the existing four `<td>` cells (name / itemType / count / pct) with six `<td>` cells, keeping the first four unchanged and adding:

```tsx
<td className="py-1 text-right tabular-nums text-muted-foreground">
  {(() => {
    const entry = priceData.get(it.itemName);
    return entry ? formatPrice(entry.medianHr) : "";
  })()}
</td>
<td className="py-1 text-right">
  {(() => {
    const entry = priceData.get(it.itemName);
    return entry ? <MarketLinkButton entry={entry} name={it.itemName} /> : null;
  })()}
</td>
```

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev`
Open: `http://localhost:3000`
For a popular build, confirm each row in "Top items by slot" shows a median price (e.g. "~0.5 HR", "12 HR") and a `↗` link button. Click a link button — it should open `projectdiablo2.com/market?...` in a new tab with the right filter applied.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass, 9 new test cases added on top of the existing count (180 → 189-ish; check the previous baseline).

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: build succeeds, no warnings about missing modules.

- [ ] **Step 6: Commit**

```powershell
git add src/components/ItemFrequencyTable.tsx
git commit -m @'
feat(price): inline median price column + MarketLinkButton in
ItemFrequencyTable

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 11: GitHub Action for nightly snapshot refresh

**Files:**
- Create: `.github/workflows/refresh-price-snapshot.yml`

- [ ] **Step 1: Create the workflow**

`.github/workflows/refresh-price-snapshot.yml`:

```yaml
name: Refresh price snapshot

on:
  schedule:
    - cron: "0 3 * * *"  # 03:00 UTC nightly
  workflow_dispatch:

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx tsx scripts/build-price-snapshot.ts
      - name: Commit if changed
        run: |
          git config user.name "pd2-aggregator-bot"
          git config user.email "bot@pd2-aggregator.local"
          git add public/price-snapshot.json data/unique-ids.json
          if git diff --staged --quiet; then
            echo "No changes to commit."
          else
            git commit -m "data: refresh price snapshot"
            git push
          fi
```

- [ ] **Step 2: Commit**

```powershell
git add .github/workflows/refresh-price-snapshot.yml
git commit -m @'
ci: nightly price-snapshot refresh GitHub Action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

- [ ] **Step 3: Trigger the workflow manually after first merge to main**

The workflow needs to live on the default branch before it can be dispatched. After the sprint merges to `main`, go to the Actions tab on GitHub and click "Run workflow" on "Refresh price snapshot". Watch the run; verify it completes successfully and either commits a fresh snapshot or reports "No changes to commit."

If the push step fails with a permissions error, double-check that "Read and write permissions" is enabled under Settings → Actions → General → Workflow permissions.

---

## Task 12: Sprint doc + roadmap + CLAUDE.md + close out

**Files:**
- Create: `plan/sprints/sprint-3.1-market-prices.md`
- Modify: `plan/roadmap.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create sprint doc**

`plan/sprints/sprint-3.1-market-prices.md`:

```markdown
# Sprint 3.1 — Market price integration

**Status:** Done <DATE>
**Branch:** sprint/3.1-market-prices (merged)
**Design:** [`../../docs/specs/2026-05-16-market-price-integration-design.md`](../../docs/specs/2026-05-16-market-price-integration-design.md)
**Plan:** [`../../docs/superpowers/plans/2026-05-16-market-price-integration.md`](../../docs/superpowers/plans/2026-05-16-market-price-integration.md)

## What shipped

- **Inline median price column** in `ItemFrequencyTable` for every unique, set, and runeword. Reads from a nightly-refreshed `public/price-snapshot.json`.
- **Per-row market deeplink** — small `↗` button opens `projectdiablo2.com/market?...` with the right filter prefilled.
- **Live hover sidecar** — `MarketDetailsCard` renders to the right of the existing `ItemTooltip`, lazy-fetches the cheapest 5 current listings through a new Vercel Edge proxy at `api/market.ts`.
- **Vercel Edge proxy** — single function, query-key whitelist, `$limit` cap at 25, 5-minute edge cache. Bypasses the missing `Access-Control-Allow-Origin` on `api.projectdiablo2.com`.
- **Nightly GitHub Action** — `.github/workflows/refresh-price-snapshot.yml` re-runs the snapshot builder at 03:00 UTC, commits if anything changed.

## Files added / modified

- New: `src/lib/price/{parse,marketUrl,snapshot,marketApi}.ts`
- New: `src/components/{MarketLinkButton,MarketDetailsCard}.tsx`
- New: `scripts/build-price-snapshot.ts` + test + fixture
- New: `api/market.ts` (Vercel Edge function)
- New: `.github/workflows/refresh-price-snapshot.yml`
- New data: `public/price-snapshot.json`, `data/unique-ids.json`
- Modified: `src/components/{ItemFrequencyTable,ItemTooltip}.tsx`, `.gitignore`, `CLAUDE.md`, `plan/roadmap.md`

## Verification

- Test suite: +X tests (parse, median, format, marketUrl, snapshot builder).
- `npm run typecheck` clean.
- `npm run build` clean.
- Vercel preview verified: proxy returns live data; hover sidecar populates.
- Production smoke after merge: pick three builds, hover top item per slot, confirm price column + sidecar populate.

## Follow-ups (not blocking)

- Charm price integration (deferred — roll-dependent).
- Affix-table price integration (deferred — meaningless without roll context).
- Watch Vercel function metrics over the first week; lift edge cache TTL if needed.
- Eyeball `data/price-snapshot.unmatched.json` after first run; fix any popular items that slipped through.
```

(Replace `<DATE>` with the actual close date and `+X tests` with the actual delta.)

- [ ] **Step 2: Update roadmap**

Add this entry to `plan/roadmap.md` under "Phase 2 — Community Release" (or open a Phase 3 section if you'd rather treat this as a new phase). Add a new sprint section in chronological order after Sprint 2.4:

```markdown
### Sprint 3.1 — Market price integration (DONE <DATE>)

**Branch:** `sprint/3.1-market-prices` (merged to main)
**Detail:** [`sprints/sprint-3.1-market-prices.md`](sprints/sprint-3.1-market-prices.md)
**Design:** [`../docs/specs/2026-05-16-market-price-integration-design.md`](../docs/specs/2026-05-16-market-price-integration-design.md)

**Delivered:**
- Inline median price column on `ItemFrequencyTable` for uniques, sets, and runewords.
- Live hover sidecar showing the cheapest 5 listings per item via a Vercel Edge proxy at `api/market.ts`.
- Per-row deeplink button to `projectdiablo2.com/market`.
- Nightly GH Action refreshing `public/price-snapshot.json`.

**Verification:** test suite +X. tsc clean. next build clean. Live verification on `pd2-aggregator.vercel.app` after merge.
```

Also add a row to the feature map table:

```markdown
| 20 | Inline market prices + live hover sidecar | Enhancement | 3 | 3.1 | done |
```

And then move the sprint file from `plan/sprints/sprint-3.1-market-prices.md` → `plan/sprints/archive/sprint-3.1-market-prices.md` once the sprint is fully closed.

- [ ] **Step 3: Update CLAUDE.md**

Bump the status line at the top of `CLAUDE.md` to reflect the new sprint. Add a new bullet to "Commands":

```markdown
- `npx tsx scripts/build-price-snapshot.ts` — rebuild `public/price-snapshot.json` from `api.projectdiablo2.com/market/listing` (auto-refreshed nightly by `.github/workflows/refresh-price-snapshot.yml`)
```

Add a new bullet to "Data sources":

```markdown
- Market prices: `api.projectdiablo2.com/market/listing` via the Vercel Edge proxy at `api/market.ts` (live) and `public/price-snapshot.json` (nightly snapshot)
```

- [ ] **Step 4: Final test + build sweep**

Run:

```powershell
npm run typecheck
npm test
npm run build
```

All three should be clean. If anything fails, fix before merging.

- [ ] **Step 5: Commit + push**

```powershell
git add plan/sprints/sprint-3.1-market-prices.md plan/roadmap.md CLAUDE.md
git commit -m @'
sprint(3.1): docs + status line update

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
git push
```

- [ ] **Step 6: Merge to main**

Confirm the Vercel production deployment from `main` rebuilds and the live site `pd2-aggregator.vercel.app` shows price columns + working hover sidecars. Then merge per the project's git workflow ("Merge to main when complete and tested" per `CLAUDE.md`).

- [ ] **Step 7: Courtesy ping Cole on PR #20**

Drop a short comment on `coleestrin/pd2-tools#20` letting Cole know we've started using `api.projectdiablo2.com/market/listing` for price data on the Vercel mirror — read-only, edge-cached at 5 min, with the proxy capped at `$limit=25`. Standing offer: turn it off if the load is a problem. (This is just communication, not code.)

- [ ] **Step 8: Close the sprint per `CLAUDE.md` checklist**

From `CLAUDE.md`:

> 1. Mark all sprint tasks `completed` in the sprint file
> 2. Update [plan/roadmap.md](plan/roadmap.md) — mark sprint done, update phase summary, add date
> 3. Update **this file** — Status line
> 4. Move sprint file: `plan/sprints/sprint-X.Y-*.md` → `plan/sprints/archive/`
> 5. Move resolved tickets: `plan/tasks/*.md` → `plan/tasks/archive/`
> 6. Merge branch to `main`

Items 2–3 are already done above. Move the sprint file to `archive/` and you're done.

---

## Self-review notes (for the executor)

- All TypeScript types referenced (`PriceEntry`, `Listing`, `ItemData`, etc.) are defined in earlier tasks in this same plan. Run tasks in order.
- The `import { parsePriceHr } from "../src/lib/price/parse"` in the snapshot builder is what couples Task 3 to Task 1 — Task 1 must land first.
- Task 2 ships before Task 5 defines `PriceEntry`. The plan includes an explicit stub-type to keep Task 2 self-contained; Task 5 removes the stub.
- Component tests (testing-library/react) are intentionally omitted — the existing codebase has zero `.test.tsx` files. We rely on manual visual smoke instead. If you decide to add component tests, that's a follow-up.
