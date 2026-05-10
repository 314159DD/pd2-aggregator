# Product Vision — PD2 Build Affix Aggregator

**Updated:** 2026-05-10
**Live at:** https://pd2-aggregator.vercel.app

## What This Is

A web app that aggregates Project Diablo 2 ladder character data from the [pd2.tools](https://pd2.tools) public API and answers the question: *"For a given build (class + skills), what gear, affixes, and charms do top players actually use?"* It's a build-guide generator powered by what the live ladder is doing — not what guide-writers say to do.

## Audience

PD2 ladder players. The total Project Diablo 2 community is ~10,000 active players; the addressable audience is the subset interested in optimizing late-game gear, mostly experienced players running niche or theorycrafted builds where written guides don't exist.

## Problem

PD2 has very few written build guides, especially for off-meta builds. Players who want to know "what affixes should I roll for on my Phoenix Strike Assassin's amulet?" have nowhere to look. Meanwhile pd2.tools tracks ~21,000 ladder characters with full gear and skill data exposed via a public API, but doesn't aggregate across cohorts. This tool closes that gap.

## Core Features

1. **Cohort filter** — class + skills + game mode + min level. Returns the matching player pool from the ladder.
2. **Top items by slot** — most-equipped uniques, sets, and runewords for the cohort, ranked by frequency.
3. **Affix frequency** — for magic/rare/crafted gear by slot, the most common mods with median and p75 values.
4. **Charm patterns** — top GC and SC mods, anni / torch / gheed presence rates.
5. **Build sheet** — average skill point allocation, stat allocation, level distribution, mercenary type and gear.
6. **Diff vs pool** — given your character (fetched by account or matched from snapshot), surface which top mods you're missing.
7. **URL-shareable filters** — every filter combo produces a permalink. No accounts, no server state.

## Non-Goals

- No writes back to pd2.tools. Read-only consumer.
- No user accounts or server-side state. URL params + IndexedDB cache only.
- No real-time ladder watching. Snapshot freshness on the order of hours-to-days is acceptable.
- No competing with pd2.tools. We consume their public data; we don't replicate their UI.
- No paid tier or monetization in the foreseeable future.

## Current State

| Metric | Value |
|--------|-------|
| Phase | Post-MVP, transitioning to community release |
| Live | Yes — `pd2-aggregator.vercel.app` |
| Reddit launch | 2026-05 (positive signal from r/ProjectDiablo2) |
| Maintainer | Solo (Steven Obst) |
| Cost to run | $0 — Vercel free tier, public API, no DB |
| Data freshness | Manual refresh of `data/snapshot.json` fallback; live API hit per session |

## Architecture (High-Level)

```
[Browser]
   ├─► api.pd2.tools (live, paginated REST, CORS *)
   ├─► /data/snapshot.json (committed fallback)
   └─► IndexedDB (per-session cache)

[Web Worker]
   └─► filter → aggregate → buildSheet/topItems/affixMods/charms

[UI] ← single Next.js static-export page
```

See [architecture/](architecture/) for component detail and [techstack.md](techstack.md) for tech choices. The original design doc lives at [`../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](../docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md).

## What Success Looks Like

The transition from "personal MVP" to "community tool" succeeds when:

1. **Trusted by the community** — players reference it in Reddit / Discord build discussions without prompting from the maintainer.
2. **Aggregation is correct** — counts match pd2.tools' own filter counts (verified at least once per quarter).
3. **Fresh enough** — data is at most a few days stale at any time; snapshot refresh is automated, not manual.
4. **Low maintenance** — survives a normal week with zero hands-on work.
5. **Cost stays at $0** — stays inside Vercel free tier and pd2.tools' public API limits.

## Revenue Model

None. This is a free community tool with no monetization plans. Open question: accept donations (Ko-fi / GitHub Sponsors) to offset future hosting if free tier is exceeded? See open questions below.

## Open Questions

- [ ] **Have we contacted the pd2.tools maintainer (`coleestrin`)?** Heavy use of their public API — courtesy ping at minimum, possible collaboration at best. Lower risk of being rate-limited or shut out if we communicate.
- [ ] **Do we want to open-source this repo?** Currently private (assumed). The pd2-tools dependency is MIT, so no licensing blocker. Open-sourcing invites contributors but also accountability.
- [ ] **What's the maintenance commitment?** Sustainable solo cadence, or actively recruit a co-maintainer from the community?
- [ ] **Custom domain?** `pd2-aggregator.vercel.app` is fine; a vanity domain (`pd2builds.com` etc.) would help discoverability and survive a Vercel-account move.
- [ ] **Do we want a "save my filter" / "favorite builds" feature?** That would mean breaking the no-server-state principle. Not a small change — defer until clear demand.
- [ ] **Donations?** Decide now (clear stance) or punt until something costs money.
- [ ] **Feature priorities from Reddit feedback** — needs to be collected and triaged into Phase 2 sprints.
