# pd2meta v2: own data pipeline, Builds + Meta

**Date:** 2026-10-28
**Owner:** Steven (tekk0n)
**Repo:** `314159DD/pd2-aggregator` (this repo, live at www.pd2meta.info)
**Status:** draft for owner review

## 1. Why

pd2meta.info reads all its data from `api.pd2.tools`. pd2.tools stopped collecting characters when Season 14 ("Alliance") started on 2026-10-23: `GET api.pd2.tools/api/v1/characters?season=14` returns `total: 0` while the live ladder already has hundreds of level 85 to 90 characters. The pd2.tools site is still up and its code still gets commits (damage calculator, 2026-10-23), but for players the Builds page is empty and so is pd2meta. Season 13 data (55,553 characters) is still served.

pd2.tools itself is only a scraper over the official, unauthenticated Project Diablo 2 API (`api.projectdiablo2.com`). We go to that source directly, run our own pipeline, and give the community back the Builds page plus our Meta view on one site we control.

Success: on pd2meta.info a player can browse the current season the way pd2.tools/builds worked, switch to the Meta tab and get gear, affix and charm guidance for any build, and the data stays fresh (never more than 24 h behind a character's last play) without anyone touching it.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Own collector that discovers and ingests ladder characters (level 80+) from `api.projectdiablo2.com`, Season 14 onward.
2. Own read API that serves the Builds and Meta views.
3. Site with two top-level tabs: **Builds** (left, pd2.tools/builds parity) and **Meta** (right, today's pd2meta features).
4. Character detail and account pages, so Builds rows have somewhere to go.
5. One-time archive import of Seasons 11 to 13 from `api.pd2.tools` while it still serves them.

**Non-goals (v1)**
- Market tools beyond item prices for gear value, budget and shopping list (future, see section 10).
- Damage calculator, economy pages, corrupted zone tracker, leaderboards page (ladder page is a future candidate).
- User accounts, logins, saved builds, writes of any kind to PD2.
- Non-ladder characters, characters under level 80.

**Anti-goals (would make this a failure even if it works)**
- Getting our collector blocked by the PD2 team. We stay under 1 request/second total against `api.projectdiablo2.com` and pause during PD2 peak hours (12:00 to 14:00 America/Los_Angeles), the same terms pd2.tools follows at the request of HalfCrimp (PD2 dev).
- Storing full raw character JSON for every refresh. That is the disk/IO trap that killed a previous project's Supabase. Store compact, overwrite the latest, keep history as small rows.
- A generic shadcn look (white card, grey 1px border, 8px radius). See section 7.
- Shipping multi-MB raw character pools to the browser (today's pd2meta does ~3.4 MB per 250 characters). Aggregation happens server side.

## 3. The upstream API (what exists)

Base `https://api.projectdiablo2.com/`. It is a Feathers.js API (`$limit`, `$skip`, `$sort[field]=1|-1`, field filters as query params; list responses are `{total, limit, skip, data}`). All endpoints below were called on 2026-10-28 without auth.

| Endpoint | Returns | Use |
|---|---|---|
| `GET game/online` | Array of account names online now (~6,900) | Discovery |
| `GET game/account/{account}` | `{account, characters[], details[]}`; `details` has `name, class, class_name, level, ladder, hardcore, created_date, guild` per character | Discovery + cheap pre-filter (skip non-ladder / <80 without fetching the character) |
| `GET game/character/{name}` | Full character (~30 KB): `file, character{name, class, level, status{is_ladder,is_hardcore,is_dead}, attributes, skills[], life, mana, experience...}, mercenary{description, items[]}, items[] (with modifiers[]), account, guild, failed_items` | Ingest |
| `GET game/ladder` | `{softcore, hardcore}` each with `overall` (1000) and per class (200): `name, rank, class, level, experience, progress, dead`; plus `updated_at` | Discovery of top characters by name; change detection via `experience` |
| `GET game/season` | `{name: "Alliance", start: "2026-10-23 10:00", level_99{Hardcore, Softcore}}` | Season name and start; detect season rollover |
| `GET system/meta` | `{online{count}, in_game{count}}` | Online player count (cheap; replaces counting `game/online`) |
| `GET game/realm-status` | `{status, checked_at}` | Optional status badge |
| `GET market/listing` | 168k open listings: `item` (full item JSON), `price` (free text, e.g. `"3 wss"`, `"0.75 ( runes keys pes pde)"`), `is_ladder, is_hardcore, type, created_at, bumped_at, user_last_online` | Prices (already used by pd2meta's snapshot script) |
| `GET game/build` | 41,546 user-saved Armory builds (character + items + merc snapshot, `created_at`), back to 2023 | Future idea, not v1 |
| `GET social/article` | News / patch notes (8) | Future idea |
| `game/guild/{tag}` (get only) | Guild by tag with `softcore`, `ladder` query | Future idea |

Auth-only (401), not usable: `market/listingArchive` (sold history), `market/offer`, `market/filter`, `game/stash`.

## 3b. Landscape: pd2trader.com

pd2trader.com (desktop overlay open source at `errolgr/pd2-trade`, MIT; the web backend is closed) already runs a Builds page with S14 data (12,291 softcore characters on 2026-10-28) and a documented public API (`https://pd2trader.com/api/openapi.json`): `/api/builds/usage`, `/api/builds/characters`, `/api/builds/shopping-list` (most worn items with prices), `/api/builds/meta/history` (hourly class and item shares), plus prices, price history, market search and an SSE live stream. Its market data comes from polling the public `market/listing` endpoint about every 15 s (sold = listing disappeared) and from overlay users who sign in with their own PD2 token. Anonymous API access is deprecated; keys give 300 req/min and must not ship in frontend code.

Consequences for this build:
- We keep our own pipeline (owner decision); pd2trader is not a dependency for characters.
- pd2meta already reads pd2trader prices from the browser without a key. That will break when anonymous access ends: move price calls behind our API with a registered key (phase 3).
- Our differentiator is the Meta view (affix medians, charms, build sheet, diff). Builds parity is table stakes, not the selling point; do not spend extra polish there before Meta is done.

## 4. What we are replicating

### 4.1 Builds tab (pd2trader.com/builds feature set, which is a superset of pd2.tools/builds)

Owner decision 2026-10-28: the Builds tab matches what pd2trader.com/builds offers (screenshots taken headless 2026-10-28, see Appendix A). We rebuild the features in our own code and our own look; pd2trader's web code is closed source and its branding and art are not ours to copy. The pd2.tools implementation (MIT, `coleestrin/pd2-tools`, read `upstream/main` in `../pd2-tools-fork`: `web/src/pages/Builds.tsx`, `web/src/components/builds/*`, `api/src/routes/characters.ts`, `api/src/database/postgres/index.ts` `buildFilterCTE` ~L784 and `analyze*Usage` ~L1065 to 1253) is the reference for filter semantics and SQL.

Must have:
- **Header line:** season name, mode, character count, one-sentence explainer.
- **Toolbar:** season select (current + archive seasons), Softcore/Hardcore segmented, level presets 80+ / 85+ / 90+ / 95+ / 99.
- **Class share:** a segmented bar across the full width plus one tile per class (icon, %, count), click to filter; "All classes N".
- **Gear budget:** slider from 0 to "Any" that filters characters by total gear value in HR (needs prices, see 4.4).
- **Side cards** (each: search box, count of distinct entries, top 8 with "Show all N", % bar behind the row, click toggles a filter, % is of the filtered pool):
  - Skills (% with 20+ hard points).
  - Items (uniques, sets, runewords; quality colour on the name). pd2.tools excluded Torch, Anni, CTA, Lidless; pd2trader does not. We do not exclude. *(my call)*
  - Mercenary (type; pd2trader groups Act 2 as "Defensive Auras" / "Offensive Auras" plus Fire Arrow, Cold Arrow, Might Merc, Unknown; builder picks a grouping that maps every raw description).
  - Merc items.
- **Shopping list:** the 10 items most worn by the filtered pool, with % worn, live median price in HR, market link, and the sum ("Σ 1.63 HR").
- **Character table:** character name + class, level, life, top 3 skills (icons), key gear (item icons), gear value in HR. Server-side sort on level, life, gear value; 25 per page with Prev / Next and "Page X of Y".
- **Row expand (inline preview):** skills with hard and total levels as bars, worn gear with per-item prices, stats (life, mana, str, dex, vit, ene), merc type and merc gear icons, "Full character" link.
- **Filter semantics:** classes OR, items AND, skills AND (each `{name, minLevel}`, default 20), merc types OR, merc items AND, plus season, mode, min level, gear budget.
- **URL state:** every filter in the query string, shareable.
- **Character page:** header (name, class, level, mode, season, account link, link to projectdiablo2.com, last updated, refresh button), equipment grid with player/merc toggle and item tooltips, skills (hard / with +skills), stats (defensive, attributes, resists, absorb, speed, procs, leech; pd2.tools `utils/character-stats.ts`), gear value, level history chart from our own history rows. No damage calculator.
- **Account page:** all tracked characters of an account for the season.
- **"Add account"** request: queues an account for priority ingest (rate-limited per IP).
- **Build share history** (pd2trader has `/api/builds/meta/history`, hourly class and top item shares): we store a daily aggregate per season and mode, and show class share over time on the Builds tab. *(my call: daily, not hourly)*

### 4.2 Meta tab (today's pd2meta)

Everything in the current app keeps working, on the new API. Inventory, with logic in `src/lib/aggregate/*`, `src/lib/shape/*`, `src/lib/diff.ts`:
- Cohort filter: mode, class, min level, skills with per-skill min, 50 build presets (`data/builds.json`).
- Average build stats (core attributes, top mod totals).
- Top equipped items per slot (top 8, slot via `data/item-slots.json`), with tooltip, market link, price, runeword rune cost.
- Affix frequency per slot for magic/rare/crafted: count, %, median, p75 (top 15 per slot).
- Charm patterns: avg charm count, Anni / Torch / Gheed rates, top GC and SC/LC mods.
- Build sheet: skill usage split core vs synergy (prereq detection, hard % and any %), level distribution, merc type and merc gear.
- Diff vs pool: enter character or account, compare against the cohort per slot.

Changes from today:
- No 1,500-character cap; the server aggregates the whole cohort.
- No client worker / raw pool download; Meta calls aggregate endpoints.
- Results update as filters change (debounced); no "Generate" button needed. *(my call)*

### 4.4 Prices (needed in v1 now)

Gear value, gear budget and the shopping list need item prices, so a price source moves into v1. Our own: the collector polls `market/listing` (ladder, both modes) inside the same 1 req/s budget, and an hourly job computes per-item median ask price in HR over the last 7 days (reuse `scripts/build-price-snapshot.ts` parsing in `src/lib/price/parse.ts`; free-text prices that do not parse are dropped). Unpriced items show "n/a". Rune prices feed runeword cost. pd2trader's API (with a registered key, server side only) is a later option, not a dependency. *(my call)*

### 4.3 Shared shell

- Header with the two tabs, **Builds** left, **Meta** right, plus season and mode switch shared by both tabs.
- The filter state carries over: an "Open in Meta" action from Builds takes the current class + skills into Meta, and Meta has "See characters" back to Builds. *(my call)*
- Data freshness indicator (last collector pass, characters tracked this season).

## 5. Architecture

```
api.projectdiablo2.com
        |  (<= 1 req/s, peak-hour pause)
   [collector]  ---> [Postgres]  <--- [read API]  <--- pd2meta.info (Next.js on Vercel)
   VPS, Docker        VPS, Docker      VPS, Docker, HTTPS via api.pd2meta.info
```

**Hosting (my call, flag if wrong):** the existing VPS (76.13.140.109), three containers (collector, read API, Postgres) in one compose project, HTTPS via the host's existing nginx (it already terminates 80/443 for the other projects) on `api.pd2meta.info`. Checked 2026-10-28: 18 GB disk free, 3.4 GB RAM available; pd2meta.info itself is on Vercel, not on the VPS. The collector has to run nonstop, so it cannot live on Vercel. The site stays on Vercel. No new spend.

**Language:** TypeScript/Node for collector and API, so pd2-tools code (MIT) ports directly: `jobs/character-scraper.ts`, `utils/parser.ts`, `utils/skill-calculator.ts`, `utils/character-stats.ts`, the profanity filter. Keep the MIT notice and credit pd2-tools / Cole Estrin in the repo and the site footer.

**Repo layout (my call):** monorepo in this repo: `apps/web` (current Next app), `apps/api`, `apps/collector`, `packages/core` (types, parser, skill calculator, aggregation shared by API and tests). Builder may choose a different split if it keeps one repo.

### 5.1 Collector

- **Rate limiter:** one global queue for every call to `api.projectdiablo2.com`, minimum 1,000 ms between requests, pause 12:00 to 14:00 America/Los_Angeles, exponential backoff on 429/5xx, `User-Agent: pd2meta.info/2.0 (+https://www.pd2meta.info)`.
- **Discovery, in priority order:**
  1. Priority queue (accounts requested via "Add account").
  2. `game/ladder` every hour: any listed character whose `experience` changed since our last ingest and whose last ingest is older than 6 h gets queued.
  3. `game/online` every 30 min: accounts not checked in the last 24 h get `game/account/{name}`; from `details`, queue only characters that are ladder, level >= 80, and not ingested in the last 24 h.
- **Ingest:** `game/character/{name}`; skip if not ladder or < 80; compute real skills (pd2-tools skill calculator); write compact rows (5.2) in one transaction; append a history row.
- **Budget check:** at 1 req/s we get 86,400 calls/day. Account sweep ~7k, ladder ~2 calls/h, character refreshes the rest. That covers ~70k character refreshes per day; expected tracked pool is 20k to 60k. If the pool outgrows the budget, refresh by priority (ladder top first, then by staleness).
- **Freshness rule (my call):** a character's data is never more than 24 h behind its last play. Characters that are not played are not re-fetched; online sweeps and ladder experience changes are the only triggers. The freshness indicator and the phase 1 exit check measure this.
- **Rate is config, with a kill switch (my call):** requests/second and the peak-hour window come from env, default 1 req/s, and the collector can be paused without a redeploy.
- **Season rollover:** read `game/season` daily; a new season name or start date starts a new season number (config, not hardcoded).
- **Observability:** `/health` and `/stats` on the API exposing requests/min, queue sizes, characters ingested last hour, last successful pass, error rate.

### 5.2 Data model (compact)

Builder owns exact DDL. Required shape:

- `characters`: one row per (season, mode, name): class, level, experience, life, mana, attributes, account, guild, is_dead, last_ingested_at, and `raw` = latest full character JSON stored **compressed** (needed for the character page equipment grid). Overwritten on each ingest.
- `character_skills`: hard level and real level per skill.
- `character_items`: one row per equipped item and charm: slot, zone, name, quality, base name/type, is_runeword, `mods` as compact JSONB (`[{name, label, value}]`). This is what Meta aggregates over.
- `merc` + `merc_items` (same shape).
- `character_history`: (character, ts, level, experience) only. No raw JSON history.
- `accounts_seen`, `priority_accounts`.
- Season and mode as columns everywhere; indexes on (season, mode, class, level).

Disk target: under 2 GB for one active season of ~50k characters, archive seasons excluded.

### 5.3 Read API

Two layers:
1. **pd2.tools-compatible endpoints** so the Builds UI ports with minimal change: `GET /characters` (filtered, paginated, with class `breakdown`), `/characters/stats/item-usage`, `/skill-usage`, `/merc-type-usage`, `/merc-item-usage`, `/level-distribution`, `/characters/:name`, `/characters/:name/history`, `/characters/accounts/:account`, `POST /accounts/queue`. Same query params (`season, gameMode, minLevel, maxLevel, classes, items, skills, mercTypes, mercItems, page, pageSize`) and response shapes as pd2.tools.
2. **Meta endpoints** returning finished aggregates for a cohort: average stats, top items per slot, affix frequency (median, p75), charms, skill usage with core/synergy and prereq detection, merc summary, and diff for a named character. Response for one cohort under ~200 KB.

Caching: identical query hits are cached (in-process LRU or Redis, builder's call) for 15 min; p95 under 1 s cold for any cohort on a 50k-character season. CORS limited to the site's origins.

## 6. Archive import (Seasons 11 to 13)

`api.pd2.tools/api/v1/characters?season=N` still serves S13 (55,553), S12 (66,212), S11 (56,972) with full character JSON, paginated. One-time script pages through them at a polite rate (1 req/s), writes the same compact rows (raw compressed, no history), and marks them archive. That gives the season selector real history and protects it if pd2.tools goes away. Run after the S14 pipeline is live. If disk gets tight, archive seasons may drop `raw` and keep only items/skills.

## 7. Look and feel

This workspace has a binding look-and-feel rule: the LEXADIS package in `C:\Coding\III____Full_Circle\design\lexadis-look-and-feel\` (read `LIES-MICH.md`, then `1-regeln/DESIGN.md`; tokens from its CSS; Geist + Geist Mono; glass levels; capsule buttons; one accent; spring motion from `5-produkt-v2/src/components/motion/`; reduced-motion). Take the look, not the brand (no LEXADIS name, no law-firm patterns).

Application here (my call, flag if wrong):
- **Dark mode is the default** (the package has a full dark token set); light via toggle.
- D2 item quality colours (unique gold-brown, set green, runeword/rare yellow, magic blue, crafted orange) are **data colours** in tables and tooltips, not UI accents. The UI keeps one accent from the package.
- Current pd2meta's D2 gold theme and Cinzel font are retired.
- Class icons, skill icons and item art are kept (from pd2.tools assets / projectdiablo2.com image paths).

## 8. Phases

1. **Pipeline:** collector + Postgres + read API (pd2.tools-compatible endpoints) on the VPS, S14 data flowing, `/health` green. Exit: S14 characters > 5,000 and growing; Builds endpoints return the same shapes as pd2.tools.
1b. **Stopgap (owner decision):** point today's pd2meta at our `/characters` endpoint (one base URL change plus the stats endpoints) and redeploy, so pd2meta.info shows S14 within days. This temporarily keeps the raw pool download (accepted exception to the anti-goal until phase 3 replaces it).
2. **Builds tab:** shell with tabs, price job (4.4), Builds page, character page, account page, on the new API. Exit: checklist in 4.1 ticked.
3. **Meta tab:** move pd2meta onto the Meta endpoints, server-side aggregation, drop the raw pool. Exit: the 7 validation fixtures still pass (re-captured against our API), every 4.2 feature works.
4. **Look + launch:** LEXADIS look across both tabs, footer credits, deploy, point pd2meta.info at it.
5. **Archive import** S11 to S13.

## 9. Validation

- **Parity test:** after the archive import, our aggregate endpoints for S13 must match `api.pd2.tools` stats endpoints for the same filters (class breakdown exact; item/skill/merc usage % within 1 point, since pd2.tools' pool and ours were collected differently only in S14). Use 7+ representative filter sets.
- Unit tests for parser, skill calculator, filter semantics, aggregations (port pd2-tools' and pd2meta's existing tests).
- Collector: rate limiter test proves no two upstream calls closer than 1,000 ms, and peak-hour pause.

## 10. Future ideas (not v1, from the API survey)

- **Ladder page:** `game/ladder` top 1000 + per class, level 99 race from `game/season.level_99`, with links into character pages.
- **Online players chart:** `system/meta` every 15 min.
- **Trending builds:** our own history table gives build share over the season (what's rising, what's falling).
- **Market:** `market/listing` (168k open listings, free-text prices that need parsing), price history from our own daily snapshots, since the sold archive is auth-only.
- **Armory mining:** `game/build` has 41k user-saved builds back to 2023.
- **Patch notes feed** from `social/article`.
- Discord bot / share cards for a build.

## 11. Decided by the owner (from conversation)

- Rebuild on our own data, sourced from `api.projectdiablo2.com`; do not depend on pd2.tools.
- The site is Builds + Meta; market later.
- Two tabs at the top: Builds (classic pd2.tools way) left, Meta (our tool) right.
- Spec goes to subagents for the build.
- Builds tab copies the pd2trader.com/builds feature set (4.1), with our own code and look.
- Ship the stopgap (phase 1b) so pd2meta shows S14 quickly; the clean Meta rebuild follows Builds.
- PD2 team asked on their Discord (2026-10-28): our collector is fine as long as usage stays respectful. That means the 1 req/s ceiling and peak-hour pause in 5.1 stay on.

## 12. Left to the builder

Exact DDL and indexes, queue implementation, cache technology, compose layout, component structure, chart library, test framework details, how to compress `raw`, pagination of the archive import, and whether Next.js stays static export (character pages by query param) or uses dynamic routes on Vercel.

## Appendix A. Reference screenshots

Headless captures of pd2trader.com/builds (2026-10-28), full page and with one character row expanded, are in the session scratchpad; recapture with Playwright if needed (`https://pd2trader.com/builds`, click a character name). Their data endpoints, for reference only: `/api/builds/usage`, `/api/builds/characters?page&pageSize&sort&dir`, `/api/builds/shopping-list`, `/api/builds/characters/{name}`, `/api/builds/meta/history`.
