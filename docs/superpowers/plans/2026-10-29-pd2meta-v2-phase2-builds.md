# pd2meta v2, Phase 2: shell, prices, Builds tab, character and account pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pd2meta.info gets a two-tab shell (Builds left, Meta right), an hourly price job that gives every character a gear value in HR, a Builds tab with the pd2trader.com/builds feature set, and character and account pages, all on our own API at `https://api.pd2meta.info/api/v1`.

**Architecture:** The server (`server/`, phase 1) gains one migration, an hourly price job and a daily build-share job inside the collector process (DB only, no upstream calls), and new read endpoints under `/api/v1/builds/*`, `/api/v1/prices`, `/api/v1/characters/:name` and `/api/v1/characters/:name/history`. Old pd2.tools-compatible routes keep their shapes. The web app (repo root, Next 16 static export) gets a scoped LEXADIS layer (`.lx`, dark default) for the header shell and the new routes `/builds`, `/builds/character?name=`, `/builds/account?name=`; the Meta page at `/` keeps its current look and logic.

**Tech Stack:** Server: Node 22, TypeScript 5, Express 4, `pg` 8, vitest 4 + supertest on `embedded-postgres`. Web: Next.js 16 (`output: 'export'`), React 19, Tailwind 4, vitest 4 + jsdom + `@testing-library/react`, new dependency `@2toad/profanity@3`. No chart library, no `motion` package.

**Spec:** `docs/superpowers/specs/2026-10-28-pd2meta-v2-design.md` (4.1, 4.3, 4.4, 5.2, 5.3, 7, 8 phase 2). Format and phase-1 decisions: `docs/superpowers/plans/2026-10-29-pd2meta-v2-phase1-pipeline.md`.

## Global Constraints

- All phase-1 constraints stay: one global `RateLimiter` for `api.projectdiablo2.com`, `PD2_MIN_INTERVAL_MS=1000`, peak pause 12:00 to 14:00 `America/Los_Angeles`, kill switch, UA `pd2meta.info/2.0 (+https://www.pd2meta.info)`. This plan adds no upstream calls; price and build-share jobs read only our DB and run even while the collector is paused.
- Existing endpoints (`/characters`, `/characters/stats/*`, `/characters/accounts/:account`, `/accounts/queue`, `/health`, `/stats`) keep their exact response shapes. New behaviour lives in new endpoints; the one new shared filter param (`maxGearHr`) changes nothing when absent.
- Every cached route's cache key includes every query param that changes its result (`KEY_PARAMS` in `server/src/api/app.ts`).
- Sort columns and directions are whitelisted, never interpolated from the query.
- API returns raw character names. The web masks profane names at display time only.
- Prices: ladder listings only, per mode (`is_hardcore`), 7-day window, corrupted listings excluded, minimum 3 samples to show a price, else `n/a`.
- Look (binding, workspace CLAUDE.md + spec 7): LEXADIS package `C:\Coding\III____Full_Circle\design\lexadis-look-and-feel\`. Tokens copied from `5-produkt-v2/src/app/globals.css` (values never invented), Geist + Geist Mono (already loaded in `src/app/layout.tsx`), glass levels `mat-thin` / `karte` (regular) / `mat-thick` / `mat-float` / `mat-chrome`, capsule buttons (999px), one accent (Siegel `--brand #2b3a8c` / `--glow #8fa2ff`), CSS spring motion (`--feder-*`, `--dauer-*`), `prefers-reduced-motion` and `prefers-reduced-transparency`. Dark is the default, light via toggle. No LEXADIS name, wordmark or law-firm patterns. A white card with grey 1px border and 8px radius is a defect.
- D2 quality colours are data colours only (names, icon rims, tooltips): unique `--rarity-unique #a08f5d`, set `--rarity-set #00b800`, runeword and rare `--rarity-rare #ffff64`, magic `--rarity-magic #6b6bff`, crafted `--rarity-crafted #ff8000` (existing values in `src/app/globals.css`). In light mode they render as `color-mix(in oklab, <colour> 62%, var(--ink))`.
- The Meta page body (`src/app/page.tsx` and its components) is not restyled in this plan (phase 4). Only additive changes: `/meta` alias and one "See characters" link.
- Static export: every page that reads `useSearchParams` renders inside `<Suspense>`.
- Numbers use `Intl.NumberFormat('en-US')`; counts, levels, HR values and percentages render in Geist Mono with `font-variant-numeric: tabular-nums`.
- No em dashes in any user-facing text, docs or commit messages written by this plan. Placeholder for a missing value is `n/a` (price) or `-` (other).
- Vendored pd2-tools files keep line 1 `// Vendored from coleestrin/pd2-tools (MIT), upstream/main.`; copied pd2-tools images ship with `public/LICENSE-pd2-tools.txt` (copy of `server/src/core/vendor/LICENSE-pd2-tools.txt`).
- Never use context7. Do not `sed -i` files (CRLF churn); stage explicit paths, check `git diff --stat` before each commit.
- Branch `sprint/4.2-builds` off `main`. Commit per task. Nothing is pushed or merged until Task 14 (controller).
- Test commands: server `cd server && npx vitest run <files>`; web `npx vitest run <files>` at the repo root. Each task ends with its own files green plus `npx tsc --noEmit` in the package it touched.

## Review Focus

1. Cache key misses a new param: `/builds/characters?sort=life` served from the cache entry of `?sort=level`, or `?maxGearHr=1` served the unfiltered result. Expected: different params, different bodies. Test in Task 4.
2. Character lookup by a name with different case, spaces or URL-encoded characters (`/characters/mc-meeks`, `/builds/characters/Some%20Name`): found case-insensitively; unknown name returns 404 `{"error":{"message":"Character not found"}}`, never 500. Tests in Tasks 4 and 5.
3. Filters that match nobody (`classes=Druid&items=NoSuchItem`): usage returns `total: 0`, empty lists, every `pct` is `0` (no `NaN`); the table shows an empty state and `Page 1 of 1`; the shopping list shows `Σ 0.00 HR`. Tests in Tasks 3, 4, 10, 11.
4. Stale or hostile URL params (`minLevel=83`, `page=abc`, `maxGearHr=-1`, `sort=name;drop`, `dir=up`, `classes=Wizard`): server whitelists and clamps, web normalises to defaults, nothing throws. Tests in Tasks 4 and 8.
5. Items with no price (no listings, fewer than 3 samples, or only corrupted listings): `medianHr: null`, shown as `n/a`, excluded from sums, and the character's gear value is flagged partial (shown with a trailing `+`). Tests in Tasks 2 and 10.

---

## File structure

```
server/src/
  db/migrations/003_builds.sql         item_prices, build_share_daily, gear value columns, inv_code, indexes
  core/item-art.ts                     invCode(item) for item images
  core/compact.ts                      (modify) CompactItem.invCode
  core/merc-types.ts                   raw merc description -> {name, act}; 'Other' bucket
  core/vendor/character-stats.ts       vendored, unchanged except imports
  core/vendor/item-stat-expansion.ts   vendored, data path -> __dirname
  core/vendor/types/stats.ts           vendored CharStats
  core/vendor/game-data/pd2/season-14/{Properties,ItemStatCost}.txt
  db/characters-repo.ts                (modify) replaceItems, inv_code, gear value on ingest
  db/prices-repo.ts                    computeItemPrices, recomputeGearValues, price reads
  db/build-share-repo.ts               snapshotBuildShare, buildShareHistory
  collector/jobs.ts                    runPriceJob, runBuildShareJob
  collector/main.ts                    (modify) wire hourly + daily jobs
  scripts/backfill-items.ts            one-off: rewrite items from raw (inv_code), recompute gear
  api/filters.ts, api/filter-sql.ts    (modify) maxGearHr, mercTypes 'Other'
  api/builds-queries.ts                usage, seasons, history, prices
  api/builds-characters.ts             table page + row preview
  api/character-detail.ts              detail + history
  api/app.ts                           (modify) routes, KEY_PARAMS
server/scripts/copy-migrations.js      (modify) also copy vendor/game-data to dist
server/test/{migrate,items-art,prices,builds-api,builds-characters,character-detail,build-share}.test.ts

src/
  app/lx.css                           LEXADIS tokens + utilities, scoped to .lx
  app/globals.css                      (modify) @import "./lx.css"
  app/layout.tsx                       (modify) theme boot script, <SiteHeader/>
  app/meta/page.tsx                    re-export of app/page.tsx
  app/page.tsx                         (modify) "See characters" link only
  app/builds/page.tsx                  Builds tab (Suspense + BuildsView)
  app/builds/character/page.tsx        character page
  app/builds/account/page.tsx          account page
  components/lx/                       Button, Segment, Card, SearchField, Chip, Bar, Sparkline, Tooltip
  components/shell/                    SiteHeader, TabNav, ScopeSwitch, ThemeToggle, Freshness
  components/builds/                   BuildsHeader, Toolbar, ClassShare, GearBudget, UsageCard,
                                       ShoppingList, ActiveFilters, CharacterTable, RowPreview, ItemIcon
  components/character/                CharacterHeader, EquipmentGrid, ItemTip, SkillsPanel, StatsPanel, LevelChart
  lib/builds/                          types.ts, api.ts, url-state.ts, format.ts, display-name.ts,
                                       item-art.ts, quality.ts, budget.ts, scope.ts
public/classes/*.webp, public/equipment_icons/*, public/LICENSE-pd2-tools.txt
vitest.setup.ts                        jest-dom matchers
```

---

### Task 1: Migration 003, item art codes, items backfill

**Files:**
- Create: `server/src/db/migrations/003_builds.sql`, `server/src/core/item-art.ts`, `server/src/scripts/backfill-items.ts`
- Modify: `server/src/core/compact.ts`, `server/src/db/characters-repo.ts`
- Test: `server/test/items-art.test.ts`, extend `server/test/migrate.test.ts`, `server/test/characters-repo.test.ts`

**Interfaces:**
- Consumes: `toCompact`, `upsertCharacter`, `readRaw` (phase 1).
- Produces:
  - `invCode(item: IItem): string | null` = `item.base?.codes?.normal || (item.base?.id ? item.base.id + (Number(item.graphic_id) >= 1 ? item.graphic_id : 1) : null)` (ported from pd2-tools `Equipment.tsx`; `graphic_id` may be `false`). Image URL is built on the web (Task 8).
  - `CompactItem` gains `invCode: string | null`.
  - `replaceItems(client: PoolClient, characterId: number, items: CompactItem[]): Promise<void>` (delete + one `unnest` insert, now with `inv_code`); `upsertCharacter` uses it.
  - `server/src/scripts/backfill-items.ts`: `backfillItems(pool, season: number, batchSize = 200): Promise<number>` walks characters of the season by id, `toCompact(readRaw(row))`, `replaceItems` in a transaction per batch, does not touch `last_ingested_at` or history. `main()` reads `DATABASE_URL` / `CURRENT_SEASON` and logs the count.

`003_builds.sql`:

```sql
alter table character_items add column inv_code text;
alter table characters add column gear_value_hr numeric(10,2), add column gear_value_partial boolean not null default false,
  add column merc_gear_value_hr numeric(10,2);
create index on characters (season, mode, gear_value_hr);
create index on characters (season, mode, life);
create table item_prices (
  mode text not null check (mode in ('softcore','hardcore')),
  item_type text not null check (item_type in ('Unique','Set','Runeword')),
  item_name text not null,
  median_hr numeric(10,2) not null, samples int not null, source text not null check (source in ('sold','ask')),
  computed_at timestamptz not null,
  primary key (mode, item_type, item_name)
);
create table build_share_daily (
  season int not null, mode text not null, day date not null, class text not null, characters int not null,
  primary key (season, mode, day, class)
);
```

- [ ] **Step 1: Write failing tests.** `items-art.test.ts`: on `character-ladder.json`, `invCode` of "Nightwing's Veil" (base `codes.normal = 'ghm'`) is `'ghm'`; an item with `codes.normal = ''`, `base.id = 'amu'`, `graphic_id: 0` gives `'amu1'`; `graphic_id: 3` gives `'amu3'`; no `base` gives `null`; every equipped item from `toCompact(fx).items` has `invCode` not undefined. `migrate.test.ts`: tables `item_prices`, `build_share_daily` exist; `characters.gear_value_hr` column exists. `characters-repo.test.ts`: after `upsertCharacter`, `select count(*) from character_items where inv_code is not null` > 0; `backfillItems` after `update character_items set inv_code = null` restores the same non-null count and leaves `last_ingested_at` and the history row count unchanged.
- [ ] **Step 2:** Run `npx vitest run test/items-art.test.ts test/migrate.test.ts test/characters-repo.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement migration, `item-art.ts`, `compact.ts` field, `replaceItems`, backfill script.
- [ ] **Step 4:** Run the same command, then `npm test` and `npx tsc --noEmit`. Expected: PASS, no errors.
- [ ] **Step 5: Commit** `feat(server): migration 003, item art codes, items backfill`.

---

### Task 2: Price job and gear value

**Files:**
- Create: `server/src/db/prices-repo.ts`, `server/src/collector/jobs.ts`
- Modify: `server/src/db/characters-repo.ts` (gear value on ingest), `server/src/collector/main.ts`
- Test: `server/test/prices.test.ts`

**Interfaces:**
- Consumes: `market_listings` (phase 1, `miss_count` from 002), `upsertListings`, `upsertCharacter`, migration 003.
- Produces:
  - `type PriceRow = { itemType: 'Unique'|'Set'|'Runeword'; name: string; medianHr: number; samples: number; source: 'sold'|'ask' }`
  - `computeItemPrices(pool: Pool, now = new Date()): Promise<{ priced: number }>` One transaction: delete all `item_prices`, insert the new set. Per `(mode, item_type, item_name)` over `market_listings` with `is_ladder`, `not is_corrupted`, `price_hr is not null`, `item_name is not null`, and `item_type = case when runeword_key is not null then 'Runeword' else quality end in ('Unique','Set','Runeword')`:
    - sold set = `gone_at is not null and miss_count >= 2 and gone_at >= now - 7 days`
    - open set = `gone_at is null and last_seen_at >= now - 7 days`
    - if sold count >= 5: median of sold, `source 'sold'`; else if open count >= 3: median of open, `source 'ask'`; else no row. Median = `percentile_cont(0.5)`, rounded to 2 decimals. Constants exported: `PRICE_WINDOW_DAYS = 7`, `MIN_SOLD_SAMPLES = 5`, `MIN_SAMPLES = 3`.
  - `recomputeGearValues(db: Pool | PoolClient, scope: { season: number } | { characterIds: number[] }): Promise<number>` Sets for each character in scope: `gear_value_hr` = sum of `median_hr` over player items that are priceable (`is_runeword or quality in ('Unique','Set')`) and worn (`slot is not null or is_charm`), switch items included; `gear_value_partial` = any such item has no price row; `merc_gear_value_hr` = same sum over merc items (null when no merc items). Characters without priceable items get `0` and `false`. Price row joined on `(characters.mode, case when is_runeword then 'Runeword' else quality end, name)`.
  - `upsertCharacter` calls `recomputeGearValues(client, { characterIds: [id] })` inside its transaction after `replaceItems`.
  - `getPrices(pool, mode: 'softcore'|'hardcore'): Promise<{ computedAt: string | null; items: PriceRow[] }>`
  - `runPriceJob(deps: { pool: Pool; cfg: Pick<Config,'currentSeason'> }, now = new Date()): Promise<{ priced: number; characters: number }>` = `computeItemPrices` then `recomputeGearValues(pool, { season: cfg.currentSeason })`.
  - `collector/main.ts`: task `{ name: 'prices', everyMs: HOUR }` calling `runPriceJob`, not gated by `active()`; result logged at info; stats untouched (shape of `CollectorStats` unchanged).

- [ ] **Step 1: Write failing tests** (`prices.test.ts`, rows inserted with `upsertListings` then adjusted by SQL for `gone_at`/`miss_count`/`last_seen_at`): Unique "Harlequin Crest" softcore with 3 open listings `0.2, 0.3, 0.4` -> `medianHr 0.3, source 'ask', samples 3`; same item with 6 sold rows (`gone_at` 1 day ago, `miss_count 2`) `1..6` -> `medianHr 3.5, source 'sold'`; 5 sold + 2 open -> `'sold'`; 4 sold + 2 open -> no row (neither threshold); 2 open -> no row; an open listing with `last_seen_at` 8 days ago is ignored; a corrupted listing is ignored; a non-ladder listing is ignored; hardcore and softcore priced separately; a runeword listing (`runeword_key` set) is priced as `itemType 'Runeword'`; a second run with fewer listings removes stale rows. Gear: upsert the ladder fixture, insert prices for 2 of its priceable items, run `recomputeGearValues({season:14})` -> `gear_value_hr` equals their sum, `gear_value_partial` true when the fixture has a third priceable item; prices for all priceable items -> partial false; a newly upserted character (ingest path) has `gear_value_hr` set without running the job.
- [ ] **Step 2:** Run `npx vitest run test/prices.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `prices-repo.ts`, `jobs.ts` (`runPriceJob`), ingest hook, main wiring.
- [ ] **Step 4:** Run the test, then `npm test` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): hourly price job and per-character gear value`.

---

### Task 3: Filter extensions, merc types, usage, seasons and prices endpoints

**Files:**
- Create: `server/src/core/merc-types.ts`, `server/src/api/builds-queries.ts`
- Modify: `server/src/api/filters.ts`, `server/src/api/filter-sql.ts`, `server/src/api/app.ts`, `server/src/config.ts`
- Test: `server/test/builds-api.test.ts`

**Interfaces:**
- Consumes: `filterCte`, `parseFilter`, `CLASSES` (phase 1), `getPrices`, `item_prices` (Task 2).
- Produces:
  - `CharacterFilter` gains `maxGearHr: number | null`; `parseFilter` reads `maxGearHr` (finite number >= 0, else `null`). `filterCte` adds `coalesce(c.gear_value_hr, 0) <= $n` when not null.
  - `MERC_TYPES: Record<string, { act: 1|2|3|4|5 }>` = `Fire Arrow 1, Cold Arrow 1, Physical Arrow 1, Defensive Auras 2, Offensive Auras 2, Combat 2, Fire Spells 3, Cold Spells 3, Lightning Spells 3, Dark 4, Light 4, Might Merc 5, Warcries 5` (raw PD2 descriptions, act per pd2-tools `MercTypeCard`). `mercTypeOf(raw: string): { name: string; act: number | null }` returns the raw name for known values, `{ name: 'Other', act: null }` otherwise and `console.warn`s `unknown merc type "<raw>"` once per raw value per process. Display name = raw description (pd2trader style), act shown beside it on the web.
  - `filterCte`: `mercTypes` containing `'Other'` matches `m.description <> all(<known list>)` OR-ed with the other listed types.
  - `config.ts`: `SEASON_NAMES: Record<number, string> = { 12: 'Suffering', 13: 'Betrayal', 14: 'Alliance' }`.
  - `type UsageEntry = { name: string; count: number; pct: number }`
  - `type ItemUsageEntry = UsageEntry & { itemType: 'Unique'|'Set'|'Runeword'; invCode: string | null; medianHr: number | null }` (`invCode` = `min(inv_code)` for that name; `medianHr` from `item_prices` for the filter's mode)
  - `type MercUsageEntry = UsageEntry & { act: number | null }`
  - `type BuildsUsage = { seasonTotal: number; total: number; breakdown: Record<string, number>; skills: UsageEntry[]; items: ItemUsageEntry[]; mercTypes: MercUsageEntry[]; mercItems: ItemUsageEntry[] }`
    - `seasonTotal` = characters of season + mode with level >= 80, no other filter.
    - `breakdown` = class counts (7 classes zero-filled + `total`) for the filter **with `classes` removed**, so the class tiles stay clickable.
    - `total` = size of the full filtered pool; every `pct` = `round(count / total * 100, 2)`, `0` when `total` is 0.
    - `skills`: distinct characters with `hard_level >= 20`; `items` / `mercItems`: same rules as phase-1 item usage (player / merc, Unique/Set/Runeword, no exclusions); `mercTypes`: grouped through `mercTypeOf`. All lists complete (no top-N cut; the web does top 8), sorted by count desc, name asc.
  - `buildsUsage(pool, f: CharacterFilter): Promise<BuildsUsage>`
  - `seasons(pool, cfg): Promise<{ current: number; seasons: Array<{ season: number; name: string; current: boolean; characters: { softcore: number; hardcore: number } }> }>` Seasons present in `characters` plus the current one, desc. Name: for the current season `collector_status.stats.seasonName` if set, else `SEASON_NAMES[n]`, else `Season <n>`.
  - Routes (all through `cached`): `GET /builds/usage`, `GET /builds/seasons`, `GET /prices?gameMode=` -> `getPrices` result.

- [ ] **Step 1: Write failing tests** (seed like phase-1 `api.test.ts`: fixture + 3 variants, then insert `item_prices` rows and run `recomputeGearValues`): `/builds/usage` has `seasonTotal 3` (softcore), `breakdown` with 7 class keys + `total`; `?classes=Sorceress` keeps `breakdown.total` at 3 while `total` is 1; every skills entry has `count <= total`; an item worn by all 3 has `pct 100` and its `medianHr` equals the seeded price; an unpriced item has `medianHr null`; `?items=NoSuchItem` gives `total 0`, all lists empty; `?maxGearHr=0` keeps only characters with gear value 0; `?maxGearHr=-1` equals no budget; merc variant `Cold Arrow` appears with `act 1`; a character with merc description `Mystery` makes an `Other` entry with `act null`, and `?mercTypes=Other` returns exactly that character; old `/characters/stats/merc-type-usage` still returns raw `Mystery` (shape unchanged); `/builds/seasons` returns `current 14` and one season `{season: 14, name: 'Alliance'}`; `/prices?gameMode=softcore` lists the seeded rows.
- [ ] **Step 2:** Run `npx vitest run test/builds-api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `maxGearHr` to `KEY_PARAMS`. Usage runs its five queries in parallel on one `filterCte` each.
- [ ] **Step 4:** Run the test, then `npm test` (phase-1 `api.test.ts` must stay green unchanged) and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): builds usage, seasons and prices endpoints`.

---

### Task 4: Builds character table and row preview endpoints

**Files:**
- Create: `server/src/api/builds-characters.ts`
- Modify: `server/src/api/app.ts`
- Test: `server/test/builds-characters.test.ts`

**Interfaces:**
- Consumes: `filterCte`, `parseFilter` (Task 3), `item_prices`, gear columns (Task 2), `mercTypeOf` (Task 3).
- Produces:
  - `type GearIcon = { name: string; itemType: string; invCode: string | null; baseType: string | null }` (`itemType` = `'Runeword'` if runeword else quality name)
  - `type BuildRow = { name: string; className: string; level: number; life: number | null; account: string | null; topSkills: Array<{ name: string; hardLevel: number; realLevel: number | null }>; keyGear: GearIcon[]; gearValueHr: number | null; gearValuePartial: boolean }`
    - `topSkills`: 3 skills by `hard_level desc, real_level desc nulls last, skill asc`.
    - `keyGear`: up to 8 player items, not switch, not charm, priceable quality, in slot order `Helm, Armor, Right Hand, Left Hand, Gloves, Belt, Boots, Amulet, Right Ring, Left Ring`.
  - `type BuildsCharactersPage = { total: number; page: number; pageSize: 25; pages: number; sort: 'level'|'life'|'gear'; dir: 'asc'|'desc'; characters: BuildRow[] }` `pages = max(1, ceil(total / 25))`.
  - `buildsCharacters(pool, f, opts: { sort: string; dir: string; page: number }): Promise<BuildsCharactersPage>` Whitelist `SORT_COLUMNS = { level: 'c.level', life: 'c.life', gear: 'c.gear_value_hr' }`, unknown sort -> `level`, unknown dir -> `desc`; `page` clamped to `1..100000` (non-numeric -> 1). Order: `<col> <dir> nulls last, c.level desc, c.id desc`. One query for the 25 ids + count, then skills and items for those ids with `= any($1)` (no per-row queries).
  - `type PreviewItem = { name: string; itemType: string; quality: string; slot: string | null; isSwitch: boolean; isCharm: boolean; invCode: string | null; baseType: string | null; medianHr: number | null }`
  - `type CharacterPreview = { name: string; className: string; level: number; life: number | null; mana: number | null; attributes: { strength: number; dexterity: number; vitality: number; energy: number }; skills: Array<{ name: string; hardLevel: number; realLevel: number | null }>; gear: PreviewItem[]; gearValueHr: number | null; gearValuePartial: boolean; mercGearValueHr: number | null; merc: { type: string; act: number | null; items: PreviewItem[] } | null }`
    - `skills`: top 10 by `coalesce(real_level, hard_level) desc, hard_level desc`.
    - `gear`: player items that are worn and not charms, plus charms whose quality is Unique (Annihilus, Torch, Gheed); slot order as above, switch last.
  - `characterPreview(pool, season: number, mode: 'softcore'|'hardcore', name: string): Promise<CharacterPreview | null>` match `lower(name) = lower($n)`.
  - Routes (cached): `GET /builds/characters` (params: filter params + `sort`, `dir`, `page`), `GET /builds/characters/:name?season&gameMode` -> preview or 404 `{ error: { message: 'Character not found' } }`. Add `sort`, `dir` to `KEY_PARAMS`.

- [ ] **Step 1: Write failing tests** (seed 3 characters with distinct life and gear values): default page sorted by level desc; `?sort=life&dir=asc` ascending life; `?sort=gear` puts the null-gear character last; first request `?sort=level` then `?sort=life` returns different first names (cache key); `?sort=name;drop&dir=up` behaves like the default and returns 200; `?page=abc` is page 1; `?page=99` gives `characters: []`, real `total`, `pages 1`; each row has `topSkills.length <= 3` and `keyGear.length <= 8` with no switch item; `pageSize` is always 25; `/builds/characters/MC-MEEKS`, `/builds/characters/mc-meeks` both 200 with `merc.type` equal to the fixture description; `/builds/characters/No%20Such` 404 with the error body; preview `gear` contains each priced item's `medianHr`.
- [ ] **Step 2:** Run `npx vitest run test/builds-characters.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test, then `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): builds character table and row preview endpoints`.

---

### Task 5: Character detail with computed stats, character history

**Files:**
- Create: `server/src/core/vendor/character-stats.ts`, `server/src/core/vendor/item-stat-expansion.ts`, `server/src/core/vendor/types/stats.ts`, `server/src/core/vendor/game-data/pd2/season-14/Properties.txt`, `.../ItemStatCost.txt`, `server/src/api/character-detail.ts`
- Modify: `server/src/core/vendor/types/index.ts` (export `CharStats`), `server/scripts/copy-migrations.js`, `server/src/api/app.ts`
- Test: `server/test/character-detail.test.ts`

**Interfaces:**
- Consumes: `readRawWithAccount` (phase 1), `item_prices` and the gear columns (Task 2), `isActivePlayerItem` (vendored phase 1). Add `getPricesFor(pool, mode, names: string[]): Promise<Map<string, ItemPrice>>` to `prices-repo.ts` (keyed by item name, one query with `= any($names)`).
- Produces:
  - Vendored `CharacterStatParser` (default export, `parseAndGetCharStats(): CharStats`) and `expandItemStats` from `upstream/main` `api/src/utils/character-stats.ts`, `item-stat-expansion.ts`, `api/src/types/stats.ts`, data files from `api/src/game-data/pd2/season-14/`. Only change: `PD2_GAME_DATA_DIRECTORY = path.join(__dirname, 'game-data', 'pd2', 'season-14')`. `copy-migrations.js` also copies `src/core/vendor/game-data/**` to `dist/core/vendor/game-data/`.
  - `type ItemPrice = { medianHr: number; samples: number; source: 'sold'|'ask' }`
  - `type CharacterDetail = Record<string, unknown> & { realStats: CharStats | null; gear: { valueHr: number | null; partial: boolean; mercValueHr: number | null }; prices: Record<string, ItemPrice | null>; season: number; mode: 'softcore'|'hardcore'; lastIngestedAt: string }` The rest is the stored enriched raw (`character`, `items`, `mercenary`, `realSkills`, `accountName`, ...), so pd2.tools-shaped consumers keep working. `realStats` is `null` when the parser throws (log at warn). `prices` keys: every Unique/Set/Runeword item name on player and merc.
  - `characterDetail(pool, season: number, mode: 'softcore'|'hardcore', name: string): Promise<CharacterDetail | null>` Case-insensitive; tries the requested mode, then the other mode (pd2.tools semantics).
  - `characterHistory(pool, season, mode, name): Promise<{ history: Array<{ ts: string; level: number; experience: number }>; total: number } | null>` ordered `ts asc`, same mode fallback; `experience` as a JS number.
  - Routes (cached, registered after `/characters/stats/*` and `/characters/accounts/:account`): `GET /characters/:name`, `GET /characters/:name/history`; params `season` (default current), `gameMode` (default softcore). Unknown -> 404 `{ error: { message: 'Character not found' } }`.

- [ ] **Step 1: Write failing tests:** port two cases from pd2-tools `character-stats.test.ts` (e.g. all-resist and FCR summing) against the vendored parser; `GET /characters/MC-MEEKS` 200 with `character.name`, `realStats.fireRes` a number, `gear.valueHr` equal to `characters.gear_value_hr`, `prices` has a key for every priceable item name; `GET /characters/mc-meeks?gameMode=hardcore` finds the softcore character (fallback); `GET /characters/Nobody` 404 error body; `GET /characters/stats/item-usage` still returns an array (route order); `/characters/MC-MEEKS/history` returns ascending `ts` and `total` equal to the history rows (upsert twice with different experience first -> 2); history of unknown name 404.
- [ ] **Step 2:** Run `npx vitest run test/character-detail.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Vendor files (`git -C ../pd2-tools-fork show upstream/main:<path>`, header line 1, fix imports only), implement `character-detail.ts`, routes, build copy.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`, and `npm run build` then `ls dist/core/vendor/game-data/pd2/season-14` shows both `.txt` files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): character detail with computed stats and history endpoint`.

---

### Task 6: Daily build-share history

**Files:**
- Create: `server/src/db/build-share-repo.ts`
- Modify: `server/src/collector/jobs.ts`, `server/src/collector/main.ts`, `server/src/api/builds-queries.ts`, `server/src/api/app.ts`
- Test: `server/test/build-share.test.ts`

**Interfaces:**
- Consumes: `CLASSES`, migration 003.
- Produces:
  - `snapshotBuildShare(pool, season: number, day: string /* YYYY-MM-DD, UTC */): Promise<number>` Upserts one row per (mode, class) for all 7 classes (zero-filled) counting characters of the season with `level >= 80`; reruns on the same day overwrite.
  - `runBuildShareJob(deps: { pool; cfg: Pick<Config,'currentSeason'> }, now = new Date())` = snapshot for `now.toISOString().slice(0,10)`.
  - `collector/main.ts`: task `{ name: 'build-share', everyMs: 6 * HOUR }` (6 h so a restart never skips a day; same-day upserts are idempotent), not gated by `active()`.
  - `buildShareHistory(pool, season, mode): Promise<{ days: Array<{ day: string; total: number; classes: Record<string, number> }> }>` last 90 days, `day asc`.
  - Route (cached): `GET /builds/history?season&gameMode`.

- [ ] **Step 1: Write failing tests:** snapshot on `2026-10-29` with the seeded pool writes 14 rows (2 modes x 7 classes); a second snapshot the same day after adding a character changes the count, still 14 rows; a snapshot on `2026-10-30` adds 14 more; `/builds/history?gameMode=softcore` returns 2 days ascending, `total` equals the sum of `classes`; unknown season returns `{days: []}`.
- [ ] **Step 2:** Run `npx vitest run test/build-share.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): daily build-share snapshot and history endpoint`.

---

### Task 7: LEXADIS layer and site shell

**Files:**
- Create: `src/app/lx.css`, `src/components/lx/{Button,Segment,Card,SearchField,Chip,Bar,Tooltip}.tsx`, `src/components/shell/{SiteHeader,TabNav,ScopeSwitch,ThemeToggle,Freshness}.tsx`, `src/lib/builds/scope.ts`, `src/app/meta/page.tsx`, `vitest.setup.ts`
- Modify: `src/app/globals.css` (one `@import "./lx.css";` after the existing imports), `src/app/layout.tsx`, `vitest.config.ts` (`setupFiles: ['./vitest.setup.ts']`)
- Test: `src/components/shell/shell.test.tsx`, `src/components/lx/segment.test.tsx`

**Interfaces:**
- Consumes: `/api/v1/stats` (phase 1), `/api/v1/builds/seasons` (Task 3).
- Produces:
  - `lx.css`: copy from `5-produkt-v2/src/app/globals.css` the token blocks (`--paper` ... `--danger-bg`, `--ambient-*`, `--radius*`, `--feder-*`, `--dauer-*`, `--weg-*`, `--versatz-*`, `--skala-*`, `--hub-hover`, `--shadow-lift/float/well/press`, the reduced-motion overrides) and the utilities `mat-thin, mat-regular, mat-thick, mat-float, mat-chrome, well, karte, zeile, feld, tabelle, drueckbar, hebbar, erscheinen, kaskade-karten, kaskade-zeilen, gleit-marker, aufklapp-inhalt, aufklapp-pfeil, skelett` plus `@keyframes erscheinen` and whatever these reference. Scoping: dark tokens on `.lx`, light tokens on `:root[data-mode="light"] .lx`; `.lx` sets `color: var(--ink); font-family: var(--font-geist-sans)`. `.lx-stage` = the product's body background (`--paper` + four radial gradients, `background-attachment: fixed`). Add `@theme inline` colours `paper, surface, ink, ink-soft, muted-ink, line, line-strong, well, brand, glow, accent-text, ok, warn, danger` and quality data colours `q-unique, q-set, q-runeword, q-rare, q-magic, q-crafted` (Global Constraints values; light variants via `color-mix`). `@media (prefers-reduced-transparency: reduce)` makes every `mat-*`/`karte` opaque `var(--surface)` without blur.
  - Primitives (all `"use client"` only where they need state): `Button({ variant: 'primary'|'secondary'|'ghost'; size?: 'sm'|'md' })` capsule 40px / sm 32px, `drueckbar`, focus `outline-2 outline-offset-2 outline-accent-text`; `Segment({ items: Array<{ value: string; label: ReactNode }>; value: string; onChange(v: string): void; ariaLabel: string })` well capsule, segments 32px, `aria-pressed`, sliding marker as in `5-produkt-v2/src/components/ui/segment.tsx` + `motion/gleit-marker.tsx` (port, `cn` from `@/lib/utils`); `Card({ as?, className })` = `karte` + `p-6`; `SearchField` well 44px 12px radius; `Chip({ onRemove? })` capsule 26px; `Bar({ pct })` horizontal share bar in `color-mix(in oklab, var(--glow) 22%, transparent)`; `Tooltip` = `mat-chrome` 16px radius on hover/focus.
  - `type Scope = { season: number | null; gameMode: 'softcore'|'hardcore' }`; `readScope(p: URLSearchParams): Scope`; `useScope(): [Scope, (next: Partial<Scope>) => void]` (writes `season`/`gameMode` into the current URL with `router.replace`, resets `page`).
  - `SiteHeader`: sticky, inside its own `.lx .lx-stage` band, `mat-thin` bar: site name "PD2 Meta" (text, no logo), `TabNav` (Builds `/builds`, Meta `/`; active via `usePathname`: `/builds*` -> Builds, `/` and `/meta` -> Meta; Builds link carries `gameMode` from the current URL, Meta link carries `gameMode`), `ScopeSwitch` (season `<select>` from `/builds/seasons` labelled `Alliance (S14) · current`, mode `Segment` Softcore/Hardcore) shown only on `/builds*` (Meta keeps its own mode control until phase 3), `Freshness` (dot + `updated 3m ago · 2,906 characters` from `/stats` `heartbeatAt` and `characters.softcore + hardcore`, `warn` colour when heartbeat older than 10 min), `ThemeToggle`.
  - `ThemeToggle`: ghost icon button, `aria-label="Switch to light mode"` / `"Switch to dark mode"`, writes `localStorage['pd2meta-theme']` and `document.documentElement.dataset.mode`. `layout.tsx` adds an inline `<script>` in `<head>` that sets `data-mode` from storage before paint (default `dark`) and `suppressHydrationWarning` on `<html>`.
  - `src/app/meta/page.tsx`: `export { default } from "../page";`

- [ ] **Step 1: Write failing tests.** `segment.test.tsx`: renders 2 items, the one equal to `value` has `aria-pressed="true"`, clicking the other calls `onChange` with its value. `shell.test.tsx` (mock `next/navigation` `usePathname`, mock `fetch`): on `/builds` the Builds tab has `aria-current="page"` and the season select and mode segment are present; on `/` the Meta tab is current and no mode segment renders; `ThemeToggle` click flips `document.documentElement.dataset.mode` from `dark` to `light` and stores it; `Freshness` with `heartbeatAt` 20 min ago renders the stale state text `updated 20m ago`.
- [ ] **Step 2:** Run `npx vitest run src/components/shell src/components/lx`. Expected: FAIL.
- [ ] **Step 3:** Implement; install nothing new in this task (`@testing-library/jest-dom` is already a dev dependency).
- [ ] **Step 4:** Run the tests, `npm test`, `npm run typecheck`, `npm run build`. Expected: PASS, export contains `out/meta/index.html`; `/` still renders the Meta tool.
- [ ] **Step 5: Commit** `feat(web): LEXADIS layer, site shell with Builds and Meta tabs`.

---

### Task 8: Builds data layer, URL state, display helpers, assets

**Files:**
- Create: `src/lib/builds/{types,api,url-state,format,display-name,item-art,quality,budget}.ts`, `public/classes/{Amazon,Assassin,Barbarian,Druid,Necromancer,Paladin,Sorceress}.webp`, `public/equipment_icons/*` (from pd2-tools `web/public/equipment_icons/`), `public/LICENSE-pd2-tools.txt`
- Modify: `package.json` (add `@2toad/profanity@^3`)
- Test: `src/lib/builds/url-state.test.ts`, `format.test.ts`, `display-name.test.ts`, `item-art.test.ts`, `budget.test.ts`, `api.test.ts`

**Interfaces:**
- Consumes: endpoint shapes from Tasks 3 to 6 (copied verbatim into `types.ts`: `UsageEntry, ItemUsageEntry, MercUsageEntry, BuildsUsage, GearIcon, BuildRow, BuildsCharactersPage, PreviewItem, CharacterPreview, ItemPrice, CharacterDetail, CharStats, SeasonsResponse, BuildShareHistory, PricesResponse`).
- Produces:
  - `api.ts` (base = `process.env.NEXT_PUBLIC_API_BASE ?? "https://api.pd2meta.info/api/v1"`, same as `src/lib/api.ts`): `getUsage(s: BuildsState)`, `getBuildCharacters(s)`, `getPreview(name, scope)`, `getSeasons()`, `getHistory(scope)`, `getCharacter(name, scope)` (404 -> `null`), `getCharacterHistory(name, scope)` (404 -> `null`), `getAccount(name, season)` (existing `/characters/accounts/:account`), `queueAccount(name): Promise<'queued'|'invalid'|'rate-limited'>` (`POST /accounts/queue`, 400 -> invalid, 429 -> rate-limited). Each takes an optional `AbortSignal`. Names are `encodeURIComponent`-ed.
  - `type BuildsState = { season: number | null; gameMode: 'softcore'|'hardcore'; minLevel: 80|85|90|95|99; classes: string[]; items: string[]; skills: Array<{ name: string; minLevel: number }>; mercTypes: string[]; mercItems: string[]; maxGearHr: number | null; sort: 'level'|'life'|'gear'; dir: 'asc'|'desc'; page: number }`
  - `DEFAULT_BUILDS_STATE` = `{ season: null, gameMode: 'softcore', minLevel: 80, classes: [], items: [], skills: [], mercTypes: [], mercItems: [], maxGearHr: null, sort: 'level', dir: 'desc', page: 1 }`; `LEVEL_PRESETS = [80, 85, 90, 95, 99]`.
  - `parseBuildsState(p: URLSearchParams): BuildsState` (unknown classes dropped against the 7 class names; `minLevel` snapped down to the nearest preset, below 80 -> 80; bad numbers -> default; `skills` JSON like the server, invalid -> `[]`); `serializeBuildsState(s): URLSearchParams` (omits defaults; lists comma-joined; round-trips); `toApiParams(s): URLSearchParams` (server names: `season, gameMode, minLevel, maxLevel=99, classes, items, skills, mercTypes, mercItems, maxGearHr, sort, dir, page`).
  - Reducers, each resetting `page` to 1: `toggleClass, toggleItem, toggleMercType, toggleMercItem (name)`, `toggleSkill(name)` (adds `{name, minLevel: 20}` or removes), `setLevel`, `setBudget`, `setSort(col)` (same column flips `dir`, new column starts `desc`), `clearFilters(s)` (clears classes, items, skills, mercTypes, mercItems, maxGearHr; keeps season, gameMode, minLevel, sort).
  - `metaHref(s: BuildsState): string` -> `/?mode=guide&gameMode=<m>&className=<first class>&minLevel=<l>&skills=<json>` (Meta url-state names).
  - `format.ts`: `formatHr(v: number | null): string` (`null` -> `n/a`; `< 10` 2 decimals, `< 100` 1 decimal, else 0: `0.6 -> '0.60'`, `10.43 -> '10.4'`, `123.4 -> '123'`); `formatPct(p)` (`< 10` 1 decimal, else integer: `9.43 -> '9.4%'`, `12.2 -> '12%'`, `0 -> '0%'`); `formatCount(n)` (`12293 -> '12,293'`); `formatAgo(iso, now)` (`'3m ago'`, `'2h ago'`, `'4d ago'`).
  - `display-name.ts`: `displayName(name: string): string` with `new Profanity({ wholeWord: false })` (same settings as pd2-tools' scraper); profane -> first character + `*` for the rest.
  - `quality.ts`: `qualityClass(itemType: string): string` -> `text-q-unique | text-q-set | text-q-runeword | text-q-rare | text-q-magic | text-q-crafted | text-ink`.
  - `item-art.ts`: `itemArtUrl(i: { name: string; invCode: string | null; baseType?: string | null }): string | null` ported from pd2-tools `Equipment.tsx`: `Annihilus -> /equipment_icons/anni.png`, `Hellfire Torch -> /equipment_icons/torch.png`, names containing `Gheed` -> `/equipment_icons/lcha.png`, charms by `baseType` (`Small Charm -> /equipment_icons/scha.png`, `Medium Charm -> mcha.png`, `Large Charm -> lcha.png`; pd2-tools keyed these by `base.type_code`, which we do not store), names in pd2-tools' `ItemsWithImages` set (copy the set verbatim from `Equipment.tsx`) -> `/equipment_icons/<Name_With_Underscores>.png`, else `https://projectdiablo2.com/image/items/inv<invCode>.png`, `null` when no `invCode`. `skillIconUrl(name)` = `/icons/<Name_With_Underscores>.png` (as `FilterForm.tsx`). `classIconUrl(cls)` = `/classes/<Class>.webp`.
  - `budget.ts`: `GEAR_BUDGET_STOPS: Array<number | null> = [0, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 50, null]` (`null` = Any, last); `budgetIndex(v: number | null): number` (nearest stop at or above, `null` -> last).

- [ ] **Step 1: Write failing tests.** `url-state`: `parseBuildsState(new URLSearchParams('classes=Paladin,Wizard&minLevel=83&page=abc&maxGearHr=-1&sort=foo&dir=up'))` gives `classes ['Paladin']`, `minLevel 80`, `page 1`, `maxGearHr null`, `sort 'level'`, `dir 'desc'`; `serializeBuildsState(DEFAULT_BUILDS_STATE).toString() === ''`; a full state round-trips; `toggleSkill` twice returns to `[]`; any toggle sets `page` to 1; `setSort('level')` on default flips to `asc`; `setSort('gear')` starts `desc`; `clearFilters` keeps `gameMode: 'hardcore'`; `metaHref` with Paladin + FoH contains `className=Paladin` and an encoded skills JSON. `format`: values above. `display-name`: a known profane word (`'Fuckface'`) -> `'F*******'`, `'MC-MEEKS'` unchanged. `item-art`: Annihilus, a Small Charm, an `ItemsWithImages` name, a plain unique with `invCode 'ghm'` -> `https://projectdiablo2.com/image/items/invghm.png`, `invCode null` -> `null`. `budget`: `budgetIndex(null) === 13`, `budgetIndex(4) === 6`. `api`: `getCharacter` on 404 resolves `null`; `queueAccount` on 429 resolves `'rate-limited'`; `getUsage` URL starts `https://api.pd2meta.info/api/v1/builds/usage?` when the env var is unset.
- [ ] **Step 2:** Run `npx vitest run src/lib/builds`. Expected: FAIL.
- [ ] **Step 3:** `npm install @2toad/profanity@^3`; copy assets with `git -C ../pd2-tools-fork show upstream/main:web/public/<file> > public/...` (binary-safe: use `git -C ../pd2-tools-fork archive upstream/main web/public/equipment_icons web/public/Amazon.webp ... | tar -x` into a scratch dir, then copy); implement modules.
- [ ] **Step 4:** Run tests, `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): builds data layer, URL state, display helpers, class and item art`.

---

### Task 9: Builds page frame: header line, toolbar, class share, gear budget, active filters

**Files:**
- Create: `src/app/builds/page.tsx`, `src/components/builds/{BuildsView,BuildsHeader,Toolbar,ClassShare,GearBudget,ActiveFilters}.tsx`, `src/components/lx/Sparkline.tsx`
- Test: `src/components/builds/frame.test.tsx`

**Interfaces:**
- Consumes: Task 7 primitives and `useScope`, Task 8 state, reducers, api, format, `classIconUrl`; `BuildsUsage.breakdown`, `seasonTotal`, `/builds/history`.
- Produces:
  - `BuildsView`: owns `BuildsState` from the URL (`parseBuildsState(useSearchParams())`), writes changes with `router.replace('/builds?' + serializeBuildsState(next))` (no scroll jump), fetches usage and characters with `AbortController` on every state change (debounce 150 ms), keeps the last result visible with `aria-busy` while loading, shows a `skelett` block on first load and an inline error capsule `Could not load builds. Retry` on failure. Layout (desktop >= 1024px): header line, toolbar card, class share card, then a 12-column grid: left column 4 cols (GearBudget card, four UsageCards, Task 10), right 8 cols (ShoppingList, CharacterTable, Tasks 10 and 11). Below 1024px one column. Cards enter with `kaskade-karten`.
  - `BuildsHeader({ seasonName, seasonNumber, gameMode, seasonTotal })`: eyebrow `BUILDS`, headline `Builds`, meta line `Alliance (S14) · Softcore · 12,293 characters` (mono numbers), explainer: `What every level 80+ ladder character is wearing right now: class shares, the skills they max, the gear and mercs they run, and what it costs at current market prices. Click anything to narrow it down.`
  - `Toolbar`: level `Segment` `80+ | 85+ | 90+ | 95+ | 99` (`setLevel`). Season and mode are not repeated here: on Builds routes the header `ScopeSwitch` (Task 7) is the toolbar's season and mode control (spec 4.3 shared switch), and it writes the same URL params.
  - `ClassShare({ breakdown, selected: string[], history, onToggle })`: full-width segmented bar (one segment per class, width = share, ordered by count desc, colour = `color-mix(in oklab, var(--glow) <100% - 10% * rank>, transparent)`, selected classes outlined in `--accent-text`), 7 tiles (class icon, name, `%` and count in mono, `Sparkline` of that class's daily share from `/builds/history`, `aria-pressed`), a capsule `All classes 12,294` that clears the class filter. A tile click toggles the class (multi-select, OR).
  - `Sparkline({ values: number[]; label: string })`: 64x20 SVG polyline, stroke `var(--accent-text)`, `role="img"` with `aria-label` like `Paladin share over 14 days, 17% to 18%`; renders nothing with fewer than 2 values.
  - `GearBudget({ value: number | null; onChange })`: card titled `Gear budget`, native `<input type="range" min=0 max=13 step=1>` over `GEAR_BUDGET_STOPS` (well track, `glow` fill, 22px knob, spring on the knob via `--feder-zackig`), value label `Any` or `≤ 2.00 HR`; `onChange` debounced 250 ms; `aria-valuetext` equals the label.
  - `ActiveFilters({ state, onChange })`: one `Chip` per active filter (`Paladin`, `Fist of the Heavens 20+`, `Item: Spirit`, `Merc: Fire Arrow`, `Merc item: Insight`, `Budget ≤ 2.00 HR`), each removable, plus ghost `Clear filters` (calls `clearFilters`); hidden when nothing is active. Also a secondary `Open in Meta` button linking to `metaHref(state)`.

- [ ] **Step 1: Write failing tests** (mock `next/navigation` and `fetch` with fixed `BuildsUsage`, `BuildsCharactersPage`, history): header shows `12,293 characters` and the season name; clicking the Paladin tile calls `router.replace` with a URL containing `classes=Paladin` and no `page=`; with `?classes=Paladin` the Paladin tile has `aria-pressed="true"` and a `Paladin` chip renders; `Clear filters` removes `classes`, keeps `gameMode=hardcore`; level `90+` sets `minLevel=90`; budget slider set to index 4 updates the label to `≤ 2.00 HR` and (after fake-timer 250 ms) the URL has `maxGearHr=2`; `Open in Meta` href contains `className=Paladin`; with `seasonTotal 0` and `total 0` the header shows `0 characters` and nothing throws.
- [ ] **Step 2:** Run `npx vitest run src/components/builds/frame.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement; `src/app/builds/page.tsx` = `<Suspense fallback={skeleton}><BuildsView/></Suspense>` inside `<main className="lx lx-stage">`.
- [ ] **Step 4:** Run tests, `npm run typecheck`, `npm run build` (export contains `out/builds/index.html`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): builds page frame with class share, budget and filter chips`.

---

### Task 10: Usage side cards and shopping list

**Files:**
- Create: `src/components/builds/{UsageCard,ShoppingList,ItemIcon}.tsx`
- Modify: `src/components/builds/BuildsView.tsx`
- Test: `src/components/builds/usage.test.tsx`

**Interfaces:**
- Consumes: `BuildsUsage` lists, reducers, `formatPct`, `formatHr`, `itemArtUrl`, `skillIconUrl`, `qualityClass`, `buildMarketUrl` (existing `src/lib/price/marketUrl.ts`).
- Produces:
  - `UsageCard({ title: 'Skills'|'Items'|'Mercenary'|'Merc items'; entries: Array<UsageEntry | ItemUsageEntry | MercUsageEntry>; selected: string[]; onToggle(name: string): void; icon?: (e) => ReactNode })`: card (`karte`), title + distinct count in mono, `SearchField` placeholder `Search 591 items...` (case-insensitive substring), top 8 rows then ghost link `Show all 591` / `Show top 8`; each row is a `<button aria-pressed>` with a `Bar` behind it at `pct` width, icon, name (quality colour for items), `formatPct(pct)` right-aligned mono; selected rows carry the `--accent-text` left edge. Merc rows show `name` plus `Act 2` caption (no caption when `act` is null). Empty search: `No matches`.
  - Wiring: Skills -> `toggleSkill`, Items -> `toggleItem`, Mercenary -> `toggleMercType`, Merc items -> `toggleMercItem`. `selected` for skills = names in `state.skills`.
  - `ShoppingList({ items: ItemUsageEntry[] })`: card titled `Shopping list` with `Σ <sum> HR` (sum of `medianHr` of the top 10, nulls excluded, `formatHr`; trailing `+` and `title="Some items have no price yet"` when any of the 10 is unpriced), caption `The 10 items most worn by characters matching your filters, at current market prices.`, two-column grid of 10 rows: icon, quality-coloured name, small `Bar`, `formatPct`, price capsule (`0.34 HR` mono or `n/a`), `Market` link (`buildMarketUrl({ itemType, name })`, `target="_blank" rel="noopener"`) only when priced. Fewer than 10 items: render what exists; zero items: `No items match these filters.`
  - `ItemIcon({ item: { name; itemType; invCode; baseType? }; size?: 28 | 36 })`: 28px square, 8px radius well with a 1px inner ring in the quality colour at 45%, `<img loading="lazy" alt={name}>` from `itemArtUrl`, falls back to the first letter when the URL is null or the image errors.

- [ ] **Step 1: Write failing tests:** Items card with 12 entries shows 8 rows and `Show all 12`; clicking it shows 12; typing `ber` filters to matching names; clicking a row calls `onToggle` with its name and the row has `aria-pressed="true"` when in `selected`; Mercenary card shows `Act 1` under `Fire Arrow`; ShoppingList with prices `0.2, 0.34, null` and 7 more priced at `0.1` shows `Σ 1.24 HR+`; the unpriced row shows `n/a` and no Market link; Market link href starts with `https://www.projectdiablo2.com/market?`; empty items list shows the empty text and `Σ 0.00 HR`.
- [ ] **Step 2:** Run `npx vitest run src/components/builds/usage.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire into `BuildsView`.
- [ ] **Step 4:** Run tests, `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): builds usage cards and shopping list`.

---

### Task 11: Character table with sort, pagination and inline row preview

**Files:**
- Create: `src/components/builds/{CharacterTable,RowPreview}.tsx`
- Modify: `src/components/builds/BuildsView.tsx`
- Test: `src/components/builds/table.test.tsx`

**Interfaces:**
- Consumes: `BuildsCharactersPage`, `getPreview`, `setSort`, `displayName`, `ItemIcon`, `skillIconUrl`, `classIconUrl`, formatters.
- Produces:
  - `CharacterTable({ page: BuildsCharactersPage; state: BuildsState; onChange(next: BuildsState): void })`: `mat-thick` card, title `Characters`, caption `12,294 characters match`; `tabelle` with columns `Character` (class icon, `displayName(name)`, class caption), `Lvl`, `Life`, `Top skills` (3 skill icons with `title`), `Key gear` (`ItemIcon`s, `-` when empty), `Gear HR` (`formatHr`, trailing `+` when partial, `-` when null), chevron. Sortable headers `Lvl`, `Life`, `Gear HR` are buttons with `aria-sort` (`descending`/`ascending`/`none`) calling `setSort('level'|'life'|'gear')`. Footer: `‹ Prev`, `Page 1 of 492`, `Next ›` capsule buttons, disabled at the ends; page change scrolls the table top into view (`behavior: 'smooth'`, `'auto'` under reduced motion). Rows enter with `kaskade-zeilen`. Empty: `No characters match these filters.` with `Page 1 of 1`.
  - Row click or Enter/Space on the row toggles an inline preview below it (one open at a time, `aria-expanded` on the row, chevron `aufklapp-pfeil`), preview container uses `aufklapp-inhalt` with `data-offen`.
  - `RowPreview({ name; scope })`: fetches `getPreview` once per open (cache in a `Map` for the page), three columns: `Skills` (10 rows: icon, name, a bar for `realLevel` with the `hardLevel` part solid and the bonus part at 40%, `34` mono with `20` muted hard level), `Gear` (`ItemIcon`, quality-coloured name, price capsule or nothing, switch items captioned `switch`), `Stats` (Life, Mana, Str, Dex, Vit, Ene in mono) and `Merc · Fire Arrow` (`act` caption) with merc `ItemIcon`s, then a secondary button `Full character ›` linking to `/builds/character?name=<encoded raw name>&season=<s>&gameMode=<m>`. Loading: `skelett` lines; failure: `Could not load this character.`

- [ ] **Step 1: Write failing tests:** 25 rows render with masked names for a profane fixture name while its `Full character` href uses the raw encoded name; clicking `Life` calls `onChange` with `sort 'life', dir 'desc', page 1`; with `sort life desc` the Life header has `aria-sort="descending"`; footer shows `Page 2 of 3` for `page 2, pages 3`, both buttons enabled, `Prev` disabled on page 1; gear `4.3` partial renders `4.30+`; clicking a row fetches `/builds/characters/<name>?` once, shows `Full character ›`, a second row click closes the first; empty page renders `No characters match these filters.` and `Page 1 of 1`.
- [ ] **Step 2:** Run `npx vitest run src/components/builds/table.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run tests, `npm test`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): character table with server-side sort, paging and row preview`.

---

### Task 12: Character page

**Files:**
- Create: `src/app/builds/character/page.tsx`, `src/components/character/{CharacterView,CharacterHeader,EquipmentGrid,ItemTip,SkillsPanel,StatsPanel,LevelChart}.tsx`
- Test: `src/components/character/character.test.tsx`

**Interfaces:**
- Consumes: `getCharacter`, `getCharacterHistory`, `queueAccount`, `displayName`, `ItemIcon`, `itemArtUrl`, `skillIconUrl`, `classIconUrl`, `formatHr`, `formatAgo`, `CharacterDetail`, `CharStats`.
- Produces:
  - `CharacterView` reads `name`, `season`, `gameMode` from the URL. Not found: card `Character not found` with a link back to `/builds`. Missing `name`: same card.
  - `CharacterHeader`: class icon, headline `displayName(name)`, line `Level 95 Paladin · Softcore · Alliance (S14)`, account link `/builds/account?name=<account>&season=<s>` (hidden when no account), external link `View on projectdiablo2.com` -> `https://www.projectdiablo2.com/character/<encoded name>` (`target="_blank" rel="noopener"`), `Updated 3h ago` from `lastIngestedAt`, `Refresh` secondary button: calls `queueAccount(account)`, then shows `Queued. Fresh data within a few minutes.` / `Too many requests, try again later.` / disabled with `title="Account unknown"` when no account; gear value capsule `Gear 12.3 HR` (+ partial marker) and `Merc 1.20 HR`.
  - `EquipmentGrid({ items, mercItems, prices })`: `Player | Merc` `Segment`; paper-doll grid with named cells (`Helm`, `Amulet`, `Right Hand`, `Armor`, `Left Hand`, `Right Ring`, `Belt`, `Left Ring`, `Gloves`, `Boots`) as wells (14px radius), item art inside, ethereal items at 0.45 opacity; below, a strip `Weapon switch` (Right/Left Hand Switch) and `Charms` (inventory charms, unique charms first). Each cell is focusable and opens `ItemTip` on hover/focus.
  - `ItemTip({ item, price })`: `mat-chrome` tooltip, 16px radius: quality-coloured name, base name, `properties` lines from the raw item, `Corrupted` in `danger` when `corrupted`, price line `0.34 HR (median of 12 sold)` / `(median of 7 asks)` / `No price yet`.
  - `SkillsPanel({ realSkills, skills })`: rows sorted by real level desc, skill icon, name, bar (hard part solid, bonus part 40%), `34` mono with `(20)` hard; zero-level skills hidden.
  - `StatsPanel({ stats: CharStats | null; life; mana })`: groups `Defensive` (Life, Mana, Physical damage reduction %), `Attributes` (Str, Dex, Vit, Ene), `Resistances` (`fire/max`, `cold/max`, `lightning/max`, `poison/max`; values below 0 in `danger`), `Absorb` (flat / %), `Speed` (FCR, FHR, FRW, IAS; caption `Item bonuses only`), `Damage procs` (CB, DS, OW, CS), `Leech` (life, mana, per-kill). `null` -> `Stats unavailable for this character.`
  - `LevelChart({ history })`: inline SVG, width 100%, height 160, level 80 to 99 y-axis (mono ticks), time x-axis (first and last date), polyline in `var(--accent-text)` with dots at each row, `role="img"` and `aria-label` `Level 85 on Oct 24 to 95 on Oct 29`. Fewer than 2 rows: `Not enough history yet.`
  - Page layout: header card full width; grid 7/5: left Equipment card + Stats card, right Skills card + Level history card.

- [ ] **Step 1: Write failing tests** (fixture: `server/test/fixtures/character-ladder.json` wrapped into a `CharacterDetail` with `realStats` stub and 2 history rows): header shows level, class and the account link `/builds/account?name=MC-MEEKS&season=14`; Refresh with a mocked 200 shows the queued text, with 429 the rate-limit text; Equipment shows an image with `alt="Nightwing's Veil"`; toggling `Merc` shows the merc items; focusing an item shows its first property line and `No price yet` when `prices[name]` is null; Skills lists the highest real level first; StatsPanel renders negative cold res in the danger class; LevelChart with 2 rows has an `aria-label` mentioning both levels, with 1 row shows `Not enough history yet.`; unknown character (404) renders `Character not found`.
- [ ] **Step 2:** Run `npx vitest run src/components/character`. Expected: FAIL.
- [ ] **Step 3:** Implement; page = `<main className="lx lx-stage"><Suspense>…</Suspense></main>`.
- [ ] **Step 4:** Run tests, `npm run typecheck`, `npm run build` (export has `out/builds/character/index.html`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): character page with equipment, stats, skills and level history`.

---

### Task 13: Account page, Add account, Meta link back

**Files:**
- Create: `src/app/builds/account/page.tsx`, `src/components/builds/AccountView.tsx`, `src/components/builds/AddAccount.tsx`
- Modify: `src/app/page.tsx` (one link), `src/components/builds/BuildsView.tsx` (AddAccount in the table card footer)
- Test: `src/components/builds/account.test.tsx`

**Interfaces:**
- Consumes: `getAccount`, `queueAccount`, `displayName`, `classIconUrl`, formatters; Meta `UiState` URL params (`gameMode`, `className`, `skills`, `minLevel`).
- Produces:
  - `AccountView`: reads `name`, `season`; headline = account name (masked with `displayName`), caption `5 characters this season`; `mat-thick` list, one row per character (class icon, masked name, `Level 95 Paladin`, mode chip `Hardcore` when hardcore, `Updated 3h ago` from `lastUpdated`), each row links to `/builds/character?name=<raw>&season=<s>&gameMode=<mode>`. Unknown or empty account: `No tracked characters for this account yet.` plus `AddAccount` prefilled.
  - `AddAccount({ initial?: string })`: inline form, `SearchField` label `Account name`, primary capsule `Track account`; client check `^[a-zA-Z0-9_-]{1,50}$` before calling `queueAccount`; messages `Queued. Characters appear within a few minutes.` / `Account names use letters, numbers, _ and - only.` / `Too many requests, try again later.`
  - Meta page: a ghost link `See characters` next to the existing Generate/Reset controls, href `/builds?gameMode=<m>&classes=<className>&skills=<json>&minLevel=<snapped>` built by `buildsHrefFromMeta(ui: UiState): string` in `src/lib/builds/url-state.ts` (snaps `minLevel` down to a preset). No other change to the Meta page.

- [ ] **Step 1: Write failing tests:** account with 2 characters renders 2 links with raw-name hrefs and masked labels for a profane name; empty account renders the empty text and the prefilled form; `AddAccount` with `a b` shows the validation text and makes no request; 200 shows the queued text; `buildsHrefFromMeta({ filter: { gameMode: 'hardcore', className: 'Paladin', minLevel: 87 }, skills: [{ name: 'Fist of the Heavens', minLevel: 20 }], mode: 'guide', diffName: '' })` contains `gameMode=hardcore`, `classes=Paladin`, `minLevel=85`.
- [ ] **Step 2:** Run `npx vitest run src/components/builds/account.test.tsx src/lib/builds/url-state.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run build`. Expected: PASS; the existing Meta tests stay green.
- [ ] **Step 5: Commit** `feat(web): account page, add-account form, Meta to Builds link`.

---

### Task 14: Deploy, headless check, merge, sprint close (controller runs this task, not a subagent)

**Files:**
- Modify: `deploy/RUNBOOK.md` (backfill step), `CLAUDE.md` (status line), `plan/roadmap.md`

**Interfaces:**
- Consumes: everything above.
- Produces: production API with the new endpoints, www.pd2meta.info with Builds and Meta tabs.

- [ ] **Step 1: Server deploy** per `deploy/RUNBOOK.md` (ship `git archive HEAD server deploy`, rebuild, `docker compose up -d --build`). Migration 003 runs on start. Then once: `docker compose exec api node dist/scripts/backfill-items.js` and wait for the collector's first `prices` and `build-share` runs (they run at start). Add the backfill command to the runbook.
- [ ] **Step 2: Verify API:** `curl -s https://api.pd2meta.info/api/v1/builds/usage?gameMode=softcore` has `seasonTotal > 0` and items with non-null `medianHr`; `select count(*) from item_prices` > 100; `select count(*) from characters where season = 14 and gear_value_hr is not null` equals the season count; `/builds/characters?sort=gear` first row has the largest `gearValueHr`; `/characters/<a real name>` has `realStats`; `/builds/history?gameMode=softcore` has 1 day; old `/characters/stats/item-usage?gameMode=softcore` unchanged in shape; `/stats` heartbeat fresh, `requestsLastHour <= 3600`.
- [ ] **Step 3: Headless web check** on `npm run dev` at `http://localhost:3000` (CORS allows it; previews are SSO-protected) with Playwright headless (`tools/shopify-session` pattern, never a visible browser): `/builds` loads in dark mode, class tiles sum to the header count, clicking Paladin narrows the table and adds a chip, sort by Gear HR, page 2, expand a row and follow `Full character ›`, character page shows equipment and stats, account link works, theme toggle switches to light, `/` still runs the Meta tool (Paladin + Fist of the Heavens 20, Generate shows rows), `See characters` lands on `/builds` with the class set. Screenshot both themes into the session scratchpad and compare against the look rules (glass over stage, capsules, one accent, no grey-border white cards).
- [ ] **Step 4: Merge** `sprint/4.2-builds` into `main` (Vercel auto-deploys), repeat the `/builds` part of Step 3 on `https://www.pd2meta.info/builds`.
- [ ] **Step 5: Sprint close:** `CLAUDE.md` status line (phase 2 merged, next phase 3 Meta endpoints), `plan/roadmap.md` entry. Commit `docs: sprint 4.2 close` on `main`.

---

## Rulings made in this plan (owner can overturn)

- Meta stays at `/` (existing shared links keep working); `/meta` is an alias. The header season/mode switch shows only on Builds routes; Meta keeps its own mode control until phase 3.
- The header uses the LEXADIS look on every route, inside its own stage band; the Meta body keeps the D2 look until phase 4. LEXADIS tokens are scoped to `.lx` so the two looks do not collide.
- Gear value = player items that are worn (slot set, switch included) or charms, priced Unique/Set/Runeword only; merc gear value stored and shown separately. Rares, magic and crafted items are unpriceable and do not make a value partial.
- Prices: sold set needs 5 samples, open asks need 3; corrupted listings excluded; prices keyed by (mode, Unique/Set/Runeword, name).
- Merc types: the raw PD2 descriptions are already readable (they match pd2trader's labels), so they are the group names, with the act from pd2-tools' table as a caption; unknown values group as `Other` (filterable) and are logged.
- Profane names: first letter + asterisks in every UI list, header and title; links and API keep the raw name.
- Build-share history renders as one sparkline per class tile (one accent, no 7-colour chart). Class bar segments are shades of the accent glow, ordered by share.
- Class share tiles show the pool without the class filter, so classes stay comparable while one is selected.
- Row preview uses a compact `/builds/characters/:name` endpoint built from our tables, not the full raw character.
- The character page Refresh button queues the character's account through the existing `POST /accounts/queue` (no new write endpoint).
