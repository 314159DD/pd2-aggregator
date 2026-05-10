# Roadmap

**Updated:** 2026-05-10

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
| 11 | Reddit feedback triage → Phase 2 plan | Process | 2 | 2.1 | pending |
| 12 | Aggregation accuracy audit vs pd2.tools | Quality | 2 | TBD | pending |
| 13 | Snapshot refresh automation (CI cron) | Infra | 2 | TBD | pending |
| 14 | Contact pd2.tools maintainer | Process | 2 | 2.1 | pending |
| 15 | Lightweight analytics (privacy-friendly) | Enhancement | 2 | TBD | pending |

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

### Sprint 2.1 — Triage & Foundation

**Goal:** Convert post-launch community signal into a prioritized backlog, and shore up the things needed to be a "real" community tool (maintainer contact, accuracy check, basic ops hygiene).

Tentative items (to be confirmed when sprint file is written):
- Read every Reddit comment + DM, extract feature requests + bug reports into `plan/tasks/`
- Reach out to `coleestrin` (pd2.tools maintainer) — courtesy ping, share what's being built, ask about API courtesy limits
- Run an accuracy audit: do our cohort counts match pd2.tools' own filter UI? Document deltas.
- Decide donation/monetization stance (vision doc Open Question)
- Decide open-source posture (vision doc Open Question)

### Sprint 2.2+ — TBD

Drawn from triaged backlog. Likely candidates based on the existing system:
- Snapshot refresh automation via GitHub Actions cron
- Privacy-friendly analytics so we know which filter combos are actually used
- Performance: shrink the live JSON payload (paginated stitching is slow for big classes)
- "Share this build" UX polish (OG meta tags, screenshot generation)

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
