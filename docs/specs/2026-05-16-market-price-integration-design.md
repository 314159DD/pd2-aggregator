# Market price integration

**Date:** 2026-05-16
**Owner:** Steven Obst
**Status:** Approved (design)

## Context

`ItemFrequencyTable` shows the most-equipped uniques, sets, and runewords per slot for the filtered cohort. It tells you *what* top players wear but says nothing about *what those items cost*. Pricing is currently a second tab in a different site (`projectdiablo2.com/market`).

pd2trader.com (errolgr/pd2-trade) is a Tauri desktop app that proves the data is available: it queries `api.projectdiablo2.com/market/listing` directly. That endpoint is fully public (no auth required for reads), but the response carries no `Access-Control-Allow-Origin` header, so a browser fetch from `pd2-aggregator.vercel.app` is blocked. A tiny serverless proxy fixes that.

This sprint adds inline median prices, a per-item market deeplink, and a hover side-tooltip with the current cheapest 5 listings.

## Goals

1. **Median price column** in `ItemFrequencyTable` for every unique, set, and runeword.
2. **Market deeplink button** per row (opens the prefiltered pd2 market page in a new tab).
3. **Live hover sidecar tooltip** showing the cheapest 5 current listings (seller, price, ilvl, online status).

## Non-goals

- No charm prices. Charm market is roll-dependent and noisy. Defer.
- No affix-frequency-table prices. Same reason: meaningless without roll context.
- No historical price trends. Would require archival storage.
- No BIN vs negotiable distinction. pd2 listings don't expose it.
- No multi-currency UI. Render HR only (sub-1 HR rendered as `~0.5 HR`).

## API research notes

### Endpoint shape

`GET https://api.projectdiablo2.com/market/listing` returns `{ total, limit, skip, data: Listing[] }`. Feathers-style query params:

- `$limit=N`, `$sort[price]=1`, `$sort[bumped_at]=-1`
- `item.unique.id=<numeric>` (uniques)
- `item.is_runeword=true` + `item.runeword.key=Runeword<NN>` (runewords)
- `item.quality.name=Set` + `item.name=<set piece name>` (sets)
- `is_ladder=true`, `is_hardcore=false`

### Price field

Strings, denominated in High Runes. Examples: `"0.5"`, `".50"`, `"2"`, `"12"`. The numeric `hr_price` is sometimes `0` even when `price` is non-zero. **`price` is the source of truth.** Parsing rule: `parseFloat(price.replace(/^\./, "0."))`; treat `NaN` or `<= 0` as "no price set" and skip.

### Identifiers

- Uniques have stable numeric `item.unique.id` (e.g. Raven Frost = 276, Andariel's Visage = 346).
- Runewords use `item.runeword.key` (e.g. Insight = `Runeword62`, Leaf = `Runeword72`).
- Sets identify by `item.name` directly. The `item.set` field is `null` in samples but the `name` is reliable.

### CORS

GET responses carry no `Access-Control-Allow-Origin`. Preflight returns `Access-Control-Allow-Methods` but again no `Allow-Origin`. Browser fetches from any origin are blocked. Proxy is required.

## Architecture

```
Build time (nightly GH Action):
  scripts/build-price-snapshot.ts
    -> pages api.projectdiablo2.com/market/listing
    -> writes data/unique-ids.json (name -> unique.id map)
    -> writes data/price-snapshot.json (median + low/high + sampleCount per item)
    -> writes data/price-snapshot.unmatched.json (audit file, gitignored)

Page load (static):
  ItemFrequencyTable
    -> usePriceSnapshot() fetches /price-snapshot.json once per session
    -> renders price column from snapshot lookup by item name
    -> renders <MarketLinkButton> per row (no fetch)

User hovers an item:
  ItemTooltip (existing) renders left card
  MarketDetailsCard (new) renders right card
    -> on first hover: fetch /api/market?item.unique.id=247&$sort[price]=1&$limit=5
    -> Vercel function api/market.ts whitelists query keys, forwards to pd2,
       returns JSON with Cache-Control: s-maxage=300, stale-while-revalidate=600
    -> in-memory module cache so re-hover is instant
```

## Components

### `api/market.ts` (new, Vercel Function at repo root)

Plain `.ts` file outside `src/`. Vercel picks it up automatically alongside the static export. Roughly:

```ts
export const config = { runtime: "edge" };

const ALLOWED_KEYS = new Set([
  "item.unique.id", "item.runeword.key", "item.name",
  "item.quality.name", "item.is_runeword", "is_ladder", "is_hardcore",
  "$limit", "$sort[price]", "$sort[bumped_at]",
]);

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "$limit" && Number(v) > 25) continue;
    out.set(k, v);
  }
  const upstream = `https://api.projectdiablo2.com/market/listing?${out}`;
  const res = await fetch(upstream);
  return new Response(res.body, {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
```

- Edge runtime keeps cold start near zero.
- Whitelist + `$limit <= 25` cap prevents abuse (open-relay risk).
- 5-minute edge cache means popular items (Shako, SoJ) hit pd2 ~12 times/day total.

### `scripts/build-price-snapshot.ts` (new)

CLI script in the same style as `build-item-slots.ts` and `build-skill-prereqs.ts`. Run with `npx tsx scripts/build-price-snapshot.ts`. Steps:

1. **Harvest unique IDs**: page `?$limit=250&item.quality.name=Unique` until exhausted, build `name -> unique.id` map, write `data/unique-ids.json`.
2. **Price uniques**: for each unique ID, fetch `?item.unique.id=N&is_ladder=true&$sort[price]=1&$limit=50`. Parse prices, drop NaN/<=0, drop corrupted (`item.corrupted=true`). Compute median, low (cheapest), high (most expensive of the sample).
3. **Price runewords**: page `?item.is_runeword=true` to harvest `runeword.key -> name`, then per-key fetch the same way.
4. **Price sets**: page `?item.quality.name=Set` to harvest unique set-piece `item.name` values, then per-name fetch.
5. **Pacing**: `await sleep(200)` between requests. ~2 min total for ~2k items.
6. **Write outputs**: `data/price-snapshot.json` (committed), `data/price-snapshot.unmatched.json` (gitignored, lists items in `data/item-slots.json` that the script failed to price; we eyeball it after first run).

### `data/price-snapshot.json` shape

Keyed by the same item name that `ItemFrequencyTable` already uses (`it.itemName`), so lookup is a direct map hit.

```json
{
  "generatedAt": "2026-05-17T03:00:00Z",
  "items": {
    "Stone of Jordan": {
      "type": "Unique",
      "uniqueId": 247,
      "medianHr": 0.5,
      "low": 0.3,
      "high": 1.0,
      "sampleCount": 50
    },
    "Tal Rasha's Lidless Eye": {
      "type": "Set",
      "medianHr": 3.0,
      "low": 2.0,
      "high": 5.0,
      "sampleCount": 50
    },
    "Insight": {
      "type": "Runeword",
      "runewordKey": "Runeword62",
      "medianHr": 2.0,
      "low": 1.5,
      "high": 3.5,
      "sampleCount": 50
    }
  }
}
```

Estimated size: ~2000 entries x ~150 bytes = ~300 KB uncompressed, ~50 KB gzipped. Acceptable as a static asset.

### `src/lib/price/parse.ts` (new, pure)

```ts
export function parsePriceHr(raw: string | undefined): number | null;
export function formatPrice(hr: number): string; // "0.5 HR", "12 HR", "~25 HR"
export function median(values: number[]): number;
```

Pure functions. Unit tested.

### `src/lib/price/snapshot.ts` (new, browser)

```ts
export type PriceEntry = { type: "Unique" | "Set" | "Runeword"; medianHr: number; low: number; high: number; sampleCount: number; uniqueId?: number; runewordKey?: string };
export function usePriceSnapshot(): Map<string, PriceEntry>;
```

Same module-cache + suspense-friendly pattern as `useItemsData` in `ItemTooltip.tsx`. Fetches `/price-snapshot.json` once per session, returns empty map until loaded.

### `src/lib/price/marketUrl.ts` (new, pure)

```ts
export function buildMarketUrl(entry: PriceEntry, name: string): string;
// -> "https://www.projectdiablo2.com/market?item.unique.id=247"
// or "https://www.projectdiablo2.com/market?item.name=Insight&item.is_runeword=true"
```

Mirrors the deeplink format `projectdiablo2.com/market` accepts on its search page. Unit tested.

### `src/lib/price/marketApi.ts` (new, browser)

```ts
export type Listing = { sellerName: string; priceHr: number; ilvl: number; isOnline: boolean; listingId: string };
export async function fetchListings(entry: PriceEntry): Promise<Listing[]>;
```

Hits `/api/market?...` (our Vercel proxy). Module-level cache keyed by `(uniqueId | runewordKey | setName)`. Maps the rich upstream response down to the `Listing` shape we render.

### `src/components/MarketDetailsCard.tsx` (new)

Renders the right-side hover card. Props: `entry: PriceEntry`. States:

- **Idle** (not hovered yet): empty/hidden.
- **Loading** (first hover, in flight): skeleton rows.
- **Loaded**: 5 rows. Each row: seller name (links to `https://www.projectdiablo2.com/market/listing/<id>`), price in HR, ilvl, green/grey online dot.
- **Empty**: "no current listings".
- **Error**: "market unavailable" (don't break the page).

### `src/components/MarketLinkButton.tsx` (new)

Tiny `<a target="_blank" rel="noopener noreferrer">` with the deeplink and a `↗` icon. No fetch, no state.

### `src/components/ItemFrequencyTable.tsx` (modified)

Add new column between `pct` and the action button. Add `<MarketLinkButton>` at the row tail. Read prices from `usePriceSnapshot()`.

### `src/components/ItemTooltip.tsx` (modified)

Wrap the existing tooltip card and the new `<MarketDetailsCard>` in a horizontal flex container, both children of the hover-revealed `<span>`. No change to the existing card; the sidecar just renders next to it.

## Operations

### Nightly snapshot refresh

`.github/workflows/refresh-price-snapshot.yml`:

```yaml
name: Refresh price snapshot
on:
  schedule:
    - cron: "0 3 * * *"  # 3 AM UTC nightly
  workflow_dispatch:
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx tsx scripts/build-price-snapshot.ts
      - name: Commit if changed
        run: |
          git config user.name "pd2-aggregator-bot"
          git config user.email "bot@pd2-aggregator.local"
          git add data/price-snapshot.json data/unique-ids.json
          git diff --staged --quiet || git commit -m "data: refresh price snapshot"
          git push
```

Idempotent. Skips commit if nothing changed. Same pattern can later replace the manual `scripts/refresh-snapshot.ts` cron mentioned in roadmap item #17.

### Vercel free-tier headroom

Hobby plan limits: 100k function invocations/month, 100 GB-hours. With 5-min edge cache on the proxy and ~500 unique items hovered per day at modest traffic, expected usage is well under 5k invocations/month. No upgrade needed.

### Heads-up to Cole

We're a new client for `api.projectdiablo2.com`. Courtesy ping through the existing PR #20 thread before this lands on production. Lower risk of being rate-limited or shut out.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| pd2 starts rate-limiting | Lift edge cache TTL from 5 min to 1 h. Worst case: fall back to snapshot-only and pull the proxy. |
| PD2 patch adds new items not in snapshot | Snapshot rebuild covers it. Same maintenance posture as `data/item-slots.json` and `data/skill-prereqs.json`. |
| Set-piece names don't match between pd2.tools and pd2 market | `data/price-snapshot.unmatched.json` audit file surfaces mismatches after first run. Likely small handful, fix by hand. |
| Proxy abuse (open relay) | Whitelist query keys + `$limit <= 25` cap. Worst case: pull the function. |
| pd2 schema change | Snapshot script breaks loudly (next CI run fails to commit). Existing data stays live until we fix. |
| Static export + Vercel Function | Vercel honors `/api/*.ts` at the repo root alongside `out/`. Verified by reviewing Vercel docs; smoke test in the implementation plan. |

## Testing

| Layer | What | How |
|-------|------|-----|
| `parsePriceHr` | string -> number, edge cases (`.50`, NaN, negative) | unit test |
| `median` | odd/even counts, empties | unit test |
| `buildMarketUrl` | unique / set / runeword URL shapes | unit test |
| Snapshot builder | end-to-end with a fixture response | unit test against captured fixture JSON |
| `MarketDetailsCard` | loading / loaded / empty / error states | component test with mocked `fetchListings` |
| `ItemFrequencyTable` price column | renders from snapshot, missing entries show blank | extends existing test |
| Live API | none in CI | manual smoke after first GH Action run |

## Sprint shape

Sprint 3.1, branch `sprint/3.1-market-prices`. Tasks roughly:

1. Snapshot builder + price-parse utilities + tests (`scripts/build-price-snapshot.ts`, `src/lib/price/*.ts`). First run, eyeball `unmatched.json`, fix mappings.
2. Vercel proxy (`api/market.ts`). Manual smoke from the deployed preview URL.
3. UI integration: price column, `MarketLinkButton`, `MarketDetailsCard`, `ItemTooltip` layout change. Component tests.
4. GitHub Action for nightly refresh. Manual dispatch to verify.
5. Courtesy ping to Cole on PR #20.
6. Merge to main, smoke `pd2-aggregator.vercel.app`, close sprint per the checklist in `CLAUDE.md`.

Estimated effort: one long afternoon end-to-end.
