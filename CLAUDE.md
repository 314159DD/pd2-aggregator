# PD2 Build Affix Aggregator

Next.js 16 static-export app that aggregates Project Diablo 2 ladder builds from the pd2.tools public API and produces filterable build guides. Live at https://pd2-aggregator.vercel.app.

**Status:** Phase 1 (MVP) shipped + launched on Reddit (2026-05). Phase 2 (community release) — Sprint 2.1 pending: triage post-launch feedback.

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

## Module boundaries
- `src/lib/data-loader.ts` is the ONLY module that does network or IndexedDB I/O.
- `src/lib/filter.ts`, `src/lib/aggregate.ts`, `src/lib/diff.ts` are pure functions. Easy to unit test.
- The web worker (`src/workers/aggregate.worker.ts`) is the only place async aggregation runs.

## Data sources
- Live: `https://api.pd2.tools/api/v1/characters` (~3.4 MB JSON, CORS *)
- Snapshot fallback: `data/snapshot.json` (committed; refreshed manually)
- Mod dictionary: `data/mod-dictionary.json` (built by `scripts/build-mod-dictionary.ts`)

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
