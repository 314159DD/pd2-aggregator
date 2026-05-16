# PD2 Build Affix Aggregator

Next.js 16 static-export app that aggregates Project Diablo 2 ladder builds from the pd2.tools public API and produces filterable build guides. Live at https://pd2-aggregator.vercel.app.

**Status:** Phase 2 in progress. Sprint 2.1 shipped 2026-05-10 (Reddit bug fixes A/D/F + build presets). Sprint 2.1.1 same day — server stats endpoints now receive the `skills` filter. Sprint 2.1.2 same day — wiki-scraped `data/item-slots.json` now covers every PD2 unique/set/runeword (475 → 1591 entries; was dropping 32% of named items including M'avina set, Lore, Hellrack, Kuko Shakaku because they weren't in the snapshot). Sprint 2.2 shipped 2026-05-11 (validation test suite, MIT license, README rewrite, integration-prep doc for the coleestrin conversation). Sprint 2.3 shipped to PR 2026-05-11: full port into `coleestrin/pd2-tools` as a new `/meta` page (`feature/meta-build-aggregator` on the fork → [PR #20](https://github.com/coleestrin/pd2-tools/pull/20)). Awaiting Cole's review. Sprint 2.4 shipped 2026-05-13 — backported every PR feature into the standalone Vercel app (avg-stats section, level chart, Core/Synergy toggles, item tooltips, min-level slider clamp, sidebar interactivity fix), self-hosted skill icons + BMC button, custom favicon, Vercel Web Analytics wired. Eleven commits straight to `main`. Sprint 3.1 shipped 2026-05-16 — inline median price column + per-row market deeplinks + live hover sidecar (`MarketDetailsCard`) via Vercel Edge proxy + nightly GH Action snapshot refresh. 634 priced items in first snapshot. Awaiting merge to main.

**Plan is the source of truth.** If it's not in `plan/`, it doesn't exist. Start a session by reading [`plan/README.md`](plan/README.md) → [`plan/roadmap.md`](plan/roadmap.md) → the active sprint file.

## Stack
- Next.js 15 App Router, static export (`output: 'export'`)
- TypeScript, Tailwind, shadcn/ui
- vitest for unit tests
- idb-keyval for IndexedDB cache

## Commands
- `npm run dev` — local dev server
- `npm run build` — production static export to `out/`
- `npm test` — run unit tests
- `npm run typecheck` — type check only
- `npx tsx scripts/refresh-snapshot.ts` — refresh `data/snapshot.json`
- `npx tsx scripts/build-mod-dictionary.ts` — rebuild `data/mod-dictionary.json`
- `npx tsx scripts/build-skill-prereqs.ts` — rebuild `data/skill-prereqs.json` (scrapes wiki.projectdiablo2.com — re-run on each PD2 season patch)
- `npx tsx scripts/build-item-slots.ts` — rebuild `data/item-slots.json` from the snapshot's `location.equipment` + `base.category` (re-run after refreshing the snapshot)
- `npx tsx scripts/build-item-slots-from-wiki.ts` — extend `data/item-slots.json` with every unique/set/runeword from wiki.projectdiablo2.com (re-run after PD2 patches that add items); snapshot entries always win on conflicts
- `npx tsx scripts/refresh-validation-fixtures.ts` — refresh `src/lib/validation/fixtures/*.json` (run weekly, on PD2 patches, or when parity tests start looking suspicious)
- `npx tsx scripts/build-price-snapshot.ts` - rebuild `public/price-snapshot.json` from `api.projectdiablo2.com/market/listing` (auto-refreshed nightly by `.github/workflows/refresh-price-snapshot.yml`)

## Module boundaries
- `src/lib/data-loader.ts` is the ONLY module that does network or IndexedDB I/O.
- `src/lib/filter.ts`, `src/lib/aggregate.ts`, `src/lib/diff.ts` are pure functions. Easy to unit test.
- The web worker (`src/workers/aggregate.worker.ts`) is the only place async aggregation runs.

## Data sources
- Live: `https://api.pd2.tools/api/v1/characters` (~3.4 MB JSON, CORS *)
- Snapshot fallback: `data/snapshot.json` (committed; refreshed manually)
- Mod dictionary: `data/mod-dictionary.json` (built by `scripts/build-mod-dictionary.ts`)
- Market prices: `api.projectdiablo2.com/market/listing` via the Vercel Edge proxy at `api/market.ts` (live, hover sidecar) and `public/price-snapshot.json` (nightly snapshot, inline median column)

## Design doc
`docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md` (architectural rationale + the mid-impl revision after the API turned out to paginate)

## plan/ — Single Source of Truth

| Need | Read |
|------|------|
| Navigation hub | [plan/README.md](plan/README.md) |
| Vision + audience + core features | [plan/PRODUCT_VISION.md](plan/PRODUCT_VISION.md) |
| Current phase + what's next | [plan/roadmap.md](plan/roadmap.md) |
| What tech and why? | [plan/techstack.md](plan/techstack.md) |
| Component index | [plan/architecture/](plan/architecture/) |
| Why a decision was made | [plan/decisions/](plan/decisions/) |
| External services (api.pd2.tools etc.) | [plan/providers/](plan/providers/) |
| Sprint overview (macro) | [plan/sprints/](plan/sprints/) |
| Individual tickets (micro) | [plan/tasks/](plan/tasks/) |

### Sprint Close Checklist

1. Mark all sprint tasks `completed` in the sprint file
2. Update [plan/roadmap.md](plan/roadmap.md) — mark sprint done, update phase summary, add date
3. Update **this file** — Status line
4. Move sprint file: `plan/sprints/sprint-X.Y-*.md` → `plan/sprints/archive/`
5. Move resolved tickets: `plan/tasks/*.md` → `plan/tasks/archive/`
6. Merge branch to `main`

### Git workflow

- Branch per sprint: `sprint/X.Y-short-name`
- Merge to main when complete and tested. Don't push to main directly.
