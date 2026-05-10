# Architecture — Component Index

**Updated:** 2026-05-10

The full original design doc lives at [`../../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](../../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md). It includes the architectural rationale and the mid-implementation revision after the pd2.tools API turned out to paginate (50/page, ~1.4 GB total) instead of dumping everything in one ~3.4 MB response. **Read it before making structural changes.**

This file is the lighter-weight index for new contributors and the place to add per-component docs as the system grows.

## System Diagram

```
┌──────────── Browser ────────────┐
│                                  │
│  ┌──────────┐   ┌─────────────┐  │
│  │   UI     │   │ Web Worker  │  │
│  │ (Next.js │◄─►│ aggregate.* │  │
│  │  page)   │   │             │  │
│  └────┬─────┘   └─────────────┘  │
│       │                          │
│  ┌────▼──────────────────────┐   │
│  │   data-loader.ts          │   │
│  │  (only I/O module)        │   │
│  └────┬──────────────┬───────┘   │
│       │              │           │
│  ┌────▼──────┐  ┌────▼──────┐    │
│  │ IndexedDB │  │ snapshot  │    │
│  │ (cache)   │  │ .json     │    │
│  └───────────┘  │ (fallback)│    │
│                 └───────────┘    │
└──────────┬───────────────────────┘
           │ live fetch
           ▼
   api.pd2.tools/api/v1/characters
   (paginated REST, CORS *)
```

## Components

| Component | Description | Doc | Status |
|-----------|-------------|-----|--------|
| `data-loader` | The only I/O module. Live fetch, IndexedDB cache, snapshot fallback. | (inline in `src/lib/data-loader.ts`) | active |
| `filter` | Pure function: filters character pool by class / skills / mode / min level. | (inline in `src/lib/filter.ts`) | active |
| `aggregate/*` | Pure functions: itemsBySlot, affixMods, charms, avgStats. | (inline in `src/lib/aggregate/`) | active |
| `shape/*` | Pure functions: turn aggregated data into `BuildSheet` and `TopItems` view models. | (inline in `src/lib/shape/`) | active |
| `diff` | Pure function: compares a single character against the pool's top mods. | (inline in `src/lib/diff.ts`) | active |
| `aggregate.worker` | Web Worker host that runs filter+aggregate off the main thread. | (inline in `src/workers/aggregate.worker.ts`) | active |
| `url-state` | Pure: serialize/deserialize UI state ↔ URL params. | (inline in `src/lib/url-state.ts`) | active |

When a component grows past "obvious from the file", create a dedicated doc here from `_TEMPLATE.md`.

## Cross-Cutting Concerns

- **Module boundary discipline:** `data-loader.ts` is the only module that does network or IndexedDB I/O. Everything else is pure and unit-testable. Don't break this.
- **No server, no auth, no DB:** every concern usually solved by a backend lives in the browser or doesn't exist (state → URL, persistence → IndexedDB, identity → none).
- **Error handling:** API down → snapshot fallback. Worker error → surfaced as `error` state in the page. No retry loops.

## Key Data Flows

### Generate Guide flow

```
1. User submits FilterForm → Page.run(uiState)
2. Page calls loadGuide({ filter, skills }, onProgress)
3. data-loader: check IndexedDB → if stale/missing, fetch live → on fail, load snapshot
4. data-loader hands raw sample to worker
5. Worker filters by class/level/mode → ranks by level → aggregates
6. Returns LoadedGuide → Page renders Sections
```

### Diff vs pool flow

```
1. User submits with mode=diff, diffName=<character or account>
2. Generate Guide flow runs first (above)
3. Try pd2.tools per-account API for the named character
4. If not found, search the cached raw sample
5. If found: diffCharacter(myChar, poolAggregates) → DiffView
6. If not found: surface "push your character via pd2-character-downloader" message
```
