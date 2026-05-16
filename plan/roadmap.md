# Roadmap

**Updated:** 2026-05-13 (Sprint 2.4 shipped — Vercel parity + polish)

## Core Loop

```
User picks filter (class + skills + mode)
       ↓
data-loader fetches/cached api.pd2.tools sample
       ↓
worker filters → aggregates (items, affixes, charms, build sheet)
       ↓
UI renders sections + optional "diff vs pool"
```

## Feature Map

| # | Feature | Priority | Phase | Sprint | Status |
|---|---------|----------|-------|--------|--------|
| 1 | Cohort filter (class + skills + mode + min level) | Core | 1 | shipped | done |
| 2 | Top items by slot | Core | 1 | shipped | done |
| 3 | Affix frequency w/ median + p75 | Core | 1 | shipped | done |
| 4 | Charm panel | Core | 1 | shipped | done |
| 5 | Build sheet (skills, stats, mercenary) | Core | 1 | shipped | done |
| 6 | Diff vs pool (your char) | Core | 1 | shipped | done |
| 7 | URL-shareable filter state | Core | 1 | shipped | done |
| 8 | Snapshot fallback when API down | Core | 1 | shipped | done |
| 9 | Avg build stats / dynamic top-mod selection | Enhancement | 1 | shipped | done |
| 10 | Reddit launch + community signal | Milestone | 1 | shipped | done |
| 11 | Reddit feedback triage → Sprint 2.1 scope | Process | 2 | 2.1 | done |
| 12 | Skill prereq classification (commenter A) | Bugfix | 2 | 2.1 | done |
| 13 | Item-slot misclassification fix (commenter D) | Bugfix | 2 | 2.1 | done |
| 14 | Charm-in-slot diff fix (commenter F) | Bugfix | 2 | 2.1 | done |
| 15 | Build preset buttons | Enhancement | 2 | 2.1 | done |
| 16 | Aggregation accuracy audit vs pd2.tools | Quality | 2 | TBD | pending |
| 17 | Snapshot refresh automation (CI cron) | Infra | 2 | TBD | pending |
| 18 | Contact pd2.tools maintainer | Process | 2 | TBD | pending |
| 19 | Lightweight analytics (privacy-friendly) | Enhancement | 2 | TBD | pending |
| 20 | Inline market prices + live hover sidecar | Enhancement | 3 | 3.1 | done |

## Phase 1 — MVP (DONE)

**Status:** Complete as of 2026-05 Reddit launch.
**Goal:** Working personal-use aggregator with full filter / aggregate / diff loop, deployed to Vercel.

**Delivered:**
- All Core features from the feature map (#1–10)
- Static export on Vercel free tier, $0 cost
- Live data + snapshot fallback architecture
- D2-themed UI (collapsible sections, MatchBanner, rarity colors)

**Detail:** Recent commit history on `main`. Design context: [`../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md).

## Phase 2 — Community Release

**Start:** TBD (pending Reddit feedback triage)
**Goal:** Make this a tool the community trusts and uses without hand-holding from the maintainer. Sustain low operational burden.

The sprints below are scaffolded but not yet detailed — they'll be filled in once Sprint 2.1 surfaces concrete priorities from Reddit / Discord feedback.

### Sprint 2.1 — Post-launch bugfixes (DONE 2026-05-10)

**Branch:** `sprint/2.1-post-launch-bugfixes` (merged to main)
**Detail:** [`sprints/archive/sprint-2.1-post-launch-bugfixes.md`](sprints/archive/sprint-2.1-post-launch-bugfixes.md)

**Delivered:**
- **Skill prereq classifier** — `data/skill-prereqs.json` (220 skills × 7 classes scraped from `wiki.projectdiablo2.com`), client-side `aggregateSkillUsage` that classifies 1-pt prereqs vs real-investment skills. Build sheet hides prereqs by default; "Show prerequisites (N)" toggle reveals them. Fixes commenter A.
- **Item-slot map regenerated from snapshot** — `data/item-slots.json` 61 → 475 entries; 38 corrections including Halaberd's Reign (PD2 Primal Helm) which the old hand-rolled file had listed as a weapon. New `scripts/build-item-slots.ts` makes the file reproducible. Fixes commenter D.
- **Diff view zone gate** — `slotFromRawItem` now requires `location.zone === "Equipped"` before classifying. The pd2.tools API leaves `location.equipment` populated with garbage on inventory items; we were trusting it. Fixes commenter F + silently fixes the same pollution in the affix-mods table.
- **Build preset buttons** — `data/builds.json` × 50 canonical builds across 7 classes, one-click skill filter under the class selector. Active preset highlights when current filter matches.

**Verification:** test suite grew 90 → 126; tsc clean; next build clean. Live verification on `pd2-aggregator.vercel.app` after merge.

### Sprint 2.1.1 — Pass skills to server stats endpoints (DONE 2026-05-10)

**Branch:** `sprint/2.1.1-pass-skills-to-server` (merged to main)
**Detail:** [`sprints/archive/sprint-2.1.1-pass-skills-to-server.md`](sprints/archive/sprint-2.1.1-pass-skills-to-server.md)

**One-commit hotfix.** Cohort-mismatch bug spotted by Steven post-2.1 deploy: our server-stats sections (top items, mercenary, level distribution) were aggregating across the entire class, not the skill-filtered cohort. The bug pre-dated Sprint 2.1 — pd2.tools' API accepts a `skills` query param, our client never sent one. Now passed on all five server endpoints; cache key extended to include skills.

### Sprint 2.2 — Correctness audit + integration prep (DONE 2026-05-11)

**Branch:** `sprint/2.2-correctness-audit` (merged to main)
**Detail:** [`sprints/archive/sprint-2.2-correctness-audit.md`](sprints/archive/sprint-2.2-correctness-audit.md) · [`docs/specs/2026-05-11-sprint-2.2-correctness-audit-design.md`](../docs/specs/2026-05-11-sprint-2.2-correctness-audit-design.md)

**Delivered:**
- **Validation test suite** — `src/lib/validation/parity.test.ts` + 7 canonical-build fixtures + `scripts/refresh-validation-fixtures.ts`. Catches the 2.1.1 + 2.1.2 bug shapes. Fixture refresh is single-purpose; URL contract is covered by separate mocked-fetch tests in `src/lib/api.url-contract.test.ts`.
- **Open-source posture** — `LICENSE` (MIT, matching `coleestrin/pd2-tools`), full `README.md` rewrite with attribution.
- **Integration prep** — `plan/architecture/integration-notes.md` captures the conversation agenda for coleestrin (current stack, portability map, open questions, suggested port decomposition).

**Verification:** test suite grew 126 → 180 (+54: 12 URL contract + 42 parity). tsc clean. next build clean.

### Sprint 2.3 — pd2-tools integration (SHIPPED TO PR 2026-05-11)

**Branch:** `feature/meta-build-aggregator` on `314159DD/pd2-tools` (fork of `coleestrin/pd2-tools`)
**PR:** [coleestrin/pd2-tools#20](https://github.com/coleestrin/pd2-tools/pull/20)
**Detail:** [`sprints/archive/sprint-2.3-pd2-tools-integration.md`](sprints/archive/sprint-2.3-pd2-tools-integration.md)

**Delivered:**
- Backend: new `/api/v1/meta` route on `coleestrin/pd2-tools` with 7 aggregation methods on `MetaDB_Postgres`. 67 parity tests against this repo's fixture corpus.
- Frontend: `/meta` page in Mantine. 11 components total (8 ported, 3 new: `AvgStatsPanel`, `CollapsibleSection`, `TopAffixAveragesPanel`).
- New data file: `web/src/data/skill-classification.json` (220+ skills tagged Core or Synergy) generated by `scripts/build-skill-classification.py` (wiki-tree-to-role mapper).
- UX iteration on Steven's clicktrough: compact skill picker, responsive class labels, fixed-width tables, single popularity-sorted Core Skills list with Type pills, collapsible sections, BETA badge.
- Average build stats from `character.attributes` + life + mana plus a `TopAffixAveragesPanel` for cross-slot affix averages. Resistances skipped on purpose.

**Awaiting:** Cole's review on PR #20.

### Sprint 2.4 — Vercel parity + polish (DONE 2026-05-13)

**Branch:** worked on `main` directly (eleven commits, all live)
**Detail:** [`sprints/archive/sprint-2.4-vercel-parity-and-polish.md`](sprints/archive/sprint-2.4-vercel-parity-and-polish.md)

**Delivered:**
- **Feature parity with PR #20** for the standalone Vercel app: own collapsible "Average build stats" section (CoreStatsPanel + TopAffixAveragesPanel), level-distribution bar chart, Core/Synergy classification with toggles + Type pill column + Hard %, item hover tooltips with image / req-level / attribute lines, min-level slider clamped to 80–99, resists + skill/proc filtered from cross-slot affix views.
- **Sidebar interactivity bug fixed** — `FilterForm` now refetches `/skill-usage` when the skill selection changes, so the popularity list re-aggregates within the filtered cohort the way pd2.tools/builds does.
- **Self-hosted skill icons** — 218 PNGs mirrored from `pd2.tools/icons/` into `public/icons/`, replacing the wiki MediaWiki redirect that was dropping skills like Prayer.
- **Buy Me a Coffee button** in the header (hand-rolled to match the user's BMC generator settings; D2-gold theme; no external requests so ad blockers can't strip it).
- **Polish:** custom favicon (`src/app/icon.png`), centered dev callout, "Generate Guide" → "Generate", clearer skill-picker empty state, Discord callout copy.
- **Vercel Web Analytics** wired (`@vercel/analytics`); needs the dashboard toggle flipped to start collecting.

**Carried forward (not blocking):**
- Enable Web Analytics in the Vercel dashboard
- `items.json` + skill icons will go stale on PD2 patches — needs a CI cron eventually
- Per-character synergy classification (long-term — current static class-level classification is fine for now)
- Decision on whether the standalone stays live as a mirror once `pd2.tools/meta` ships
- Aggregation accuracy audit (still open from Sprint 2.1.1)
- Backfill popular runewords missing from `item-slots.json` (Grief, Death, Doom, BotD)
- Performance: shrink the live JSON payload (paginated stitching is slow for big classes)
- "Share this build" UX polish (OG meta tags, screenshot generation)
- Open product-vision questions (donations stance, custom domain, open-source posture)

### Sprint 3.1 - Market price integration (SHIPPED 2026-05-16, awaiting merge)

**Branch:** `sprint/3.1-market-prices`
**Detail:** [`sprints/sprint-3.1-market-prices.md`](sprints/sprint-3.1-market-prices.md)
**Design:** [`../docs/specs/2026-05-16-market-price-integration-design.md`](../docs/specs/2026-05-16-market-price-integration-design.md)

**Delivered:**
- Inline median price column on `ItemFrequencyTable` for uniques, sets, and runewords (634 priced items in the first snapshot).
- Per-row deeplink button to `projectdiablo2.com/market`.
- Live hover sidecar (`MarketDetailsCard`) showing the cheapest 5 listings via a Vercel Edge proxy at `api/market.ts`.
- Nightly GH Action refreshing `public/price-snapshot.json`.

**Verification:** test suite 180 to 201 (+21). tsc clean. next build clean.

## Future Phases

Speculative — only commit when Phase 2 shows demand.

### Phase 3 — Quality of Life

- Saved/favorited filters (would require account or local-only persistence)
- Build comparison (filter A vs filter B side by side)
- "Trending builds this week" — needs historical snapshots
- Mobile-friendly polish

### Phase 4 — Possibilities

- Browser extension that overlays aggregator data inside pd2.tools character pages
- Discord bot that answers "what helm should my Hammerdin look for?"
- Historical trend tracking (requires snapshot archival, real storage cost)
