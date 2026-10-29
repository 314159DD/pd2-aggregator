# PD2 Build Affix Aggregator

Next.js 16 static-export app that aggregates Project Diablo 2 ladder builds from its own ladder collector (API at api.pd2meta.info, `server/`) and produces filterable build guides. Live at https://www.pd2meta.info (pd2-aggregator.vercel.app redirects there).

**Status:** v2 in progress (spec `docs/superpowers/specs/2026-10-28-pd2meta-v2-design.md`). Sprint 4.1 (own pipeline + S14 stopgap) and Sprint 4.2 (Builds tab: prices, gear value, usage cards, shopping list, character table, character and account pages, LEXADIS shell) merged 2026-10-29. Next: phase 3 (server-side Meta endpoints + Meta tab on them), then phase 4 (Meta restyle + launch), phase 5 (archive S11-S13 + parity test).

**Plan is the source of truth.** If it's not in `plan/`, it doesn't exist. Start a session by reading [`plan/README.md`](plan/README.md) → [`plan/roadmap.md`](plan/roadmap.md) → the active sprint file.

## Stack
- Next.js 16 App Router, static export (`output: 'export'`)
- TypeScript, Tailwind 4, LEXADIS look (`src/app/lx.css`, `src/components/lx/`)
- vitest for unit tests
- No IndexedDB: the web holds no data cache; the server (`server/`) aggregates and caches

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
- `npx tsx scripts/build-kontra-snapshot.ts` — rebuild `data/kontra-builds.json` (build presets + tier letters) from the Dark Humility tier-list Google Sheet + the curated `data/kontra-build-skills.json` mapping (auto-refreshed nightly by the same workflow)

## Module boundaries
- Meta aggregation is server side in `server/src/api/meta/`. The web only renders what `/meta` and `/meta/diff` return.
- `src/lib/meta/api.ts` and `src/lib/builds/api.ts` are the only network modules (`src/lib/api.ts` keeps only `API_BASE`, `GameMode` and the skill-usage call used by the skill picker).
- Static data the server needs is copied byte-for-byte into `server/src/core/static/` with `node server/scripts/sync-static.js`; never edit the copies.

## Data sources
- Live: `https://api.pd2meta.info/api/v1` (our own pd2.tools-compatible API, `server/`, collector + Postgres on the VPS `/opt/pd2meta`; see `deploy/RUNBOOK.md`). Override with `NEXT_PUBLIC_API_BASE`. pd2.tools stopped collecting at Season 14.
- Prices: own `item_prices` (Unique/Set/Runeword/Rune medians from `market_listings`, hourly, sold preferred), served by `/prices` and inside `/meta`. No pd2trader.com, no snapshot fallback in the app.
- Static data copies: `data/*.json` and `public/runeword-runes.json` are the sources; `server/src/core/static/` holds the synced copies. `data/snapshot.json` and its scripts stay as script input only (not bundled). `public/price-snapshot.json` is still built nightly (it also yields `data/unique-ids.json` for market links) but the app does not read it.
- Mod dictionary: `data/mod-dictionary.json` (built by `scripts/build-mod-dictionary.ts`)
- Build tier list: Dark Humility S13 tier-list Google Sheet (`docs.google.com/spreadsheets/d/1ipTsARndewEJaREWfcDeuCelKWpCEcFy9nrigp220_Y`) -> `data/kontra-builds.json` (build presets + tiers). `data/kontra-build-skills.json` is the hand-curated build->skills mapping the sheet can't provide.

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
