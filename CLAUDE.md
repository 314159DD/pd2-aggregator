# PD2 Build Affix Aggregator

Personal-use Next.js 15 static-export app that aggregates Project Diablo 2 ladder builds from the pd2.tools public API and produces filterable build guides.

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
`docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`
