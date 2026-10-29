# pd2meta v2, Phase 5: archive import S11 to S13, archive seasons in Builds and Meta, parity test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seasons 11 (Prosperity), 12 (Suffering) and 13 (Betrayal) are imported once from `api.pd2.tools` into our own database. You can pick them in the season selector, and Builds and Meta work for them without market prices. A parity script shows that our S13 aggregates match pd2.tools.

**Architecture:** A resumable importer (`server/src/archive/`, CLI `dist/scripts/import-archive.js`) runs in its own container from the `pd2meta-server` image on the VPS. It pages `GET /characters` of api.pd2.tools at 1 request per second. Each page is written in one transaction: new characters with `source='archive'`, their skills, items and merc rows, their meta rollup facts and the progress row. A crash therefore resumes at the next unwritten page, and a rerun inserts nothing twice. The rollup stays consistent per page through a new batch function `addMetaRollupFacts`, so no `backfill-meta` and no collector pause are needed. Seasons other than `CURRENT_SEASON` are archive seasons: the API returns no prices for them and ignores the gear budget. The web hides the price surfaces for them. A parity CLI compares our S13 endpoints with pd2.tools for 8 filter sets and prints a pass/fail table.

**Tech Stack:** Server: Node 22, TypeScript 5, Express 4, `pg` 8, vitest 4 + supertest on `embedded-postgres`, global `fetch`. Web: Next.js 16 static export, React 19, Tailwind 4, vitest 4 + jsdom + `@testing-library/react`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-28-pd2meta-v2-design.md` (sections 6, 8 phase 5, 9). Format, constraints and what exists: `docs/superpowers/plans/2026-10-29-pd2meta-v2-phase34-meta.md`, `deploy/RUNBOOK.md`.

## Global Constraints

- The collector's rules and code stay untouched: one `RateLimiter` against `api.projectdiablo2.com`, 1 req/s, peak pause, kill switch. The importer calls only `api.pd2.tools` and has its own limiter instance at `minIntervalMs 1000` (spacing between request starts). It never touches `api.projectdiablo2.com`.
- Importer `User-Agent`: `USER_AGENT` from `server/src/upstream/pd2-client.ts`. Page size 50 (`pageSize=50`). Upstream order is fixed: `ORDER BY level DESC, character_db_id DESC`.
- Archive rows: `characters.source = 'archive'`, `gear_value_hr null`, `gear_value_partial false`, `merc_gear_value_hr null`, no `character_history` rows, `raw` = gzip of the pd2.tools JSON as received (it already has `accountName`, `realSkills`, `lastUpdated`), `last_ingested_at` = `lastUpdated` (ms) when it is a finite number, else the import time. Only level >= 80 (`cfg.minLevel`). The requested `gameMode` sets `mode`, and `is_ladder` is ignored: ended seasons report `is_ladder false`.
- The importer refuses `season >= CURRENT_SEASON`. It never updates an existing row: `on conflict (season, mode, name) do nothing`.
- Disk budget (measured on prod 2026-10-29 at 7,465 S14 characters: characters incl. raw TOAST about 13 KB/char with raw gzip about 10 KB, `character_items` about 26 KB/char, `character_skills` about 4 KB/char, `meta_rollup` 165 MB for the season; DB 525 MB; host `/` 16 GB free): the pd2.tools totals at minLevel 80 are S13 57,740 sc + 12,627 hc, S12 66,210 + 13,693, S11 56,972 + 10,540 = 217,782 characters. At 50,000 bytes/char that projects to about 10.9 GB. Gate: before each (season, mode) chunk and every 50 pages, stop with exit code 3 when `free disk - remaining chunk chars x bytesPerChar < 4 GB` (`--min-free-gb 4`) or `pg_database_size + remaining x bytesPerChar > 12 GB` (`--max-db-gb 12`). `bytesPerChar` = 50,000 until the run has inserted 2,000 characters, then the measured `(db size now - db size at run start) / inserted this run`. Import order is S13, S12, S11, so a gate trips on the least valuable season. Raw is kept, because the character pages and the parity explain step need it. If the gate trips, the controller stops and asks the owner whether to drop S11 or free disk. It does not drop raw on its own.
- Prices: only `CURRENT_SEASON` has prices. For archive seasons every price field the API returns is `null` (item usage `medianHr`, preview `medianHr`, character detail `prices` values, Meta `price`, `runes`, `runeCostHr`, `pricesComputedAt`), and `maxGearHr` is ignored. The web shows `n/a` or hides the price surface, never today's prices for an old season.
- SQL uses bind parameters only. Existing response shapes stay. New fields are additive: `CharacterDetail.archive: boolean`.
- Look (binding): LEXADIS as implemented in `src/app/lx.css` and `src/components/lx/*`. Tokens from `lx.css` only, existing components (`Card`, `Button`, `Segment`, `Bar`), no new colours, shadows, radii or durations. Copy in English, no em dashes, missing value `-`, missing price `n/a`.
- Never use context7. Do not `sed -i` (CRLF churn). Stage explicit paths and run `git diff --stat` before each commit.
- Branch `sprint/4.4-archive` off `main`. One commit per task. Nothing is pushed or merged until Task 6 (controller).
- Tests: server `cd server && npx vitest run <files>`; web `npx vitest run <files>` at the repo root. Each task ends with its files green, the package's full `npm test`, and `npx tsc --noEmit` (web: `npm run typecheck`).

## Review Focus

1. The upstream set moves while we page (S13 softcore total went 57,735 to 57,743 within minutes on 2026-10-29, so pd2.tools still adds S13 rows). Rows that shift onto the next page arrive twice and count as `existing`, never as a second insert. Rows that shift past us are caught by the S13 gap pass (`--pass 2`). Test in Task 2.
2. Crash or restart mid-run. A page's rows and its progress row commit together. A failing write leaves both untouched, a restart begins at `next_page`, and a rerun of a finished chunk makes no request. Tests in Tasks 1 and 2.
3. Odd archive payloads: `is_ladder false`, negative `experience` (pd2.tools int32 overflow, e.g. `-774482042`), no `mercenary`, empty `accountName`, level 79, no `character` object. The first three are imported, level 79 counts as `below_min`, and a payload with no `character` counts as `invalid`. None of them aborts the page. Test in Task 2.
4. Live season protection. `--season 14` is refused. While the import runs, an S14 `upsertCharacter` still succeeds and its rollup stays exact (the advisory lock is held per page only). S14 prices never show up on S13 views. Tests in Tasks 1, 2 and 3.
5. An archive view of a shared link like `/builds?season=13&maxGearHr=5&sort=gear`: no budget chip, no budget slider, no gear column, the server ignores the budget, the shopping list has no sum, an empty class-share history and an empty level history show quiet text, and nothing renders `NaN`. Tests in Tasks 3 and 5.

---

## File structure

```
server/
  src/db/migrations/006_archive_import.sql   archive_import_progress
  src/db/meta-rollup.ts                      (modify) addMetaRollupFacts(client, ids)
  src/db/characters-repo.ts                  (modify) export dedupeSkills
  src/archive/write.ts                       writeArchivePage (one transaction per page)
  src/archive/pd2tools.ts                    fetchArchivePage, toArchiveCompact
  src/archive/import.ts                      importArchive loop, disk gate, progress
  src/archive/parity.ts                      compare functions, filter sets, table
  src/scripts/import-archive.ts              CLI
  src/scripts/parity-archive.ts              CLI
  src/config.ts                              (modify) SEASON_NAMES adds 11 'Prosperity'
  src/api/filters.ts                         (modify) archive flag, budget ignored
  src/api/{builds-queries,builds-characters,character-detail,app}.ts, src/api/meta/{items,cohort}.ts   (modify) no prices for archive
  test/fixtures/pd2tools-page.json           3 real S13 characters (trimmed page 1)
  test/{archive-write,archive-import,archive-api,archive-parity}.test.ts
src/
  lib/builds/scope.ts                        (modify) isArchiveSeason
  components/builds/{BuildsView,ActiveFilters,ShoppingList,CharacterTable}.tsx   (modify)
  components/meta/{MetaView,MetaHeader}.tsx  (modify) past-season note
  components/character/{CharacterHeader,CharacterView,LevelChart}.tsx   (modify)
  components/builds/archive.test.tsx         new
deploy/RUNBOOK.md                            (modify, Task 6) archive import section
```

---

### Task 1: Progress table, batch rollup facts, page writer

**Files:**
- Create: `server/src/db/migrations/006_archive_import.sql`, `server/src/archive/write.ts`
- Modify: `server/src/db/meta-rollup.ts`, `server/src/db/characters-repo.ts`
- Test: `server/test/archive-write.test.ts`, extend `server/test/migrate.test.ts`

**Interfaces:**
- Consumes: `GROUPED_SQL`, `factParams()`, `lockMetaRollup`, `META_FACTS_FINGERPRINT`, `rebuildMetaRollup`, `metaRollupState` (`meta-rollup.ts`); `replaceItems`, `readRaw` (`characters-repo.ts`); `CompactCharacter` (`core/compact.ts`).
- Produces:
  - `006_archive_import.sql`: `create table archive_import_progress (season int not null, mode text not null check (mode in ('softcore','hardcore')), pass int not null, next_page int not null default 1, upstream_total int, received int not null default 0, inserted int not null default 0, existing int not null default 0, below_min int not null default 0, invalid int not null default 0, done boolean not null default false, updated_at timestamptz not null default now(), primary key (season, mode, pass));`
  - `dedupeSkills(c: CompactCharacter): Array<{ skill: string; hardLevel: number; realLevel: number | null }>`, exported from `characters-repo.ts` (the highest `hardLevel` per skill, taken from `upsertCharacter`, which now calls it).
  - `addMetaRollupFacts(client: PoolClient, ids: number[]): Promise<void>` in `meta-rollup.ts`: the caller holds `lockMetaRollup`, and `ids` are characters that have no facts in the rollup yet. One statement: `${GROUPED_SQL} insert into meta_rollup (...) select ... from d order by ${GROUP_COLS} on conflict on constraint meta_rollup_key do update set n = n + excluded.n, total = total + excluded.total, entries = entries + excluded.entries`, then the same fingerprint stamp as `withMetaRollup` (`where fingerprint is null`). No-op for `[]`.
  - `type ArchiveRow = { compact: CompactCharacter; raw: object; lastUpdated: Date }`
  - `type PageCounts = { received: number; inserted: number; existing: number; belowMin: number; invalid: number }`
  - `writeArchivePage(pool: Pool, p: { season: number; mode: 'softcore'|'hardcore'; pass: number; page: number; upstreamTotal: number; rows: ArchiveRow[]; counts: Omit<PageCounts,'inserted'|'existing'>; done: boolean; rollup: boolean }): Promise<{ inserted: number; existing: number }>`. One transaction: `begin`, `lockMetaRollup`; one `unnest` insert into `characters` (`source 'archive'`, gear columns null/false, `raw` gzip) with `on conflict (season, mode, name) do nothing returning id, name`; for the returned ids only: one `unnest` insert of skills (`dedupeSkills`), `replaceItems` per character, one insert of merc rows; then `addMetaRollupFacts(client, newIds)` when `rollup`; then upsert `archive_import_progress` (`next_page = page + 1`, counters added, `upstream_total`, `done`, `updated_at now()`); `commit`. Rollback and rethrow on error (pattern of `upsertCharacter`).
  - `markRollupNotReady(pool: Pool): Promise<void>` in `write.ts`: `update meta_rollup_status set ready = false` (for `--no-rollup` runs).

- [ ] **Step 1: Write failing tests.** `migrate.test.ts`: `archive_import_progress` exists and a duplicate `(13,'softcore',1)` insert fails. `archive-write.test.ts` (rows built with `mkChar` from `test/helpers/meta-seed.ts` as `compact`; `raw` is `{ character: { name } }`):
  - Writing 3 rows for `season 13` gives 3 `characters` with `source 'archive'`, `gear_value_hr null`, 0 `character_history` rows, `readRaw` round-trips, skills, items and merc stored, and the progress row is `next_page 2, inserted 3, existing 0`.
  - Writing the same page again gives `{ inserted: 0, existing: 3 }`, still 3 characters, `next_page 2`, and the rollup unchanged.
  - Rollup equivalence: seed 2 S14 characters through `upsertCharacter`, write 2 archive pages (5 characters, mixed classes, levels, charms, affixes, skills), snapshot `select * from meta_rollup order by season, mode, class, level, kind, k1, k2, k3, val`, run `rebuildMetaRollup`, and the new snapshot is equal. `metaRollupState` stays `'ok'`.
  - With `rollup: false` no `meta_rollup` row of season 13 exists.
  - A row whose `compact.items[0].mods` makes the insert throw (e.g. `name: null as unknown as string`) rejects the call, leaves no S13 `characters` row and no progress row.
  - An S14 `upsertCharacter` run concurrently with `writeArchivePage` (`Promise.all`) succeeds, and the rollup still equals `rebuildMetaRollup`.
- [ ] **Step 2:** Run `npx vitest run test/archive-write.test.ts test/migrate.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration, `dedupeSkills`, `addMetaRollupFacts`, `writeArchivePage` and `markRollupNotReady`.
- [ ] **Step 4:** Run the tests, `npm test` (`meta-rollup.test.ts`, `characters-repo.test.ts` unchanged and green), `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): archive page writer with batch rollup facts and progress`.

---

### Task 2: pd2.tools client, mapping, resumable import loop, disk gate, CLI

**Files:**
- Create: `server/src/archive/pd2tools.ts`, `server/src/archive/import.ts`, `server/src/scripts/import-archive.ts`, `server/test/fixtures/pd2tools-page.json`
- Test: `server/test/archive-import.test.ts`

**Interfaces:**
- Consumes: Task 1 (`writeArchivePage`, `markRollupNotReady`, `ArchiveRow`), `toCompact`, `InvalidCharacterPayload`, `RateLimiter`, `USER_AGENT`, `loadConfig`.
- Produces:
  - `PD2TOOLS_BASE = 'https://api.pd2.tools/api/v1'`
  - `type HttpGet = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>` (the default wraps global `fetch` with the `User-Agent` header).
  - `type ArchivePage = { total: number; breakdown: Record<string, number>; characters: unknown[] }`
  - `archivePageUrl(season, mode, page, pageSize = 50): string` = `${PD2TOOLS_BASE}/characters?season=13&gameMode=softcore&page=1&pageSize=50` (this param order).
  - `fetchArchivePage(http: HttpGet, limiter: RateLimiter, q: { season; mode; page; pageSize? }): Promise<ArchivePage>`: each attempt goes through `limiter.schedule`. On status 429 or >= 500 or a network error it calls `limiter.reportFailure()` and retries, at most 5 attempts in total (the limiter's backoff spaces them), then throws `ArchiveFetchError`. Any other non-200 status throws at once. On success it calls `reportSuccess`. A body without a numeric `total` or an array `characters` throws `ArchiveFetchError`.
  - `toArchiveCompact(raw: unknown, mode, minLevel): { kind: 'ok'; row: ArchiveRow } | { kind: 'below_min' } | { kind: 'invalid' }`: `toCompact(raw, accountName || undefined)` (an empty `accountName` becomes `undefined`). It overrides `mode` and ignores `isLadder`. `InvalidCharacterPayload` or a non-object gives `invalid`, and level < `minLevel` gives `below_min`.
  - `type ImportOptions = { seasons: number[]; modes: Array<'softcore'|'hardcore'>; pass: number; rollup: boolean; minFreeGb: number; maxDbGb: number; maxPages?: number }`
  - `type ImportDeps = { pool: Pool; http: HttpGet; limiter: RateLimiter; currentSeason: number; minLevel: number; freeDiskBytes: () => number; log: (line: string) => void }`
  - `importArchive(deps, opts): Promise<'done' | 'gate' | 'max-pages'>`: it throws `Error('archive season must be below current season')` before any request when a season >= `currentSeason`, and calls `markRollupNotReady` once when `!opts.rollup`. For each season (in the given order) and mode, it reads the progress row of `(season, mode, pass)` and skips the chunk when `done`. It runs the gate, then loops from `next_page`: fetch, map, `writeArchivePage`. The chunk is `done` when the page returns fewer than 50 characters or `page * 50 >= total`. It logs one line per page: `archive s13 softcore pass1 p12/1155 +48 existing 2 below 0 invalid 0 write 640ms`. The gate runs every 50 pages and returns `'gate'` with a log line naming free GB, DB GB, projected GB and bytes/char.
  - `projectGate(x: { freeBytes: number; dbBytes: number; remainingChars: number; bytesPerChar: number; minFreeGb: number; maxDbGb: number }): { ok: boolean; projectedBytes: number; reason: string | null }` (pure; GB = 1024^3).
  - CLI `import-archive.ts`: `--seasons 13,12,11` (default), `--modes softcore,hardcore` (default), `--pass 1`, `--no-rollup`, `--min-free-gb 4`, `--max-db-gb 12`, `--max-pages N`. `freeDiskBytes` = `statfsSync('/')` `bavail * bsize`. Exit codes: 0 done, 3 gate, 1 error. `npm run build` emits `dist/scripts/import-archive.js`.

- [ ] **Step 1: Create the fixture:** `curl -s "https://api.pd2.tools/api/v1/characters?season=13&gameMode=softcore&page=1&pageSize=50"`, keep `total`, `breakdown` and the first 3 `characters`, and write them to `server/test/fixtures/pd2tools-page.json` (one request; under 300 KB).
- [ ] **Step 2: Write failing tests** (`archive-import.test.ts`, fake `http` serving pages built from the fixture, `RateLimiter` with fake `now`/`sleep`, pause hours `0, 0`):
  - `archivePageUrl(13,'softcore',2)` equals the documented URL with `page=2&pageSize=50`.
  - Mapping: the fixture characters map to `ok` with `mode 'softcore'`. One copy with `status.is_ladder false` and `experience -774482042` maps to `ok`, keeping that experience. One with `mercenary` removed maps to `ok` with `mercDescription null`. One with `accountName ''` maps to `ok` with `account null`. Level 79 maps to `below_min`, `{}` to `invalid`, `null` to `invalid`.
  - Loop: an upstream of 120 characters (total 120, pages of 50/50/20) gives 3 fetches, 120 `characters` rows and progress `done true, next_page 4, received 120`. A second `importArchive` call makes 0 fetches.
  - Resume: the `http` throws a non-retryable 400 on page 2. The call rejects with 50 rows and `next_page 2`. A new call fetches pages 2 and 3 only.
  - Moving set: page 2 repeats the last 2 characters of page 1. The result is `existing 2`, no duplicate rows, `received` 2 higher than the distinct count.
  - Retry: 429, 503, then 200 gives one page and `limiter.requestCount` of 3. Six straight 503s throw `ArchiveFetchError`.
  - Spacing: the recorded `now()` at each request start differ by >= 1000 ms.
  - Guard: `seasons: [14]` with `currentSeason 14` rejects before any fetch.
  - Gate: `projectGate({ freeBytes: 5 GB, dbBytes: 1 GB, remainingChars: 40000, bytesPerChar: 50000, minFreeGb: 4, maxDbGb: 12 })` is `ok: false` (5 - 1.86 < 4). With `freeBytes: 10 GB` it is `ok: true`. With `dbBytes: 11 GB` it is `ok: false` (max DB). `importArchive` with `freeDiskBytes: () => 1 GB` returns `'gate'` after exactly 1 fetch and with 0 rows written. The first page fetch of a chunk supplies `total`, the gate runs on `remainingChars = total - received` before that page is written.
  - `rollup: false` leaves `metaRollupState` `'not-ready'`.
- [ ] **Step 3:** Run `npx vitest run test/archive-import.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement `pd2tools.ts`, `import.ts` and the CLI.
- [ ] **Step 5:** Run the tests, `npm test`, `npx tsc --noEmit`, and `npm run build` (`dist/scripts/import-archive.js` exists). Smoke against the real API on the dev DB (`npx tsx scripts/dev-db.ts` per its header): `DATABASE_URL=<dev> CURRENT_SEASON=14 npx tsx src/scripts/import-archive.ts --seasons 13 --modes hardcore --max-pages 2` inserts about 100 rows and logs 2 page lines. A rerun with `--max-pages 3` starts at page 3. Expected: PASS.
- [ ] **Step 6: Commit** `feat(server): resumable archive importer for api.pd2.tools with disk gate`.

---

### Task 3: Archive seasons in the API (no prices, budget ignored, names)

**Files:**
- Modify: `server/src/config.ts` (`SEASON_NAMES` gets `11: 'Prosperity'`), `server/src/api/filters.ts`, `server/src/api/builds-queries.ts`, `server/src/api/builds-characters.ts`, `server/src/api/character-detail.ts`, `server/src/api/meta/items.ts`, `server/src/api/meta/cohort.ts`, `server/src/api/app.ts`, `src/lib/builds/types.ts` (web `CharacterDetail` type adds `archive: boolean`)
- Test: `server/test/archive-api.test.ts`

**Interfaces:**
- Consumes: Task 1 `writeArchivePage` (seeding), existing price seeding from `prices.test.ts`.
- Produces:
  - `CharacterFilter.archive?: boolean`. `parseFilter` sets `archive: season !== cfg.currentSeason` and `maxGearHr: null` when archive. `metaFilter` keeps `archive`, and `metaCacheKey` needs no change (season is in it).
  - When `f.archive`: `buildsUsage` items and merc items `medianHr null` (skip the `item_prices` join), `topItemsBySlot` `price null, runes null, runeCostHr null, runeCostEstimated false` (no price queries), `metaCohort.pricesComputedAt null` (no `getPrices` call).
  - `characterPreview(pool, season, mode, name, priced = true)`: when not priced, every `medianHr` is null. `characterDetail(pool, season, mode, name, priced = true)`: when not priced, every `prices` value is null. The response adds `archive: !priced`. In `app.ts` both get `season === cfg.currentSeason`.
  - `/builds/seasons` lists S11 as `Prosperity`, S12 as `Suffering` and S13 as `Betrayal`, newest first, `current` only on `CURRENT_SEASON`.

- [ ] **Step 1: Write failing tests** (`archive-api.test.ts`; `CURRENT_SEASON 14`; S14 and S13 each get a Paladin with `Harlequin Crest` and `Spirit`, written through `upsertCharacter` and `writeArchivePage`; softcore prices for both items seeded as in `prices.test.ts`; `rebuildMetaRollup`):
  - `/builds/seasons` returns seasons `[14, 13]` with names `['Alliance' or the live name, 'Betrayal']`, and the `SEASON_NAMES[11]` unit check equals `'Prosperity'`.
  - `/builds/usage?season=13` items have `medianHr null`, while `?season=14` has a number.
  - `/builds/usage?season=13&maxGearHr=0` has the same `total` as without the budget, while `?season=14&maxGearHr=0` drops the priced character.
  - `/builds/characters/<name>?season=13` gear has `medianHr null` everywhere and `gearValueHr null`.
  - `/characters/<name>?season=13` returns 200 with `archive true`, every `prices` value `null`, and `gear.valueHr null`. S14 has `archive false` and a price.
  - `/meta?season=13&classes=Paladin` has `poolSize 1`, `pricesComputedAt null`, every top item `price null`, and `Spirit` with `runeCostHr null`. `JSON.stringify` contains no `NaN`. `/meta?season=14&classes=Paladin` still has prices.
  - The S13 base cohort reads the rollup: `rollupScope(pool, parseFilter({ season: '13' }, cfg))` is non-null.
  - `/builds/history?season=13` returns `{ days: [] }`.
- [ ] **Step 2:** Run `npx vitest run test/archive-api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, `npm test` (all existing API and meta tests unchanged and green), `npx tsc --noEmit`, and root `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): archive seasons serve no prices and ignore the gear budget`.

---

### Task 4: Parity script against api.pd2.tools

**Files:**
- Create: `server/src/archive/parity.ts`, `server/src/scripts/parity-archive.ts`
- Test: `server/test/archive-parity.test.ts`

**Interfaces:**
- Consumes: `fetchArchivePage`-style `HttpGet` + `RateLimiter` (Task 2), `readRaw` (`characters-repo.ts`), `filterCte` (`api/filter-sql.ts`), `parseFilter`.
- Produces:
  - `PD2TOOLS_IGNORED_ITEMS = ['Hellfire Torch', 'Annihilus', 'Call to Arms', 'Lidless Wall', 'Crescent Moon']`. pd2.tools leaves the first four out of `item-usage` (`IGNORED_UNIQUES_ARRAY` in `pd2-tools-fork/api/src/database/postgres/index.ts`), and Crescent Moon was reported excluded too. They are removed from both sides by name and listed as `excluded upstream` in the output.
  - `PARITY_SETS: Array<{ id: string; query: Record<string, string> }>`, all with `season '13'` and `minLevel '80'`:
    1. `all-sc` `{gameMode:'softcore'}`
    2. `all-hc` `{gameMode:'hardcore'}`
    3. `paladin` `{gameMode:'softcore', classes:'Paladin'}`
    4. `blizz` `{gameMode:'softcore', classes:'Sorceress', skills:'[{"name":"Blizzard","minLevel":20}]'}`
    5. `lfury` `{gameMode:'softcore', classes:'Amazon', skills:'[{"name":"Lightning Fury","minLevel":20}]'}`
    6. `ww-hc90` `{gameMode:'hardcore', classes:'Barbarian', minLevel:'90', skills:'[{"name":"Whirlwind","minLevel":20}]'}`
    7. `enigma` `{gameMode:'softcore', items:'Enigma'}`
    8. `def-merc` `{gameMode:'softcore', mercTypes:'Defensive Auras'}`
  - `type UsageRow = { name: string; pct: number }` (0..100). `type Check = { set: string; check: 'breakdown'|'items'|'skills'|'merc-types'|'merc-items'; compared: number; maxDelta: number; failures: string[]; explained: string[]; pass: boolean }`
  - `compareBreakdown(ours: Record<string, number>, theirs: Record<string, number>): Check`-shaped result without `set`: exact per class and `total`, and every mismatch listed as `Paladin 8736 vs 8735`.
  - `compareUsage(ours: UsageRow[], theirs: UsageRow[], o: { tolerance: 1; topN: 25; minPct: 1; exclude: string[] })`: it compares the union of the top `topN` names on each side that have pct >= `minPct` after `exclude`. A name missing on one side counts as pct 0 there. It fails when `|delta| > tolerance`.
  - `explainItems(pool: Pool, cfg: Config, query: Record<string, string>, names: string[]): Promise<Map<string, number>>`: for the failing item names only, it streams the cohort's `raw` (filter via `filterCte(parseFilter(query, cfg))`, batches of 1,000 ids) and counts characters with that name anywhere in `raw.items` the way pd2.tools does (`is_runeword` gives Runeword, else quality `Unique` or `Set`, including inventory non-charms). It returns pct per name. A failure counts as `explained` (difference in counted locations) when this recount is within 1 point of pd2.tools. Its `pass` ignores explained rows.
  - `formatTable(checks: Check[]): string` gives one line per check: `set | check | compared | max delta | failures | PASS/FAIL`, then failure and explained details. CLI `parity-archive.ts`: env `OUR_API` (default `https://api.pd2meta.info/api/v1`), `DATABASE_URL` (for explain), `PD2TOOLS_BASE`. pd2.tools calls go through a `RateLimiter` at 1,000 ms. For each set it fetches `/characters?pageSize=1` (breakdown), `/characters/stats/item-usage`, `skill-usage`, `merc-type-usage` and `merc-item-usage` from both sides. It prints the table plus the importer counters (`archive_import_progress` for season 13) and exits 1 when any check fails.

- [ ] **Step 1: Write failing tests** (`archive-parity.test.ts`):
  - `compareBreakdown({Paladin: 5, total: 5}, {Paladin: 5, total: 5}).pass` is true. A Paladin count of 4 against 5 fails with failure text `Paladin 4 vs 5`.
  - `compareUsage`: a delta of 0.9 passes and 1.1 fails. An excluded `Annihilus` at 90 vs 0 is ignored. A name only in theirs at 3.0 fails (`ours 0`). A name at 0.5 on both sides is not compared (minPct).
  - `explainItems` on a seeded S13 cohort: 2 archive characters, one with `Raven Frost` in an inventory slot of `raw.items` but not in `character_items`, gives `Raven Frost` 50 (pct). A check with ours 0, theirs 50 and explain 50 ends with `pass true` and `explained ['Raven Frost']`.
  - `PARITY_SETS.length >= 7`, and every set has `season '13'`.
  - `formatTable` output contains `PASS` and `FAIL` rows and no em dash.
- [ ] **Step 2:** Run `npx vitest run test/archive-parity.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `parity.ts` and the CLI.
- [ ] **Step 4:** Run the tests, `npm test`, `npx tsc --noEmit`, and `npm run build` (`dist/scripts/parity-archive.js` exists). Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): S13 parity script against api.pd2.tools`.

---

### Task 5: Web: archive seasons without price surfaces

**Files:**
- Modify: `src/lib/builds/scope.ts`, `src/components/builds/BuildsView.tsx`, `src/components/builds/ActiveFilters.tsx`, `src/components/builds/ShoppingList.tsx`, `src/components/builds/CharacterTable.tsx`, `src/components/meta/MetaView.tsx`, `src/components/meta/MetaHeader.tsx`, `src/components/character/CharacterHeader.tsx`, `src/components/character/CharacterView.tsx`, `src/components/character/LevelChart.tsx`
- Test: `src/components/builds/archive.test.tsx`, extend `src/lib/builds/url-state.test.ts` (or a `scope` test next to it)

**Interfaces:**
- Consumes: Task 3 (`CharacterDetail.archive`, null prices for archive), `SeasonsResponse`.
- Produces:
  - `isArchiveSeason(season: number | null, seasons: SeasonsResponse | null): boolean` in `scope.ts`: `true` only when both are known and `season !== seasons.current`. While seasons are loading it is `false`, so nothing flickers on the current season.
  - `BuildsView`: `archive = isArchiveSeason(state.season, seasons)`. When archive it does not render `GearBudget`, passes `archive` to `ActiveFilters` (no budget chip), `ShoppingList` and `CharacterTable`, and calls the API without `maxGearHr` (the server ignores it anyway).
  - `ShoppingList({ items, archive = false })`: when archive it shows no `Σ` sum and no price chip or market link per row, and its subline reads `The 10 items most worn by characters matching your filters. Past seasons have no market prices.`
  - `CharacterTable({ ..., archive = false })`: when archive there is no `Gear HR` header or cell, and a `sort=gear` URL falls back to the level sort for display.
  - `MetaHeader` gets `archive?: boolean`. When true it adds the line `Past season: item prices and rune costs are not available.` in `text-ink-soft`.
  - `CharacterHeader` `HeaderInfo.archive: boolean`. When true there is no Refresh button, and `Archived season` replaces the `updated ... ago` text. `LevelChart({ history, archive })` shows `No level history for archived seasons.` when archive and history has fewer than 2 points.

- [ ] **Step 1: Write failing tests** (`archive.test.tsx`, fetch mocked like `frame.test.tsx`):
  - `isArchiveSeason(13, {current: 14, ...})` is true. `(14, …)`, `(null, …)` and `(13, null)` are false.
  - BuildsView at `/builds?season=13&maxGearHr=5&sort=gear` with seasons `current 14` shows no `Gear budget` slider, no `Budget` chip, no `Gear HR` column header, no `Σ` and no `NaN`. The fetched usage URL has no `maxGearHr`.
  - The same page at `season=14` still shows the slider and the `Gear HR` header.
  - ShoppingList with `archive` renders item names and percentages, no `n/a` chips, and the past-season sentence.
  - CharacterHeader with `archive: true` has no `Refresh` button and shows `Archived season`. LevelChart `archive` with `[]` shows the archive sentence.
  - MetaView with `season=13` (mocked `/meta` with `pricesComputedAt null`) renders the past-season line, and top items show `n/a`.
- [ ] **Step 2:** Run `npx vitest run src/components/builds/archive.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with existing components and tokens only.
- [ ] **Step 4:** Run the test, `npm test` (existing `frame`, `table`, `usage`, `character`, `cards` tests green), `npm run typecheck`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): archive seasons hide gear budget, prices and refresh`.

---

### Task 6: Deploy, import, parity, checks, merge, sprint close (controller runs this task, not a subagent)

**Files:**
- Modify: `deploy/RUNBOOK.md` (new section "Archive import (phase 5)"), `CLAUDE.md` (status line), `plan/roadmap.md` (Sprint 4.4 entry, Next), `docs/superpowers/specs/2026-10-28-pd2meta-v2-design.md` (section 8: every phase marked done with date, status line `implemented`)

**Interfaces:**
- Consumes: everything above.
- Produces: S11 to S13 in production, a parity table, and `main` with the sprint closed.

- [ ] **Step 1: Backup and deploy.** On the VPS run `pg_dump` per the RUNBOOK into `/opt/_backups/pd2meta-<date>.dump`. Deploy the server per the RUNBOOK (`git archive HEAD server deploy`, put, extract, `docker compose up -d --build`); migration 006 runs on start. Check `curl -s https://api.pd2meta.info/api/v1/health` and that `/builds/seasons` still lists S14. Record `df -h /` and `select pg_size_pretty(pg_database_size('pd2meta'))`.
- [ ] **Step 2: Start the importer, backgrounded:** `cd /opt/pd2meta/deploy && docker compose -p pd2meta run -d --name pd2meta-archive api node dist/scripts/import-archive.js --seasons 13 --modes softcore,hardcore`. Watch it through a Monitor until-loop on `docker logs --tail 3 pd2meta-archive` and `docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' pd2meta-archive` (no foreground sleeps, no subagent waits). Also watch the collector (`docker compose -p pd2meta logs --since 10m collector | grep -c "ingest"` stays non-zero, and no `statement timeout` lines) and the page `write` ms. If the write p95 goes above 5,000 ms, stop the container and switch to `--no-rollup` for the rest. In that case, after the import, follow the RUNBOOK "Meta rollup" steps (pause the collector, `backfill-meta`, resume, restart the api), and expect the rebuild to take several minutes at about 225k characters. On a crash, `docker rm pd2meta-archive` and rerun the same command; it resumes. On exit 3 (gate), stop and report the logged numbers to the owner.
- [ ] **Step 3: S13 gap pass, then S12 and S11:** run the same command with `--seasons 13 --pass 2` (it should log mostly `existing`; record how many it inserts), then `--seasons 12,11`. After the import: `docker compose -p pd2meta exec -T db psql -U pd2meta -d pd2meta -c "vacuum analyze characters, character_items, character_skills, character_merc, meta_rollup"`, `select season, mode, count(*) from characters group by 1,2 order by 1,2`, `select * from archive_import_progress order by 1,2,3`, the DB size and `df -h /`. Then `docker compose -p pd2meta restart api` to drop cached seasons. Write the measured numbers (bytes/char, runtime, sizes, duplicates) into the RUNBOOK section.
- [ ] **Step 4: API checks:** `/builds/seasons` lists 14 Alliance, 13 Betrayal, 12 Suffering and 11 Prosperity with counts. A cold `curl -w '%{time_total}' '.../meta?season=13&gameMode=softcore&classes=Paladin'` takes under 1 s with `pricesComputedAt null`. `/builds/usage?season=12` items have `medianHr null`. `/stats` heartbeat is fresh, `requestsLastHour <= 3600`, and S14 counts are still growing. Run `docker compose -p pd2meta exec -T api node dist/scripts/meta-bench.js`, which exits 0 (the current season is unaffected).
- [ ] **Step 5: Parity:** `docker compose -p pd2meta run --rm api node dist/scripts/parity-archive.js`. Every check must PASS, with explained item rows allowed. A breakdown mismatch is acceptable only when pd2.tools' total moved during the run: rerun once after another `--pass 3` gap pass. If it still fails, stop and report the table before merging. Paste the table into the RUNBOOK section.
- [ ] **Step 6: Headless web check.** Run `npm run dev` on `http://localhost:3000` against the live API, with Playwright headless only (`tools/shopify-session` pattern, never a visible browser). On `/builds`, the season select shows `Prosperity (S11)`, `Suffering (S12)` and `Betrayal (S13)`. Switching to S13 loads class share, usage cards and a character table, with no gear budget, no Gear HR column and no shopping-list sum. A row preview opens, the `Full character` page renders the equipment grid with `Archived season`, no Refresh and no prices, and the account link lists S13 characters. On the Meta tab with S13 Sorceress plus Blizzard, results come without a click, with the past-season line and prices `n/a`. Switching back to S14 restores prices and the budget slider. Hardcore S12 works. Screenshot Builds S13 into the session scratchpad and check it against the look rules.
- [ ] **Step 7: Merge** `sprint/4.4-archive` into `main` (Vercel auto-deploys). Repeat the S13 Builds and Meta part of Step 6 on `https://www.pd2meta.info/`.
- [ ] **Step 8: Sprint close** on `main`. In `CLAUDE.md`, the status line says all v2 phases are done and live (Sprint 4.4 archive S11 to S13 imported, parity passed). In `plan/roadmap.md`, add the Sprint 4.4 entry (DONE, date, plan path) and replace `Next` with the future ideas pointer. In the spec, mark section 8 phases 1 to 5 done with dates. Commit `docs: sprint 4.4 close` and run `git diff --stat` first. Do not push unless the owner says so.

---

## Rulings made in this plan (owner can overturn)

- The rollup is maintained per imported page by one batch statement (`addMetaRollupFacts`) inside the page transaction. There is no `backfill-meta` and no collector pause. `--no-rollup` + `backfill-meta` is the fallback if page writes get slow.
- The importer runs as its own `docker compose run` container from the api image, not inside the running api process, so its memory and crashes never touch the API.
- Pages are 50 characters at 1 request per second, in order S13, S12, S11, with an S13 gap pass (`--pass 2`) because pd2.tools is still adding S13 rows.
- Archive characters are immutable: `on conflict do nothing`, no history rows, no gear value, `is_ladder` ignored, the requested gameMode wins, level 80+ only.
- Raw stays for every archive character (about 10 KB gzip of about 40 to 50 KB per character). The disk gate (keep 4 GB free, DB at most 12 GB, projected at 50 KB/char until measured) stops the run instead of dropping raw. The owner decides what to cut, and S11 is the natural cut.
- Archive seasons show no prices anywhere and ignore the gear budget. The web hides the budget slider, budget chip, Gear HR column, shopping-list sum and character Refresh, and Meta shows a one-line past-season note.
- Season 11 is named `Prosperity` (wiki.projectdiablo2.com/wiki/Seasons).
- Parity compares the top 25 names with pct >= 1 per side and a 1 point tolerance, after removing pd2.tools' excluded items (Torch, Anni, CTA, Lidless, Crescent Moon) from both sides. Item gaps that come from pd2.tools counting non-charm inventory items count as explained, but only when a recount from our stored raw matches pd2.tools. The class breakdown must be exact.
- Cache warm-up stays on the current season. The first archive `/meta` reads the rollup, because import keeps it complete.
