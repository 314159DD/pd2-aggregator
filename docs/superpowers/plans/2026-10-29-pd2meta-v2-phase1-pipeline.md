# pd2meta v2, Phase 1 + 1b: data pipeline and stopgap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Our own collector ingests Season 14 ladder characters (80+) and market listings from `api.projectdiablo2.com` into Postgres, a read API serves pd2.tools-compatible endpoints at `https://api.pd2meta.info/api/v1`, and today's pd2meta.info reads from it so it shows S14 again.

**Architecture:** One Node/TypeScript package `server/` in this repo with two entrypoints: `collector` (single process, one global rate limiter shared by character discovery, character ingest and market polling) and `api` (Express). Both talk to one Postgres 17. Deployed on the VPS 76.13.140.109 as a compose project in `/opt/pd2meta`, HTTPS through the host nginx. The existing Next app at the repo root only changes its API base URL.

**Tech Stack:** Node 22, TypeScript 5, Express 4, `pg` 8, `lru-cache` 11, `@2toad/profanity` 3, vitest 4, Postgres 17 (Docker on VPS; native `C:\pg17` port 55432 for local tests, no Docker locally), nginx + certbot on the host.

**Spec:** `docs/superpowers/specs/2026-10-28-pd2meta-v2-design.md` (sections 3, 5, 8 phase 1 and 1b). Later phases get their own plans.

## Global Constraints

- Every request to `api.projectdiablo2.com` goes through one `RateLimiter`: at least `PD2_MIN_INTERVAL_MS` (default `1000`) between request starts, process-wide.
- Peak pause: no upstream requests while local time in `America/Los_Angeles` is in [12:00, 14:00). Use the IANA zone (DST-safe), never a fixed offset. Window from env `PD2_PAUSE_START_HOUR=12`, `PD2_PAUSE_END_HOUR=14`.
- Kill switch: env `COLLECTOR_ENABLED=false` makes the collector idle (heartbeat continues) without a redeploy beyond a container restart; also honour row `collector_control.paused = true` in the DB, checked every loop.
- `User-Agent: pd2meta.info/2.0 (+https://www.pd2meta.info)` on every upstream request.
- Ingest only `status.is_ladder === true` and `level >= 80`.
- No raw JSON history. `characters.raw` holds only the latest payload, gzip-compressed (`bytea`). History = `(character_id, ts, level, experience)` rows.
- Season is config: `CURRENT_SEASON=14`. No auto-increment.
- Vendored pd2-tools files keep their MIT header; `server/src/core/vendor/LICENSE-pd2-tools.txt` holds the full pd2-tools MIT license (copy from `../pd2-tools-fork/LICENSE`).
- No em dashes in any user-facing text or docs written by this plan.
- Response shapes of pd2.tools-compatible endpoints must match pd2.tools exactly (field names, nesting, `pct` 0 to 100).
- Branch: `sprint/4.1-pipeline` off `spec/pd2meta-v2`. Commit per task. Do not push to `main`.

## Review Focus

1. Upstream returns non-JSON, HTML, 429 or 5xx: the client throws a typed `UpstreamError`, the limiter backs off (`2^n * 5 s`, cap 5 min), the item is requeued once, the process never crashes. Test in Task 4.
2. Character endpoint returns `{}` / no `character` / 404 (renamed or deleted character): skip with a debug log, no DB write. Test in Task 5.
3. Malformed `skills` query param (`skills=abc`, `skills=[{}]`) is ignored like pd2.tools, never a 500; `pageSize` above 50 clamps to 50; `page` beyond the last returns `characters: []` with the real `total`. Tests in Task 7.
4. Peak window across the DST switch (2026-11-01 in America/Los_Angeles): `isInPauseWindow(new Date('2026-11-01T20:30:00Z'))` is true (12:30 PST). Test in Task 4.
5. Market price text that does not parse (`"0.75 ( runes keys pes pde)"`, `"offer"`) is stored with `price_hr = null` and the raw text kept. Test in Task 6.

---

## File structure

```
server/
  package.json, tsconfig.json, vitest.config.ts, Dockerfile, .env.example
  src/
    config.ts                      env parsing, one Config object
    core/vendor/                   pd2-tools MIT files, unchanged except import paths
      LICENSE-pd2-tools.txt
      types/{character,item,mercenary,skills,index}.ts
      skill-calculator.ts
      active-item.ts
    core/compact.ts                raw character JSON -> CompactCharacter
    core/price.ts                  free-text price -> HR number | null
    db/pool.ts                     pg Pool factory
    db/migrate.ts                  runs db/migrations/*.sql once each
    db/migrations/001_init.sql
    db/characters-repo.ts          upsert + reads used by collector
    db/market-repo.ts
    db/status-repo.ts              heartbeat, control flag, accounts_seen, priority queue
    upstream/rate-limiter.ts
    upstream/pd2-client.ts
    collector/queue.ts
    collector/discovery.ts
    collector/ingest.ts
    collector/market-poller.ts
    collector/main.ts
    api/filters.ts                 query -> CharacterFilter
    api/filter-sql.ts              CharacterFilter -> SQL CTE + params
    api/queries.ts                 stats/list SQL
    api/app.ts                     createApp(deps) -> express.Express
    api/main.ts
  test/
    fixtures/                      real upstream payloads (Task 2)
    helpers/db.ts                  fresh schema per test file
deploy/
  docker-compose.yml
  nginx-api.pd2meta.info.conf
  RUNBOOK.md
```

Local test database: there is no local Postgres and no Docker on the dev machine. Tests start a real Postgres 17 through the npm package `embedded-postgres` (dev dependency, pin a 17.x version) in a vitest `globalSetup` (`server/test/global-setup.ts`): data dir `server/.pgtest` (gitignored), port 55433, user `postgres` / password `postgres`, creates database `pd2meta_test`, sets `process.env.TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/pd2meta_test`, stops it in teardown. The live smoke run in Task 5 uses the same instance started by a tiny script `server/scripts/dev-db.ts`.

---

### Task 1: Server package, config, schema and test DB harness

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/test/global-setup.ts`, `server/scripts/dev-db.ts`, `server/.env.example`, `server/src/config.ts`, `server/src/db/pool.ts`, `server/src/db/migrate.ts`, `server/src/db/migrations/001_init.sql`, `server/test/helpers/db.ts`
- Test: `server/test/migrate.test.ts`, `server/test/config.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): Config` with `Config = { databaseUrl: string; currentSeason: number; pd2MinIntervalMs: number; pauseStartHour: number; pauseEndHour: number; collectorEnabled: boolean; apiPort: number; corsOrigins: string[]; minLevel: number }` (defaults: season 14, interval 1000, 12, 14, true, 8080, `["https://www.pd2meta.info","https://pd2meta.info","http://localhost:3000"]`, 80).
  - `createPool(url: string): pg.Pool`
  - `migrate(pool: pg.Pool): Promise<string[]>` returns applied file names; idempotent via table `schema_migrations(name text primary key, applied_at timestamptz)`.
  - `freshDb(): Promise<pg.Pool>` in test helper: drops and recreates schema `public` in `TEST_DATABASE_URL`, runs `migrate`.

Schema `001_init.sql` (exact columns; indexes as listed):

```sql
create table characters (
  id bigserial primary key,
  season int not null,
  mode text not null check (mode in ('softcore','hardcore')),
  name text not null,
  account text,
  class text not null,
  level int not null,
  experience bigint not null,
  life int, mana int,
  attributes jsonb not null default '{}',
  guild text,
  is_dead boolean not null default false,
  source text not null default 'live' check (source in ('live','archive')),
  raw bytea not null,
  first_seen_at timestamptz not null default now(),
  last_ingested_at timestamptz not null,
  unique (season, mode, name)
);
create index on characters (season, mode, class, level);
create index on characters (lower(account));
create index on characters (lower(name));
create table character_skills (
  character_id bigint not null references characters(id) on delete cascade,
  skill text not null, hard_level int not null, real_level int,
  primary key (character_id, skill)
);
create index on character_skills (skill, hard_level);
create table character_items (
  id bigserial primary key,
  character_id bigint not null references characters(id) on delete cascade,
  owner text not null check (owner in ('player','merc')),
  slot text, is_switch boolean not null default false, is_charm boolean not null default false,
  name text not null, quality text not null, base_name text, base_type text,
  is_runeword boolean not null default false, mods jsonb not null default '[]'
);
create index on character_items (character_id);
create index on character_items (owner, name);
create table character_merc (character_id bigint primary key references characters(id) on delete cascade, description text not null);
create table character_history (character_id bigint not null references characters(id) on delete cascade, ts timestamptz not null, level int not null, experience bigint not null, primary key (character_id, ts));
create table accounts_seen (account text primary key, last_checked_at timestamptz not null);
create table priority_accounts (account text primary key, requested_at timestamptz not null default now(), requested_ip text);
create table market_listings (
  id text primary key, item_name text, quality text, base_name text, runeword_key text,
  is_corrupted boolean not null default false, is_ladder boolean not null, is_hardcore boolean not null,
  price_text text, price_hr numeric(10,3), created_at timestamptz, bumped_at timestamptz,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), gone_at timestamptz
);
create index on market_listings (item_name, is_ladder, is_hardcore) where gone_at is null;
create table collector_status (id int primary key default 1 check (id = 1), heartbeat_at timestamptz, stats jsonb not null default '{}');
create table collector_control (id int primary key default 1 check (id = 1), paused boolean not null default false);
insert into collector_status (id) values (1);
insert into collector_control (id) values (1);
```

- [ ] **Step 1:** Create `server/package.json` (name `pd2meta-server`, `"type": "commonjs"`, scripts `build: tsc`, `test: vitest run`, `typecheck: tsc --noEmit`, `collector: node dist/collector/main.js`, `api: node dist/api/main.js`), deps `express@4 pg@8 lru-cache@11 @2toad/profanity@3 cors@2 compression@1`, dev deps `typescript@5 vitest@4 @types/express@4 @types/pg @types/node@22 @types/cors @types/compression supertest @types/supertest tsx`. `tsconfig.json`: `target ES2022`, `module commonjs`, `outDir dist`, `rootDir src`, `strict true`, `esModuleInterop true`, `resolveJsonModule true`. `vitest.config.ts`: `test.fileParallelism: false` (shared test DB), `test.globalSetup: ['test/global-setup.ts']`, `testTimeout: 30000`. Add `embedded-postgres` to dev deps and `.pgtest/` to `.gitignore`. Run `npm install` in `server/`.
- [ ] **Step 2: Write failing tests.** `config.test.ts`: `loadConfig({DATABASE_URL:'postgres://x'})` returns `currentSeason 14`, `pd2MinIntervalMs 1000`, `collectorEnabled true`; `loadConfig({DATABASE_URL:'x', COLLECTOR_ENABLED:'false'}).collectorEnabled === false`; missing `DATABASE_URL` throws `/DATABASE_URL/`. `migrate.test.ts`: on `freshDb()`, `migrate` a second time returns `[]`; `select count(*) from collector_control` is 1.
- [ ] **Step 3:** Run `npx vitest run test/config.test.ts test/migrate.test.ts` in `server/`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement `config.ts`, `pool.ts`, `migrate.ts` (reads `src/db/migrations/*.sql` sorted, each in a transaction), `001_init.sql`, `test/helpers/db.ts`. Add `server/.env.example` listing every Config env var with defaults.
- [ ] **Step 5:** Run the same command. Expected: PASS. Also `npx tsc --noEmit`: no errors.
- [ ] **Step 6: Commit** `feat(server): package, config, schema, test DB harness`.

---

### Task 2: Vendored pd2-tools core, fixtures, compact transform

**Files:**
- Create: `server/src/core/vendor/**` (copied), `server/src/core/compact.ts`, `server/test/fixtures/*.json`
- Test: `server/test/compact.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `calculateTotalSkills(c: CharacterResponse): Array<{skill: string; level: number; baseLevel: number | undefined}>` (vendored, unchanged).
  - `type CompactItem = { owner: 'player'|'merc'; slot: string|null; isSwitch: boolean; isCharm: boolean; name: string; quality: string; baseName: string|null; baseType: string|null; isRuneword: boolean; mods: Array<{name: string; label: string; value: number|null}> }`.
  - `type CompactCharacter = { name: string; mode: 'softcore'|'hardcore'; account: string|null; className: string; level: number; experience: number; life: number|null; mana: number|null; attributes: Record<string, number>; guild: string|null; isDead: boolean; isLadder: boolean; skills: Array<{skill: string; hardLevel: number; realLevel: number|null}>; items: CompactItem[]; mercDescription: string|null }`
  - `toCompact(raw: CharacterApiResponse, accountHint?: string): CompactCharacter`
  - `enrichRaw(raw, accountName): object` returns `{...raw, accountName, realSkills, lastUpdated: Date.now()}` (the shape pd2.tools stored in `full_response_json`, which pd2meta reads).

- [ ] **Step 1:** Copy from `../pd2-tools-fork` at `upstream/main` (`git -C ../pd2-tools-fork show upstream/main:<path>`): `api/src/utils/skill-calculator.ts`, `api/src/utils/active-item.ts`, `api/src/types/{character,item,mercenary,skills,index}.ts` (plus any type file `index.ts` re-exports; drop re-exports of unrelated types if they pull in more files). Add `// Vendored from coleestrin/pd2-tools (MIT), upstream/main 7952f34.` as line 1 of each. Copy `LICENSE` to `LICENSE-pd2-tools.txt`. Fix import paths only. `npx tsc --noEmit` must pass.
- [ ] **Step 2: Fixtures.** Save real payloads with a 1 s pause between calls (UA from Global Constraints): `game/ladder` -> `ladder.json`; `game/online` -> `online.json`; `game/account/<first account in online.json whose details contain a ladder char >= 80>` -> `account.json`; that char's `game/character/<name>` -> `character-ladder.json`; one non-ladder char -> `character-nonladder.json`; `market/listing?$limit=50&$sort[bumped_at]=-1` -> `listings.json` (use `curl -g`). Write a small `server/scripts/capture-fixtures.ts` to do this so it can be rerun.
- [ ] **Step 3: Write failing tests** in `compact.test.ts` using `character-ladder.json`: `toCompact(fx).isLadder === true`; `mode` matches `fx.character.status.is_hardcore`; `skills.find(s=>s.hardLevel>=20)` exists and every skill has `realLevel` from `calculateTotalSkills`; every `items[]` with `owner==='player'` either has `slot` set (from `location.equipment`) and `location.zone === 'Equipped'`, or `isCharm === true` (charms: `base.type` in `Small Charm|Medium Charm|Large Charm` and `location.storage === 'Inventory'`); items with `location.equipment` containing `Switch` have `isSwitch === true`; stash/cube items are absent; `mods[i].value === modifiers[i].values?.[0] ?? null`; `mercDescription === fx.mercenary.description`; merc items have `owner === 'merc'`; an item with no `name` uses `base.name` as `name`.
- [ ] **Step 4:** Run `npx vitest run test/compact.test.ts`. Expected: FAIL.
- [ ] **Step 5:** Implement `compact.ts`. `name` for runewords is the item's `name` (pd2.tools semantics), `quality` from `quality.name`, `isRuneword` from `is_runeword`.
- [ ] **Step 6:** Run. Expected: PASS.
- [ ] **Step 7: Commit** `feat(server): vendor pd2-tools skill calculator, compact transform, fixtures`.

---

### Task 3: Characters repository

**Files:**
- Create: `server/src/db/characters-repo.ts`
- Test: `server/test/characters-repo.test.ts`

**Interfaces:**
- Consumes: `CompactCharacter`, `enrichRaw` (Task 2), `freshDb` (Task 1).
- Produces:
  - `upsertCharacter(pool, season: number, c: CompactCharacter, enrichedRaw: object, now = new Date()): Promise<{id: number; historyWritten: boolean}>` One transaction: upsert `characters` on `(season, mode, name)` (raw = `gzipSync(JSON.stringify(enrichedRaw))`), delete + reinsert skills, items, merc. Write a `character_history` row when the character is new, or experience changed, or the last history row is older than 24 h.
  - `getLastIngest(pool, season, names: string[]): Promise<Map<string, {lastIngestedAt: Date; experience: number}>>` (keyed by lowercased name).
  - `readRaw(row: {raw: Buffer}): unknown` (gunzip + parse).

- [ ] **Step 1: Write failing tests:** upsert fixture twice with same experience 1 h apart: one `characters` row, items count equals `toCompact(fx).items.length`, `historyWritten` true then false; third upsert with experience +1: `historyWritten` true, 2 history rows; `readRaw` round-trips `accountName` and `realSkills`; `getLastIngest(pool,14,['MC-MEEKS'.toLowerCase()...])` keys are lowercase.
- [ ] **Step 2:** Run `npx vitest run test/characters-repo.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Batch-insert items with one multi-row `insert ... select * from unnest(...)` or a single parameterised multi-values statement (no per-item round trips).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): characters repository with compact storage and history`.

---

### Task 4: Rate limiter and PD2 client

**Files:**
- Create: `server/src/upstream/rate-limiter.ts`, `server/src/upstream/pd2-client.ts`
- Test: `server/test/rate-limiter.test.ts`, `server/test/pd2-client.test.ts`

**Interfaces:**
- Produces:
  - `isInPauseWindow(d: Date, startHour = 12, endHour = 14, tz = 'America/Los_Angeles'): boolean` (use `Intl.DateTimeFormat(..., {timeZone, hour: 'numeric', hourCycle: 'h23'})`).
  - `class RateLimiter { constructor(opts: {minIntervalMs: number; pauseStartHour: number; pauseEndHour: number; now?: () => number; sleep?: (ms: number) => Promise<void>}); schedule<T>(fn: () => Promise<T>): Promise<T>; reportFailure(): void; reportSuccess(): void; get requestCount(): number }` Serialises all calls; waits `minIntervalMs` between starts plus current backoff (`min(2^failures * 5000, 300000)`, reset on success); while in pause window sleeps in 60 s steps.
  - `class UpstreamError extends Error { status: number | null; retryable: boolean }`
  - `class Pd2Client { constructor(limiter: RateLimiter, fetchImpl = fetch, base = 'https://api.projectdiablo2.com'); online(): Promise<string[]>; account(name: string): Promise<{characters: string[]; details: Array<{name: string; level: number; ladder: boolean; hardcore: boolean; class_name: string}>}>; character(name: string): Promise<CharacterApiResponse | null>; ladder(): Promise<LadderResponse>; season(): Promise<{name: string; start: string}>; listings(q: {limit: number; skip: number; sortBumpedDesc: boolean}): Promise<{total: number; data: RawListing[]}> }` `character()` returns `null` on 404 or a body without `character`. Names are `encodeURIComponent`-ed. Non-2xx other than 404, or non-JSON body, throws `UpstreamError` and calls `limiter.reportFailure()`.
  - `LadderResponse = { updated_at: number; softcore: Record<string, LadderEntry[]>; hardcore: Record<string, LadderEntry[]> }`, `LadderEntry = { name: string; rank: number; class: string; level: number; experience: number; dead: boolean }`. `RawListing` = fields named in spec 3 (`_id, item, price, is_ladder, is_hardcore, created_at, bumped_at`).

- [ ] **Step 1: Write failing tests** (fake clock + fake sleep): three `schedule` calls record start times `>= 1000 ms` apart; after two `reportFailure()` the next gap is `>= 1000 + 20000`; `isInPauseWindow(new Date('2026-10-28T19:30:00Z'))` true (12:30 PDT), `('2026-10-28T22:00:00Z')` false (15:00 PDT), `('2026-11-01T20:30:00Z')` true (12:30 PST). Client with fake fetch: 404 -> `character()` resolves `null`; 503 -> rejects `UpstreamError` with `retryable true`; `text/html` 200 body -> rejects `UpstreamError`; `character('a b')` requested URL ends `/game/character/a%20b`; every request has the UA header.
- [ ] **Step 2:** Run `npx vitest run test/rate-limiter.test.ts test/pd2-client.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): global rate limiter with peak pause and PD2 client`.

---

### Task 5: Collector (queue, discovery, ingest, heartbeat, main)

**Files:**
- Create: `server/src/collector/queue.ts`, `discovery.ts`, `ingest.ts`, `main.ts`, `server/src/db/status-repo.ts`
- Test: `server/test/collector.test.ts`

**Interfaces:**
- Consumes: `Pd2Client` (Task 4), `upsertCharacter`, `getLastIngest` (Task 3), `toCompact`, `enrichRaw` (Task 2).
- Produces:
  - `class CharQueue { push(item: {name: string; account?: string; priority: 0|1|2}): boolean; shift(): QueueItem | undefined; get size(): number }` Priority 0 (priority accounts) before 1 (ladder) before 2 (online); dedupe by lowercased name while queued.
  - `planFromAccount(details, lastIngest: Map, now: Date, cfg): string[]` returns names with `ladder && level >= cfg.minLevel && (no ingest || lastIngestedAt < now - 20h)`.
  - `planFromLadder(ladder: LadderResponse, lastIngest: Map, now: Date): string[]` returns names whose ladder `experience` differs from stored `experience` and whose `lastIngestedAt < now - 6h`, plus names never ingested.
  - `ingestOne(deps, item): Promise<'ingested'|'skipped'|'failed'>` fetch, skip non-ladder or `< minLevel` or `null`, upsert. On `UpstreamError` with `retryable`, requeue once (track `attempts`).
  - status-repo: `heartbeat(pool, stats: CollectorStats)`, `isPaused(pool): Promise<boolean>`, `accountsDue(pool, accounts: string[], now, cooldownMs = 86400000): Promise<string[]>`, `markAccountChecked(pool, account, now)`, `takePriorityAccounts(pool): Promise<string[]>` (delete returning), `addPriorityAccount(pool, account, ip)`.
  - `CollectorStats = { requestsTotal: number; requestsLastHour: number; queueSize: number; ingestedLastHour: number; lastIngestAt: string|null; lastOnlineSweepAt: string|null; lastLadderPassAt: string|null; lastMarketPollAt: string|null; lastFullMarketSweepAt: string|null; errorsLastHour: number; seasonName: string|null }`
- `main.ts` loop schedule: priority accounts every 60 s; ladder every 60 min; online sweep every 30 min (accounts due via `accountsDue`, each `account()` call then `planFromAccount`, profanity filter on names like pd2.tools); consumer runs continuously; heartbeat every 60 s; `season()` daily (store name in stats; if it differs from the first seen name, log `SEASON CHANGED` at error level). When `!collectorEnabled || isPaused()`: skip all upstream work, keep heartbeat.

- [ ] **Step 1: Write failing tests:** queue ordering and dedupe; `planFromAccount` with a fixture account's `details` filters non-ladder and `< 80` and fresh (< 20 h) names; `planFromLadder` picks changed-experience names older than 6 h and skips unchanged; `ingestOne` with fake client returning `character-nonladder.json` -> `'skipped'` and no row; returning `null` -> `'skipped'`; throwing retryable `UpstreamError` twice -> first call requeues, second returns `'failed'`; returning `character-ladder.json` -> `'ingested'` and a row exists; `accountsDue` excludes an account checked 1 h ago.
- [ ] **Step 2:** Run `npx vitest run test/collector.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `main.ts` wires config, pool, `migrate`, limiter, client, loops; SIGTERM stops loops and ends the pool.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Smoke run (live, short).** Start `npx tsx scripts/dev-db.ts` in the background (prints its URL), then: `DATABASE_URL=<that url> PD2_MIN_INTERVAL_MS=1000 npx tsx src/collector/main.ts` for 3 minutes, then `select count(*) from characters` > 0 (unless in the pause window; then set `PD2_PAUSE_START_HOUR=0 PD2_PAUSE_END_HOUR=0` for the smoke run only) and `collector_status.stats->>'requestsTotal'` <= 190.
- [ ] **Step 6: Commit** `feat(server): collector with ladder/online discovery, ingest, heartbeat`.

---

### Task 6: Market poller

**Files:**
- Create: `server/src/core/price.ts`, `server/src/db/market-repo.ts`, `server/src/collector/market-poller.ts`; wire into `collector/main.ts`
- Test: `server/test/price.test.ts`, `server/test/market.test.ts`

**Interfaces:**
- Consumes: `Pd2Client.listings` (Task 4), heartbeat stats (Task 5).
- Produces:
  - `parsePriceHr(text: string): number | null` Port the accepted grammar from `src/lib/price/parse.ts` in the web app (read it; keep its tests' cases): plain numbers, leading dot, comma decimal, optional `hr`; everything else `null`.
  - `toListingRow(l: RawListing): MarketListingRow` (`item_name` = `item.name` or `item.base.name`; `runeword_key` = `item.runeword?.key ?? null`; `is_corrupted` = `item.corrupted === true`).
  - `upsertListings(pool, rows, now)` sets `last_seen_at = now`, clears `gone_at`.
  - `markGone(pool, sweepStartedAt: Date)` sets `gone_at = now()` where `gone_at is null and last_seen_at < sweepStartedAt`.
  - Poller: incremental page (`limit 250, skip 0, bumped desc`) every 75 s; full sweep (pages of 250 until `skip >= total`) every 6 h, then `markGone(sweepStart)`. All through the shared limiter.

- [ ] **Step 1: Write failing tests:** `parsePriceHr('3')===3`, `('.5')===0.5`, `('2,75')===2.75`, `('1.5 hr')===1.5`, `('3 wss')===null`, `('0.75 ( runes keys pes pde)')===null`, `('offer')===null`; `toListingRow` on each `listings.json` entry keeps `price_text`; `markGone` after a sweep that did not see listing X sets X `gone_at`, a later upsert of X clears it.
- [ ] **Step 2:** Run `npx vitest run test/price.test.ts test/market.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire into `main.ts` (stats `lastMarketPollAt`, `lastFullMarketSweepAt`).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): market listing poller with gone detection`.

---

### Task 7: Read API (pd2.tools-compatible)

**Files:**
- Create: `server/src/api/filters.ts`, `filter-sql.ts`, `queries.ts`, `app.ts`, `main.ts`
- Test: `server/test/api.test.ts` (supertest against `createApp` on a seeded `freshDb`)

**Interfaces:**
- Consumes: schema (Task 1), `readRaw` (Task 3), status-repo (Task 5).
- Produces:
  - `type CharacterFilter = { season: number; mode: 'softcore'|'hardcore'; minLevel: number; maxLevel: number; classes: string[]; items: string[]; skills: Array<{name: string; minLevel: number}>; mercTypes: string[]; mercItems: string[] }`
  - `parseFilter(q: Record<string, unknown>, cfg: Config): CharacterFilter` Params: `season` (default current), `gameMode` (default `softcore`), `minLevel` (default 80, clamp 1..99), `maxLevel` (default 99), `classes`, `items`, `mercTypes`, `mercItems` (comma lists), `skills` (JSON `[{name,minLevel}]`; anything invalid -> `[]`).
  - `filterCte(f): {sql: string; params: unknown[]}` producing `with filtered as materialized (select c.id from characters c where ...)`. Semantics: classes OR (`class = any`), items AND (one `exists` per item on `character_items` `owner='player'`), skills AND (`exists ... hard_level >= minLevel`), mercTypes OR, mercItems AND (`owner='merc'`), season, mode, level range.
  - `createApp(deps: {pool: pg.Pool; cfg: Config}): express.Express` Routes under `/api/v1`:
    - `GET /characters` -> `{total, characters, breakdown}`; `characters` = `readRaw(raw)` of the page, order `level desc, id desc`; `page` default 1, `pageSize` default 50, max 50; `breakdown` has all 7 classes zero-filled plus `total`.
    - `GET /characters/stats/item-usage` -> `[{item, itemType, numOccurrences, totalSample, pct}]`, distinct characters per item among `filtered`, `owner='player'`, `itemType` `Runeword` if `is_runeword` else `quality` when `Unique|Set`, others dropped, sorted by count desc. No exclusion list (spec 4.1).
    - `GET /characters/stats/skill-usage` -> `[{name, numOccurrences, totalSample, pct}]`, `hard_level >= 20`.
    - `GET /characters/stats/merc-type-usage` -> `[{mercType, numOccurrences, totalSample, pct}]`.
    - `GET /characters/stats/merc-item-usage` -> item-usage shape with `owner='merc'`.
    - `GET /characters/stats/level-distribution` -> `{hardcore: [{level, count}], softcore: [...]}` (ignores `gameMode`, honours other filters).
    - `GET /characters/accounts/:account` -> `{characters: raw[], total}` for the season, case-insensitive, level desc; unknown -> `{characters: [], total: 0}`.
    - `POST /accounts/queue` body `{accountName}` validated `^[a-zA-Z0-9_-]{1,50}$`, 5 per hour per IP (in-memory), calls `addPriorityAccount`.
    - `GET /health` -> `{status: 'ok'}` when DB responds; `GET /stats` -> `{season, characters: {softcore: n, hardcore: n}, collector: collector_status.stats, heartbeatAt}`.
  - Responses of GET stats routes cached in an `LRUCache` (max 500 entries, ttl 15 min) keyed by path + sorted query. CORS from `cfg.corsOrigins`. `compression()` on.
  - `pct` = `round(numOccurrences / totalSample * 100, 2)`; `totalSample` = filtered pool size.

- [ ] **Step 1: Write failing tests.** Seed: upsert `character-ladder.json` plus 2 synthetic variants (copy, rename, change class / items / merc) through `upsertCharacter`. Assert: `/characters` total 3, `breakdown` has 7 class keys + `total`; `?classes=<fixture class>` narrows; `?skills=abc` same total as no skills; `?pageSize=500` returns `<= 50`; `?page=99` gives `characters: []` and `total 3`; each returned character has `accountName` and `realSkills`; item-usage `pct` of an item worn by all 3 is `100`; two-item AND filter narrows to the single char wearing both; level-distribution has both mode keys; accounts route is case-insensitive; `POST /accounts/queue` with `a b` -> 400, 6th valid call from same IP -> 429; `/health` -> 200; a second identical stats request is served from cache (spy on `pool.query` count unchanged).
- [ ] **Step 2:** Run `npx vitest run test/api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Port SQL shapes from pd2.tools `api/src/database/postgres/index.ts` `analyze*Usage` (~L1065 to 1253) onto this schema.
- [ ] **Step 4:** Run. Expected: PASS. Then full suite `npm test` and `npx tsc --noEmit`: PASS / no errors.
- [ ] **Step 5: Contract check against the web app types.** In the repo root, run `npx vitest run src/lib/api` (existing tests) to confirm nothing in the web app changed; compare our JSON keys with `ItemUsageRow`, `SkillUsageRow`, `MercTypeUsageRow`, `LevelDistribution`, `RawCharactersPage` in `src/lib/api.ts`: identical.
- [ ] **Step 6: Commit** `feat(server): pd2.tools-compatible read API with cache`.

---

### Task 8: Deploy to the VPS (controller runs this task, not a subagent)

**Files:**
- Create: `server/Dockerfile`, `deploy/docker-compose.yml`, `deploy/nginx-api.pd2meta.info.conf`, `deploy/RUNBOOK.md`

**Interfaces:**
- Consumes: built `server` (Tasks 1 to 7).
- Produces: `https://api.pd2meta.info/api/v1/health` -> `{"status":"ok"}`.

Decisions: compose project name `pd2meta`, path `/opt/pd2meta`; services `db` (`postgres:17-alpine`, volume `pd2meta_pg`, no published port), `collector` and `api` (same image, `command` differs), `api` publishes `127.0.0.1:8096:8080`. Postgres `shared_buffers=256MB`, `mem_limit` db 768m, collector 384m, api 512m (VPS has ~3.4 GB available). DB password generated on the VPS into `/opt/pd2meta/.env` (never committed). Ship code as `git archive HEAD server deploy | gzip` via `python vps_ssh.py put` (memory recipe), normalise CRLF in shell files with an EOL-preserving Python one-liner, not `sed -i`.

- [ ] **Step 1:** Write `Dockerfile` (node:22-alpine, multi-stage, `npm ci`, `npm run build`, run as `node`), compose file, nginx server block (`server_name api.pd2meta.info; location / { proxy_pass http://127.0.0.1:8096; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }`), and `RUNBOOK.md` (deploy, logs, pause via `update collector_control set paused = true`, restart, backup `pg_dump`). Express `app.set('trust proxy', 1)` so per-IP limits see the client IP.
- [ ] **Step 2: DNS.** Find where `pd2meta.info` DNS lives (`vercel dns ls pd2meta.info --scope <owner scope>` or Vercel MCP `get_records`). Add `A api -> 76.13.140.109`. Verify `nslookup api.pd2meta.info` returns `76.13.140.109`.
- [ ] **Step 3:** Upload, `docker compose up -d --build` in `/opt/pd2meta`, install the nginx site, `certbot --nginx -d api.pd2meta.info`, `nginx -t && systemctl reload nginx`.
- [ ] **Step 4: Verify.** `curl https://api.pd2meta.info/api/v1/health` -> `{"status":"ok"}`. After 30 min: `/stats` shows `requestsLastHour <= 3600`, `characters.softcore > 0`, `heartbeatAt` within 2 min. `docker stats --no-stream` within mem limits. `df -h /` still >= 15 GB free.
- [ ] **Step 5: Commit** `chore(deploy): compose, nginx, runbook for api.pd2meta.info`.

---

### Task 9: Stopgap, pd2meta reads our API (phase 1b)

**Files:**
- Modify: `src/lib/api.ts:1` (base URL), any other hard-coded `api.pd2.tools` in `src/` (`grep -rn "api.pd2.tools" src`)
- Test: `src/lib/api.test.ts` (existing; extend)

**Interfaces:**
- Consumes: deployed API (Task 8).
- Produces: `const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.pd2meta.info/api/v1";`

- [ ] **Step 1: Write failing test** in `src/lib/api.test.ts`: with `NEXT_PUBLIC_API_BASE` unset, `getItemUsage` calls a URL starting with `https://api.pd2meta.info/api/v1/characters/stats/item-usage?`.
- [ ] **Step 2:** Run `npx vitest run src/lib/api.test.ts` at repo root. Expected: FAIL.
- [ ] **Step 3:** Change `BASE`; update any other `api.pd2.tools` references in `src/`; update UI copy that names pd2.tools as the data source to "Data collected from the official Project Diablo 2 API" (footer credit to pd2.tools for the original code stays).
- [ ] **Step 4:** Run `npm test` and `npm run build` at repo root. Expected: PASS, static export builds.
- [ ] **Step 5: Live check (controller).** Gate: `/stats` shows `characters.softcore >= 2000`. Deploy a Vercel preview, load it headless with Playwright, select Paladin + Fist of the Heavens 20, press Generate, and confirm the match banner shows > 0 characters and the items table has rows. Then promote to production (merge `sprint/4.1-pipeline` to `main`, Vercel auto-deploys) and repeat the check on `https://www.pd2meta.info`.
- [ ] **Step 6: Commit** `feat(web): read from api.pd2meta.info (S14 stopgap)`.

---

## After this plan

Next plans, in order: Phase 2 (shell with tabs, price job from `market_listings`, Builds tab per spec 4.1 and 4.4), Phase 3 (Meta endpoints + Meta tab), Phase 4 (look and launch), Phase 5 (archive import S11 to S13 + parity test against `api.pd2.tools`).
