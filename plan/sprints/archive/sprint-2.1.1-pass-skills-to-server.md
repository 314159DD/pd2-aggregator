# Sprint 2.1.1 — Pass skills to server stats endpoints

**Branch:** `sprint/2.1.1-pass-skills-to-server` (merged to main 2026-05-10)
**Status:** COMPLETED 2026-05-10
**Goal:** Fix cohort-mismatch bug — server-side stats were never being filtered by the user's skill selection, so "Top items by slot" / mercenary / level distribution showed numbers for the whole class instead of the build.

## Outcome

One-commit hotfix on top of Sprint 2.1. Same-day catch by Steven, comparing our Trapsin filter results against `pd2.tools/builds?...&skills=...`:

```
Item                  all-Assassins pool (585)   Trapsin pool (79)
Naj's Puzzler         39 (6.67%)                  8 (10.13%)
Spirit                21 (3.59%)                 10 (12.66%)
Demon Limb            10 (1.71%)                  1 (1.27%)
Heart of the Oak       3 (0.51%)                  1 (1.27%)
```

We were showing the left column. pd2.tools' own UI shows the right column. The bug pre-dates the sprint — it's been there since the MVP launched.

## Root cause

`CommonFilter` only carried `gameMode + className + minLevel`. None of the five server stats endpoints (`item-usage`, `skill-usage`, `merc-type-usage`, `merc-item-usage`, `level-distribution`) ever saw a `skills` parameter, so all of them aggregated across the full class. The `skills` filter was being applied only client-side, to the raw character sample used by `clientAggregates`.

pd2.tools' API *does* accept a `skills` query param — verified by direct curl with and without it.

## Fix

- `src/lib/api.ts`: new `qs(filter, { skills, extra })` shape; every stats function now takes an optional `skills?: SkillReq[]` and includes it as a JSON-encoded URL param when non-empty.
- `src/lib/data-loader.ts`: `fetchServerAggregates(filter, skills)` forwards the user's skill requirements; `serverCacheKey` now incorporates skills (sorted by name for order-independence) so different skill combos get distinct cache entries. `rawCacheKey` unchanged — the raw character pool is class-scoped and reused across skill combos.
- `src/app/page.tsx`: section subtitles no longer distinguish "server pool" vs "skill-filtered" since both now reflect the same cohort.

Old cached entries are orphaned but harmless — the key shape changed, so they're never read again.

## Verification

- 126/126 tests pass (unchanged from 2.1)
- tsc --noEmit clean
- next build clean
- Manual live diff: ✓ confirmed by Steven on `pd2-aggregator.vercel.app` after deploy

## Follow-up — Sprint 2.2 candidate

The bigger lesson is that **we never had a correctness check** between our display and pd2.tools' own display. The "aggregation accuracy audit" item on the roadmap (row 16, deferred to TBD) should move up — automate a comparison of the top-10 items per slot for a handful of canonical builds against pd2.tools' UI numbers, and fail loudly on drift.
