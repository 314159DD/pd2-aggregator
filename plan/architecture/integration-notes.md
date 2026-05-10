# Integration notes — pd2-aggregator → pd2.tools

**Updated:** 2026-05-11
**Status:** Planning — awaiting conversation with [@coleestrin](https://github.com/coleestrin)

After the Reddit launch of `pd2-aggregator.vercel.app`, coleestrin (pd2.tools maintainer) offered to host the tool as a subpage on pd2.tools and pointed at his open-source repo for contribution. This doc captures what we'd want to align on **before** any porting work starts.

It is **not** a port plan. It is the agenda for the first conversation.

## Current stack (one paragraph)

Next.js 16 (App Router) with static export, React 19, TypeScript, Tailwind 4 + shadcn/ui, vitest. No backend — the browser talks directly to `api.pd2.tools/api/v1`. Filter + aggregation runs in a Web Worker (`src/workers/aggregate.worker.ts`); IndexedDB caches the raw character pool for 24h via `idb-keyval`. All UI state lives in URL query params — no accounts, no server state.

## What's in scope to port

Cleanly portable, framework-agnostic:

| Layer | Files | Why portable |
|---|---|---|
| Aggregation logic | `src/lib/aggregate/*`, `src/lib/shape/*`, `src/lib/filter.ts`, `src/lib/diff.ts` | Pure functions, no UI assumptions, fully tested |
| Slot lookup | `src/lib/slot.ts`, `data/item-slots.json` | Static data + small pure function |
| Skill prereq classifier | `src/lib/aggregate/skillUsage.ts`, `data/skill-prereqs.json` | Same |
| Build presets | `src/lib/buildPresets.ts`, `data/builds.json` | Same |

UI portable IF their stack is React-based:

| Layer | Files | Adaptation needed |
|---|---|---|
| UI components | `src/components/*` | Tailwind classes may need to map to their styling system |
| Page composition | `src/app/page.tsx` | Their routing convention will differ |

## What changes in their environment

This is where integration unlocks real wins over our standalone version:

- **Direct DB queries** instead of the public REST API. Eliminates the entire class of cohort-mismatch bugs we hit in Sprint 2.1.1 (skills param not being sent) — SQL filters are explicit and typed.
- **Rare/magic/crafted items aggregable.** The public API's `/item-usage` endpoint returns only Unique/Set/Runeword rows because those have stable names. With direct DB access we can aggregate rare affix patterns by base, which is what the affix-mods table already does client-side — but now sourced from the full population, not our 1500-character sample.
- **No more snapshot fallback / IndexedDB cache** — their backend has the data live.
- **No more pagination stitching** — single SQL query.
- **Larger sample.** Our standalone version is capped at MAX_PAGES × PAGE_SIZE = 1500 characters per class. Their full population is ~21k.

## Open questions for coleestrin

Working agenda. Adjust before sending.

### Stack alignment
1. What's pd2.tools' frontend framework? (Inspecting the live site suggests React, possibly Next or Vite — confirm.)
2. UI library / styling — Tailwind, MUI, custom? How rigid is the style alignment expectation?
3. Build system — what does CI look like there?

### Product placement
4. Sub-route or modal — `pd2.tools/aggregator`? `pd2.tools/builds`? Or wired into existing character pages?
5. Does pd2.tools already have a "build aggregator" concept we'd be replacing/extending, or is this net-new?
6. Are existing per-character pages a useful integration point (e.g., add a "compare to top X% of this build" panel)?

### Data layer
7. DB schema — what shape do characters/items live in on the pd2.tools backend?
8. Are there existing aggregation queries / cached views we should reuse?
9. Update cadence — is character data live or batch-imported on an interval?

### Contribution process
10. Branch / PR conventions in `coleestrin/pd2-tools`?
11. Test infra — do they have a test suite we should plug into?
12. Code review expectations and merge cadence?
13. Hosting — would the integration live behind pd2.tools' existing auth/rate limits?

### Long-term
14. Is shared maintainership on the table once the port lands, or one-shot contribution?
15. Attribution — keep a "Built by Steven Obst" line somewhere or fully blend in?

## Suggested next step

Once these are answered, decompose porting into Phase 2.x sprints. Realistic shape:

- Sprint 2.x.1 — Fork pd2-tools, port pure aggregation logic + data files. No UI yet. Add a smoke test that the aggregation produces the same output against fixture data.
- Sprint 2.x.2 — Port UI components, adapted to their styling system.
- Sprint 2.x.3 — Wire into pd2.tools' routing + DB queries. Drop our IndexedDB / public-API path.
- Sprint 2.x.4 — Launch on pd2.tools, deprecate `pd2-aggregator.vercel.app` (or keep as mirror).

Estimated total: 2–4 weeks depending on stack overlap.

## Maintenance of the standalone version

Until porting completes, `pd2-aggregator.vercel.app` stays live. The validation test suite (Sprint 2.2) keeps us honest about correctness. If porting drags out past Sprint 2.3, revisit whether the standalone version is worth ongoing maintenance.
