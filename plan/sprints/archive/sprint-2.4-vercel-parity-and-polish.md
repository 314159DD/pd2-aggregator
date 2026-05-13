# Sprint 2.4 — Vercel parity + post-launch polish

**Branch:** pushed straight to `main` (no sprint branch — work was iterative, eleven commits)
**Status:** Shipped 2026-05-12. Live at https://pd2-aggregator.vercel.app.

**Goal:** While Cole reviews PR #20, bring the standalone Vercel app up to feature parity with the PR — same data layer, adapted to Tailwind/shadcn — and tidy the rough edges users would actually see (broken icons, missing donate button, copy, favicon, analytics).

---

## What landed

### Feature parity with PR #20

| Area | Standalone before | Standalone after |
|---|---|---|
| Min-level slider | range 1–99 (default 80) | clamped to **80–99** with marks at 80/90/99; URL parser also clamps old shareable links |
| "All slots combined" affix view | filtered meta-flags only | now also drops resists (`fireresist`/`coldresist`/`lightresist`/`poisonresist`/`all_resist` + `max*resist`) and skill-on-X procs (`item_singleskill`/`item_charged_skill`/`item_skillon*`) |
| Average build stats | embedded inside `AffixFrequencyTable`, mixed mods | own collapsible section above "Top items"; two panels (Core stats + Most common affixes); resists also dropped from `aggregateAvgStats` since they cap at 75 |
| Core stats panel | none | `AvgStatsPanel` — six cards: Strength / Dexterity / Vitality / Energy / Life / Mana, sourced from `character.attributes` + `life` + `mana` |
| Cross-slot affix avg | none | `TopAffixAveragesPanel` — top 8 mod-prevalence cards across all slots |
| Level distribution | flat pill row (`L80·123 L81·456 …`) | vertical bar chart, empty buckets dropped, native `title=` per bar showing `L{n}: {count}` |
| Skill table | prereq vs build only | adds **Core / Synergy / Prereq** classification via `data/skill-classification.json` (235 lines); two toggles ("Show synergies", "Show prerequisites"); new `Type` pill column; new `Chars 20+` and `Hard %` columns with explanatory tooltip headers |
| Item names | plain text | hover tooltips with image + `Required Level` + attribute lines, sourced from a mirrored `public/items.json` (640 KB, refresh on PD2 patches) |

### Sidebar interactivity (real bug found mid-session)

`FilterForm` was refetching `/skill-usage` only when class or game mode changed, ignoring skill toggles. So selecting Holy Bolt left the popularity list static instead of re-aggregating against "the subset of paladins who already run Holy Bolt", the way pd2.tools/builds does.

Fixed by adding the skill-name set to the effect's dep list and passing `s.skills` into `getSkillUsage`. Keyed by name only so editing minLevel chips doesn't fire a fetch on every keystroke.

### Self-hosted skill icons

Wiki MediaWiki `Special:FilePath` redirect didn't resolve for some skill slugs (Prayer the obvious one). Mirrored all 218 PD2 skill icons from `pd2.tools/icons/` into `public/icons/` (~972 KB total), pointed `FilterForm.skillIconUrl` at the same-origin path. Refresh on patches that add/rename skills.

### Buy Me a Coffee button

Three iterations:
1. Hot-linked the BMC CDN PNG → invisible because `cdn.buymeacoffee.com` is on uBlock / Brave Shields / Privacy Badger default block lists.
2. Mirrored to `public/bmc-button.png` → got the image through, but the default red didn't match the D2 gold theme and overpowered the data-freshness line.
3. **Final:** hand-rolled `<a>` button matching the user's BMC generator settings (`#c29946` background, black outline + text, Bree Serif, inline SVG coffee cup in `#FFDD00`), sized ~24 px tall. Stacks above DataFreshness on the right side of the header. No external requests, immune to blockers.

### Copy + UX polish

- "Generate Guide" button → **Generate**.
- Skill picker empty state: was "No skill filters — all Paladins at minLevel will be sampled.", now "Pick a class, pick 1-3 skills and hit Generate."
- Landing copy: was "Pick filters and click Generate Guide.", now centered "This tool is new and still in development. If you find errors or have ideas how to make it better ping `@tekk0n` on Discord."

### Infra

- **Custom favicon** — `src/app/icon.png` (PD2 character sprite). Replaces the default Next.js `favicon.ico`; App Router auto-injects the `<link>`.
- **Vercel Web Analytics** — `@vercel/analytics` installed, `<Analytics />` mounted in root layout. Needs the toggle flipped in the Vercel dashboard → Project → Analytics tab to start collecting.

---

## Things learned (worth carrying forward)

1. **Ad blockers strip `cdn.buymeacoffee.com` and `buymeacoffee.com` script imports by default.** Any donation button that depends on their CDN/JS will silently fail for ~30%+ of users. Self-host the asset, or build it inline.
2. **HC vs SC default mode is a real source of "the numbers don't match" confusion.** pd2.tools/builds defaults to softcore, our app defaults to hardcore. The data is identical — just different cohorts. Worth explaining in any future docs/screenshots, or aligning defaults if we want exact parity.
3. **`/skill-usage` returns `pct` in 0–100 form, not 0–1.** Easy to mis-multiply. The endpoint accepts a `skills` JSON-array param and re-aggregates server-side — same mechanism pd2.tools/builds uses.
4. **Vercel Edge Requests are a noisy signal.** A single visit on a static-export site can hit 40–60 requests (HTML + ~8 JS chunks + ~30 skill icons + items.json + favicon). Crawlers, deploy-verification curls, and refresh-during-testing inflate it further. Use Web Analytics for any "is this site getting visitors" question.

---

## Commits (eleven, all on `main`)

```
7315ffb  sprint(2.3): close sprint + archive            (the doc closeout that was waiting)
a7fdd83  feat(meta): backport PR features to Vercel app  (avg stats, level chart, classification, tooltips, slider clamp)
b23ad84  fix(icons): self-host PD2 skill icons, ditch wiki redirect
9e00878  feat(donate): add Buy Me a Coffee button in header
1ed838e  fix(donate): self-host BMC button image (ad-blockers strip the CDN)
022a556  fix(donate): hand-rolled BMC button matching generator settings
5e2dfa1  fix(filter): re-aggregate skill list when selection changes
c2e40ab  copy(landing): friendlier instructional + Discord callout
4dedea3  copy(filter): rename "Generate Guide" button to "Generate"
9f640dd  feat: custom favicon + center the dev callout
15e943e  feat: wire up Vercel Web Analytics
```

180/180 vitest still green; tsc clean; next build clean across every commit.

---

## Open follow-ups (not blocking)

1. **Enable Web Analytics in the Vercel dashboard.** The `<Analytics />` component is wired but won't collect until the project toggle is on. User action.
2. **`items.json` will go stale on PD2 patches.** Easy refresh: `curl -o public/items.json https://pd2.tools/items.json`. Worth a CI cron once we have somewhere to host it.
3. **Skill icons will go stale on patches that add new skills.** Same pattern: re-run the parallel-curl from `pd2.tools/icons/` for any new skills, drop into `public/icons/`.
4. **Per-character synergy classification on the backend (long-term).** `data/skill-classification.json` is class-static — same skill is always "core" or "synergy" regardless of build. A more accurate version would classify per-character against `receivesBonusesFrom` and surface `numAsCore` / `numAsSynergy` alongside `numAsBuild` / `numAsPrereq`. Sacrifice in a Zealot vs Sacrifice build is the canonical example. Static is good enough for everything we ship today.
5. **Standalone-vs-PR mirror question still open.** Once Cole merges PR #20 and `pd2.tools/meta` ships, decide whether the standalone stays live as a mirror or gets deprecated. No rush — the PR is awaiting review.

---

## Sprint Close Checklist

- [x] All work shipped to `main` and live on Vercel
- [x] Update `plan/roadmap.md`
- [x] Update `CLAUDE.md` status line
- [x] Sprint file lives in `archive/` (this file)
- [ ] Move resolved tickets — none opened
- [x] Merge branch — n/a (worked on `main` directly this sprint)
