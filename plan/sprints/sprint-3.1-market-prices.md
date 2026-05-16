# Sprint 3.1 - Market price integration

**Status:** Shipped 2026-05-16 (awaiting merge to main + Vercel preview verification)
**Branch:** sprint/3.1-market-prices
**Design:** [`../../docs/specs/2026-05-16-market-price-integration-design.md`](../../docs/specs/2026-05-16-market-price-integration-design.md)
**Plan:** [`../../docs/superpowers/plans/2026-05-16-market-price-integration.md`](../../docs/superpowers/plans/2026-05-16-market-price-integration.md)

## What shipped

- **Inline median price column** in `ItemFrequencyTable` for uniques, sets, and runewords. Reads from `public/price-snapshot.json` (one round-trip per session via `usePriceSnapshot`).
- **Per-row market deeplink button** (small arrow icon) opens `projectdiablo2.com/market` with the right filter prefilled (`item.unique.id`, `item.runeword.key`, or `item.quality.name=Set&item.name=...`).
- **Live hover sidecar** (`MarketDetailsCard`) renders to the right of the existing `ItemTooltip`. Lazy-fetches the cheapest 5 current listings through a new Vercel Edge proxy at `api/market.ts`. Module-cached so re-hover is instant; degrades gracefully on error.
- **Vercel Edge proxy** at `api/market.ts`. Whitelist of 10 query keys; `$limit` clamped into `[1, 25]`; 8s upstream timeout; 5-minute edge cache with 10-minute stale-while-revalidate. Bypasses the missing `Access-Control-Allow-Origin` on the upstream API.
- **Nightly snapshot refresh** via `.github/workflows/refresh-price-snapshot.yml`. Cron at 03:00 UTC. Idempotent commit-if-changed.

## Files added / modified

- New: `src/lib/price/{parse,marketUrl,snapshot,marketApi}.ts` + parse/marketUrl test files
- New: `src/components/{MarketLinkButton,MarketDetailsCard}.tsx`
- New: `scripts/build-price-snapshot.ts` + test + fixture
- New: `api/market.ts` (Vercel Edge function at the repo root, outside `src/app/api/` because of static export)
- New: `.github/workflows/refresh-price-snapshot.yml`
- New data: `public/price-snapshot.json` (634 priced items), `data/unique-ids.json`
- Modified: `src/components/{ItemFrequencyTable,ItemTooltip}.tsx`, `.gitignore`, `vitest.config.ts`, `CLAUDE.md`, `plan/roadmap.md`

## Verification

- Test suite: 180 to 201 (+21: parse, median, formatPrice, marketUrl, snapshot builder).
- `npm run typecheck` clean.
- `npm run build` clean (static export still works with the new components).
- First snapshot harvested 634 priced items including Stone of Jordan (1.5 HR), Mara's Kaleidoscope (1.4 HR), Harlequin Crest (0.2 HR), Enigma (4.5 HR), Grief (0.8 HR).

## Follow-ups (not blocking)

- **Shako and Doom still missing** from the snapshot. Shako is the pd2.tools name for "Harlequin Crest" (which IS priced under that name); needs a manual aliases table. Doom (the runeword) returns 0 results from the pd2 market API; may be a defunct runeword in current PD2.
- **1018 items unmatched** between `data/item-slots.json` and the snapshot, mostly random-magic items the snapshot was never going to cover. Worth eyeballing the audit file (`data/price-snapshot.unmatched.json`) for any popular items that slipped.
- **Charm prices in `CharmPanel.tsx`** (deferred from spec; roll-dependent).
- **Affix-table prices** (deferred from spec; meaningless without roll context).
- **Watch Vercel function metrics** over the first week; lift edge cache TTL if needed.
- **Courtesy ping to Cole** on `coleestrin/pd2-tools` PR #20 letting him know we're using `api.projectdiablo2.com/market/listing` for price data.
