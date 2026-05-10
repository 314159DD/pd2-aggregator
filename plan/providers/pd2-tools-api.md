# api.pd2.tools

**Updated:** 2026-05-10
**Status:** Active — **critical** dependency
**Type:** Unauthenticated REST API (public)

## What It Provides

The entire dataset for this project. `pd2.tools` is a community-run site by `coleestrin` that scrapes Project Diablo 2 ladder character data and exposes it via a public REST API at `https://api.pd2.tools/api/v1`. We hit it from the browser to get character pools (gear, skills, stats) for aggregation. Without this API, the project cannot function — the snapshot fallback is a courtesy, not a substitute.

## Integration

- **Base URL:** `https://api.pd2.tools/api/v1`
- **Auth:** None. CORS: `Access-Control-Allow-Origin: *`.
- **SDK:** None — raw `fetch` from `src/lib/api.ts` and `src/lib/data-loader.ts`.
- **Endpoints used:**
  - `GET /characters?...` — paginated character list (50 per page). Used for the main pool.
  - `GET /characters?account=<name>` — characters for one account. Used by the "Diff vs pool" feature.

## Pagination Reality

The original design doc assumed `/characters` returned all ~21k characters in one ~3.4 MB payload. That's wrong — it paginates 50 per page and the full dataset is ~1.4 GB. See the "Revised data layer" section of [`../../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](../../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md) for the corrected approach (server-side filter to shrink the cohort, then stitch enough pages to cover the filter).

## Pricing & Limits

| Tier | Cost | Limits |
|------|------|--------|
| Public (only tier) | $0 | Unknown. No documented rate limits. We use courteously. |

## Key Files

| File | Usage |
|------|-------|
| `src/lib/api.ts` | Low-level fetch wrappers |
| `src/lib/data-loader.ts` | Coordinator — live fetch / IndexedDB cache / snapshot fallback |
| `data/snapshot.json` | Committed fallback when the API is down |
| `scripts/refresh-snapshot.ts` | Manual snapshot refresh tool |
| `data/mod-dictionary.json` | Built from `coleestrin/pd2-tools` (MIT) — affix label translation |

## Configuration

None. Hardcoded base URL.

## Gotchas

- **Pagination, not single-dump.** See above. Don't assume `/characters` returns everything.
- **`coleestrin/pd2-tools` is MIT-licensed.** We copy mod-label and item-base data with attribution. See [`../../docs/decisions/2026-05-08-pd2-tools-license.md`](../../docs/decisions/2026-05-08-pd2-tools-license.md).
- **No SLA, no contact channel documented.** We have no contract — courtesy is everything. Sustained heavy traffic without a heads-up to the maintainer would be antisocial.

## Alternatives

- **None viable.** This is the only public source of PD2 ladder character data with full gear and skill detail. If `pd2.tools` shut down or removed the API, this project would have to either scrape directly (against ToS, fragile) or shut down.

## Open Questions

- [ ] What rate-limit / fair-use policy applies? We should contact `coleestrin`.
- [ ] Should we mirror the snapshot to a CDN-cached URL (e.g., GitHub raw via `cdn.jsdelivr.net`) so the live API only gets hit on demand, not by every page load?

## Links

- API base: https://api.pd2.tools/api/v1
- Frontend: https://pd2.tools
- Source: https://github.com/coleestrin/pd2-tools (MIT)
- License decision: [`../../docs/decisions/2026-05-08-pd2-tools-license.md`](../../docs/decisions/2026-05-08-pd2-tools-license.md)
