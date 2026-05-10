# Roadmap

**Updated:** 2026-05-11 (Sprint 2.2 shipped)

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

### Sprint 2.3 — TBD

Drawn from this release's community follow-up + still-open items:
- Reach out to `coleestrin` (pd2.tools maintainer) — courtesy ping, share what's being built, ask about API courtesy limits
- **Aggregation accuracy audit (P1, raised after Sprint 2.1.1):** automated check that top-N items per slot match pd2.tools' UI for a basket of canonical builds; flag any drift. The 2.1.1 bug went undetected because no such audit existed.
- Snapshot refresh automation via GitHub Actions cron
- Privacy-friendly analytics so we know which filter combos are actually used
- Backfill popular runewords missing from `item-slots.json` (Grief, Death, Doom, BotD — not in current snapshot)
- Performance: shrink the live JSON payload (paginated stitching is slow for big classes)
- "Share this build" UX polish (OG meta tags, screenshot generation)
- Open product-vision questions still unanswered (donations stance, custom domain, open-source posture)

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
