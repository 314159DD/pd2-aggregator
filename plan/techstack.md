# Technology Stack

**Updated:** 2026-05-10

## Stack Summary

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Framework | Next.js | 16.2.6 (App Router) | Static export, fast dev, owner's standard stack |
| Language | TypeScript | 5.x | Strict types over a noisy external API surface |
| UI | React | 19.2.4 | Bundled with Next |
| Styling | Tailwind CSS | 4.x | Owner's standard; pairs with shadcn/ui |
| Components | shadcn/ui + radix-ui | 4.7.0 / 1.4.3 | Owner's standard |
| Cache | idb-keyval | 6.2.2 | Tiny IndexedDB wrapper for the per-session character cache |
| Tests | vitest + @testing-library | 4.x | Fast unit tests for pure aggregation/filter modules |
| Build target | Static export (`output: 'export'`) | — | No backend needed; pure browser app |
| Hosting | Vercel free tier | — | Zero cost, sufficient for a ~10k-player community |
| Data | api.pd2.tools (public REST) | v1 | The only data source; CORS open |

## Key Decisions

Most "why we built it this way" decisions are captured in the original design doc — see [`../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md). Highlights duplicated here only when frequently relevant:

### No backend

**Chosen:** Pure static export, browser hits `api.pd2.tools` directly.
**Over:** Any server (Flask / Next API routes / serverless functions).
**Because:** CORS is open (`*`), data fits in a manageable per-session fetch, and aggregation is fast in a Web Worker. No backend means no DB, no auth, no ops, no cost.
**Revisit if:** We need cross-session state (saved filters, accounts), historical snapshots, or per-user data that can't live in URL params + IndexedDB.

### URL params as state

**Chosen:** All UI state encodes into the URL via `paramsToUiState` / `uiStateToParams`.
**Over:** localStorage, server-side filter saves.
**Because:** Free shareability, free deep-linking, zero state management complexity.
**Revisit if:** Filter state grows past what fits comfortably in a URL, or users start asking for "save my favorite builds."

### IndexedDB cache via idb-keyval

**Chosen:** Per-session character cache in IndexedDB.
**Over:** In-memory only; localStorage (5 MB cap).
**Because:** The character payload can be megabytes; localStorage chokes, in-memory wastes a fetch on every navigation.
**Revisit if:** Browser quota issues appear, or we move to fetching from a CDN-cached snapshot URL.

### Web Worker for aggregation

**Chosen:** All filter + aggregate work runs in `src/workers/aggregate.worker.ts`.
**Over:** Main-thread aggregation.
**Because:** Aggregating thousands of characters with nested gear/affix data blocks the UI thread for hundreds of ms.
**Revisit if:** Bundle size of the worker becomes problematic, or aggregation moves server-side.

### Next.js 16 (bleeding edge)

**Chosen:** Next 16.2.6.
**Over:** Next 15 (stable).
**Because:** Owner's standard, App Router is on this line, no breaking issues hit yet.
**Revisit if:** A Next 16 quirk costs significant time. `AGENTS.md` already warns AI agents to read `node_modules/next/dist/docs/` rather than relying on training data.
