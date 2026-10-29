# pd2meta v2, Phases 3+4: server-side Meta, Meta tab in the LEXADIS look, launch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Meta tab runs on finished server aggregates for the whole cohort (no raw pool download, no 1,500 cap, no browser calls to pd2trader.com), is rebuilt once in the LEXADIS `.lx` look driven by the shared header season/mode switch, and the site launches with credits, docs and the old client-side code removed.

**Architecture:** The read API (`server/`) gains `GET /api/v1/meta` (one cohort, every Meta aggregate in one body) and `GET /api/v1/meta/diff` (one named character vs the cohort), computed in SQL over `character_items.mods` / `character_skills` with thin TypeScript shaping, cached in the existing LRU and pre-warmed for the 16 base cohorts. The price job also prices runes so runeword rune cost comes from our own `item_prices`. Static game data the aggregations need is copied into `server/src/core/static/` (committed, drift-tested). The web Meta tab (`/`, alias `/meta`) is rebuilt under `src/components/meta/` on `src/lib/meta/`, then the D2 theme, Cinzel, shadcn UI, IndexedDB cache, client aggregation and pd2trader code are deleted.

**Tech Stack:** Server: Node 22, TypeScript 5, Express 4, `pg` 8, vitest 4 + supertest on `embedded-postgres`. Web: Next.js 16 (`output: 'export'`), React 19, Tailwind 4, vitest 4 + jsdom + `@testing-library/react`. No new dependencies; this plan removes `idb-keyval`, `shadcn`, `radix-ui`, `class-variance-authority`, `tw-animate-css` (and `lucide-react` if nothing imports it).

**Spec:** `docs/superpowers/specs/2026-10-28-pd2meta-v2-design.md` (3b, 4.2, 4.3, 4.4, 5.3 layer 2, 7, 8 phases 3 and 4, 9). Format, constraints and what exists: `docs/superpowers/plans/2026-10-29-pd2meta-v2-phase1-pipeline.md`, `docs/superpowers/plans/2026-10-29-pd2meta-v2-phase2-builds.md`.

## Global Constraints

- Phase-1/2 collector rules stay untouched: one global `RateLimiter`, `PD2_MIN_INTERVAL_MS=1000`, peak pause 12:00 to 14:00 `America/Los_Angeles`, kill switch, `POST /accounts/queue` limit 5 per IP per hour. This plan adds no upstream calls.
- Existing endpoints keep their response shapes: `/characters`, `/characters/stats/*`, `/characters/accounts/:account`, `/characters/:name(/history)`, `/builds/*`, `/prices`, `/accounts/queue`, `/health`, `/stats`. The only visible change: `/prices` and `item_prices` may now contain rows with `itemType: 'Rune'`.
- SQL uses bind parameters only; no value from the query string is interpolated. Lists of static names (rune names, excluded mods, prereq pairs) are passed as array parameters.
- Every new query param that changes a result is in `KEY_PARAMS` (`server/src/api/app.ts`); this plan adds `char`.
- Meta response for one cohort under 200,000 bytes; p95 under 1,000 ms cold at season size (checked by `meta-bench` in Task 15). Cache TTL 15 min as for other routes.
- Field units are kept from the old client aggregates so the ported tests carry over: `TopItem.pct`, `SkillFrequencyRow.pct`, merc `pct` are 0..100; `AffixMod.pct`, `AvgStat.pctOfChars`, `SkillUsageEntry.pct*`, charm `pct` are fractions 0..1 (charm mod `pct` can exceed 1). Each type comments its unit.
- Static data on the server comes only from `server/src/core/static/*.json`, byte-identical copies of the repo files (Task 1). Never edit the copies by hand.
- Prices: ladder only, per mode, 7-day window, corrupted excluded, `MIN_SOLD_SAMPLES = 5`, `MIN_SAMPLES = 3` (phase 2). Unpriced shows `n/a`; a rune without a price counts `0.01` HR in rune cost and marks the cost estimated (`~` prefix in UI).
- No request from the browser to `pd2trader.com` (grep check in Task 14).
- Look (binding): LEXADIS package `C:\Coding\III____Full_Circle\design\lexadis-look-and-feel\` as already implemented in `src/app/lx.css` and `src/components/lx/*`. Tokens from `lx.css` only (no new colours, shadows, radii, durations), Geist + Geist Mono, glass by role (cards `karte`, tables/menus `mat-thick`, tooltips `mat-chrome`), capsule buttons, one accent (`--accent-text`/`--glow`) only for focus, active state and selection, spring motion via the existing `--feder-*`/`--dauer-*` utilities (`erscheinen`, `kaskade-karten`, `kaskade-zeilen`, `aufklapp-*`, `gleit-marker`), `prefers-reduced-motion` and `prefers-reduced-transparency` honoured. Dark default. No LEXADIS name or law-firm patterns. White card + grey 1px border + 8px radius is a defect.
- D2 quality colours are data colours only, through the existing `text-q-*` classes / `--color-q-*` variables. Kontra tier letters render as mono text in a well, not coloured gradients.
- Numbers: `Intl.NumberFormat('en-US')`, Geist Mono, `tabular-nums`; HR values through `formatHr`, shares through `formatPct` (`src/lib/builds/format.ts`).
- Profanity mask (`displayName`) on every displayed character or account name; links and API calls keep the raw name.
- Static export: every page that reads `useSearchParams` renders inside `<Suspense>`.
- No em dashes in any UI text, docs or commit messages written by this plan. Missing price `n/a`, other missing value `-`.
- Never use context7. Do not `sed -i` (CRLF churn); stage explicit paths; `git diff --stat` before each commit.
- Branch `sprint/4.3-meta` off `main`. Commit per task. Nothing is pushed or merged until Task 15 (controller).
- Tests: server `cd server && npx vitest run <files>` (embedded Postgres via `test/global-setup.ts`); web `npx vitest run <files>` at the repo root. Each task ends with its files green, the package's full `npm test`, and `npx tsc --noEmit` (web: `npm run typecheck`).

## Review Focus

1. A cohort that matches nobody (`classes=Druid&skills=[{"name":"Blizzard","minLevel":20}]`) or an empty season: `poolSize 0`, every `pct`/`avg` is `0` (never `NaN` or `null`), all lists empty, `skillUsage` is `[]` (not `null`) for a single class, the UI shows `0 characters match` and per-card empty text, diff returns pool tops `null`. Tests in Tasks 3 to 8 and 12.
2. Old shared links with stale or hostile params (`minLevel=60`, `minLevel=abc`, `skills=notjson`, `skills=[{"name":1}]`, `className=Wizard`, `mode=foo`, `gameMode=HARDCORE`, `char=` with spaces): web normalises to defaults and renders, server ignores invalid skills, nothing throws, a valid old link (`/?className=Paladin&skills=[...]&gameMode=hardcore&minLevel=85&mode=guide&char=`) reproduces the same cohort. Tests in Tasks 7 and 10.
3. Cache key collisions: `/meta?skills=A` vs `?skills=B`, `classes`, `season`, `minLevel`, and `/meta/diff?char=Foo` vs `?char=Bar` must return different bodies; the pre-warmed key must equal the key of a real request for the same cohort. Tests in Tasks 7 and 8.
4. Fast filter changes on the web (click three skills within 300 ms, switch class while a request is in flight): one request after the debounce, in-flight request aborted, a late older response never replaces a newer one. Test in Task 11.
5. Runewords without a recipe, runes with no price, items with fewer than 3 samples: `price null` shows `n/a`, rune cost uses `0.01` per missing rune and shows `~0.52 HR`, no `NaN`, market link still present. Tests in Tasks 2, 4 and 12.

---

## File structure

```
server/
  scripts/sync-static.js                  copy repo data -> src/core/static (Task 1)
  src/core/static/{item-slots,skill-prereqs,skill-classification,mod-dictionary,runeword-runes}.json
  src/core/static-data.ts                 typed access, slot lookups, rune names, recipes
  src/db/migrations/004_rune_prices.sql   item_prices.item_type gains 'Rune'
  src/db/prices-repo.ts                   (modify) rune pricing, getRunePrices, getPriceMap
  src/api/meta/types.ts                   response types (copied verbatim to the web)
  src/api/meta/stats.ts                   pool sizes, core stats, avg stats
  src/api/meta/items.ts                   top items per slot + prices + rune cost, merc, skill frequency, levels
  src/api/meta/affixes.ts                 affix frequency per slot
  src/api/meta/charms.ts                  charm patterns
  src/api/meta/skills.ts                  prereq-classified skill usage + role
  src/api/meta/cohort.ts                  metaCohort (assembles all), metaFilter
  src/api/meta/diff.ts                    findDiffCharacter, diffCharacter
  src/api/app.ts                          (modify) /meta, /meta/diff, KEY_PARAMS, cacheKeyFrom, warm-up
  src/scripts/meta-bench.ts               cold timing + size check for the controller
  test/helpers/meta-seed.ts               mkChar/seed builders for compact characters
  test/{static-data,rune-prices,meta-stats,meta-items,meta-affixes,meta-charms,meta-skills,meta-api,meta-diff,meta-parity}.test.ts

src/
  lib/meta/{types,state,api,across-slots,items-data}.ts (+ tests)
  lib/builds/url-state.ts                 (modify) buildsHrefFromMeta(MetaState)
  lib/builds/types.ts                     (modify) PriceRow itemType adds 'Rune'
  lib/api.ts                              (trim) API_BASE, GameMode, SkillUsageRow, getSkillUsage
  app/page.tsx                            Meta tab (Suspense + MetaView)
  app/layout.tsx, app/globals.css         (modify) drop Cinzel and D2 theme, add footer
  components/meta/                        MetaView, MetaHeader, MetaFilters, SkillPicker, CohortLine,
                                          AvgStatsCard, TopItemsCard, ItemPriceTip, AffixCard, CharmsCard,
                                          BuildSheetCard, DiffCard
  components/shell/{SiteHeader,SiteFooter}.tsx
  lib/validation/parity.test.ts           (rewrite) against fixtures captured from our API
scripts/refresh-validation-fixtures.ts    (rewrite) capture from api.pd2meta.info incl. /meta

deleted (Task 14): src/lib/{data-loader,filter,diff,slot,types,url-state}.ts (+tests), src/lib/aggregate/, src/lib/shape/,
  src/lib/price/{pd2trader,snapshot,runewords,parse}.ts (+tests), src/lib/kontra/tierStyle.ts,
  src/components/{AffixFrequencyTable,AvgStatsPanel,BuildSheet,CharmPanel,DataFreshness,DiffView,FilterForm,
  ItemFrequencyTable,ItemTooltip,MarketDetailsCard,MarketLinkButton,TopAffixAveragesPanel}.tsx, src/components/ui/,
  components.json
```

---

### Task 1: Static data on the server

**Files:**
- Create: `server/scripts/sync-static.js`, `server/src/core/static/*.json` (5 files, generated), `server/src/core/static-data.ts`
- Test: `server/test/static-data.test.ts`

**Interfaces:**
- Consumes: repo files `data/item-slots.json`, `data/skill-prereqs.json`, `data/skill-classification.json`, `data/mod-dictionary.json`, `public/runeword-runes.json`. (`data/builds.json` does not exist; presets live in `data/kontra-builds.json` and stay web-only because only the UI uses them. `data/mod-dictionary.overrides.json` is already merged into the dictionary by its build script.)
- Produces:
  - `sync-static.js`: copies the 5 files byte-for-byte into `server/src/core/static/` (same file names, `runeword-runes.json` included). Run with `node server/scripts/sync-static.js` from the repo root or `node scripts/sync-static.js` from `server/`.
  - `static-data.ts` (JSON imported with `resolveJsonModule`, so `tsc` emits them into `dist/core/static/`; no change to `copy-migrations.js`):
    - `type MetaSlot = 'helm'|'armor'|'weapon'|'offhand'|'gloves'|'belt'|'boots'|'amulet'|'ring'`
    - `META_SLOTS: MetaSlot[] = ['weapon','offhand','helm','armor','gloves','belt','boots','amulet','ring']` (display order of the old Meta tables)
    - `slotFromItemName(name: string): MetaSlot | null` (item-slots map)
    - `SLOT_BY_EQUIPMENT: Record<string, MetaSlot>` = `Helm helm, Armor armor, Right Hand weapon, Right Hand Switch weapon, Left Hand offhand, Left Hand Switch offhand, Gloves gloves, Belt belt, Boots boots, Amulet amulet, Left Ring ring, Right Ring ring` (verbatim from `src/lib/slot.ts`)
    - `SKILL_PREREQS: Record<string, Record<string, { prereqs: string[]; receivesBonusesFrom: string[] }>>`
    - `skillRole(className: string, skill: string): 'core'|'synergy'` (classification map, default `'core'`)
    - `MOD_DICTIONARY: Record<string, { category: string; displayLabel: string }>`
    - `RUNE_NAMES` = the 33 names `El ... Zod` (verbatim from `src/lib/price/pd2trader.ts`); `RUNE_ITEM_NAMES = RUNE_NAMES.map(r => r + ' Rune')`
    - `runewordRecipe(name: string): string[] | null`

- [ ] **Step 1: Write failing tests** (`static-data.test.ts`): for each of the 5 files, `readFileSync(server/src/core/static/<f>)` equals `readFileSync(<repo>/<path>)` as Buffers (message: `run node server/scripts/sync-static.js`); `slotFromItemName("Harlequin Crest") === 'helm'`, `("Heart of the Oak") === 'weapon'`, `("Raven Frost") === 'ring'`, unknown -> `null`; `SLOT_BY_EQUIPMENT['Left Hand Switch'] === 'offhand'`; `skillRole('Amazon','Inner Sight') === 'synergy'`, `skillRole('Amazon','Strafe') === 'core'`, unknown skill -> `'core'`; `RUNE_NAMES.length === 33`; `runewordRecipe('Beast')` equals `['Ber','Tir','Um','Mal','Lum']`; `runewordRecipe('Nope') === null`.
- [ ] **Step 2:** Run `npx vitest run test/static-data.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write `sync-static.js`, run it, implement `static-data.ts`.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`, `npm run build` then `ls dist/core/static` lists the 5 files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): static game data copies for Meta aggregation`.

---

### Task 2: Rune prices

**Files:**
- Create: `server/src/db/migrations/004_rune_prices.sql`
- Modify: `server/src/db/prices-repo.ts`, `src/lib/builds/types.ts` (`PriceRow.itemType` adds `'Rune'`)
- Test: `server/test/rune-prices.test.ts`, extend `server/test/migrate.test.ts`

**Interfaces:**
- Consumes: `market_listings` (rune listings have `quality 'Normal'`, `base_name '<Rune> Rune'`, `runeword_key null`), `RUNE_ITEM_NAMES` (Task 1), `computeItemPrices` (phase 2).
- Produces:
  - `004_rune_prices.sql`: `alter table item_prices drop constraint item_prices_item_type_check; alter table item_prices add constraint item_prices_item_type_check check (item_type in ('Unique','Set','Runeword','Rune'));`
  - `computeItemPrices`: item type expression becomes `case when runeword_key is not null then 'Runeword' when base_name = any($5::text[]) and coalesce(quality,'') not in ('Unique','Set') then 'Rune' else quality end`, rune rows keyed by `item_name = base_name` (`'Ber Rune'`), filter `item_type in ('Unique','Set','Runeword','Rune')`; thresholds unchanged. `PriceRow.itemType` union gains `'Rune'`.
  - `recomputeGearValues` unchanged (still joins Unique/Set/Runeword only).
  - `getRunePrices(pool, mode): Promise<Map<string, number>>` keyed by short rune name (`'Ber'`), value `median_hr`.
  - `getPriceMap(pool, mode): Promise<Map<string, ItemPrice>>` keyed `` `${itemType}|${name}` `` for Unique/Set/Runeword rows (one query).

- [ ] **Step 1: Write failing tests:** migration test: inserting an `item_prices` row with `item_type 'Rune'` succeeds, `'Bogus'` fails. `rune-prices.test.ts` (listings via `upsertListings`): 3 open ladder softcore `Ber Rune` listings at `1, 1.2, 1.4` -> `getPrices('softcore')` has `{ itemType: 'Rune', name: 'Ber Rune', medianHr: 1.2, source: 'ask' }` and `getRunePrices` maps `'Ber' -> 1.2`; 2 listings -> no rune row; a `Ber Rune` listing with `quality 'Unique'` is not a rune; hardcore priced separately; a Unique `Harlequin Crest` keeps pricing as before; `recomputeGearValues` result unchanged by rune rows; `getPriceMap` has key `'Unique|Harlequin Crest'` and no rune keys.
- [ ] **Step 2:** Run `npx vitest run test/rune-prices.test.ts test/migrate.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement migration and repo changes.
- [ ] **Step 4:** Run the tests, `npm test` (`prices.test.ts` stays green unchanged), `npx tsc --noEmit`; root `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): price runes from market listings`.

---

### Task 3: Meta types, seed helper, pool sizes, core and average stats

**Files:**
- Create: `server/src/api/meta/types.ts`, `server/src/api/meta/stats.ts`, `server/test/helpers/meta-seed.ts`
- Test: `server/test/meta-stats.test.ts`

**Interfaces:**
- Consumes: `filterCte`, `CharacterFilter` (phase 1/2), `upsertCharacter`, `CompactCharacter`, `MOD_DICTIONARY`.
- Produces:
  - `types.ts` (all of these, copied verbatim to the web in Task 10):
    - `CoreStat = { key: 'strength'|'dexterity'|'vitality'|'energy'|'life'|'mana'; label: string; avg: number }`
    - `AvgStat = { modName: string; displayLabel: string; suffix: '%' | ''; avgValue: number; charsWithMod: number; pctOfChars: number /* 0..1 */ }`
    - `ItemPriceInfo = { medianHr: number; samples: number; source: 'sold'|'ask' }`
    - `TopItem = { itemName: string; itemType: 'Unique'|'Set'|'Runeword'; count: number; pct: number /* 0..100 */; invCode: string | null; price: ItemPriceInfo | null; runes: Array<{ rune: string; medianHr: number | null }> | null; runeCostHr: number | null; runeCostEstimated: boolean }`
    - `AffixMod = { modName: string; displayLabel: string; category: string; count: number; pct: number /* 0..1 of items in slot */; medianValue: number; p75Value: number }`, `AffixSlot = { items: number; mods: AffixMod[] }`
    - `CharmModEntry = { modName: string; displayLabel: string; count: number; pct: number /* count / poolSize, may exceed 1 */ }`, `CharmsAggregate = { avgCount: number; annihilus: { count: number; pct: number }; torch: { count: number; pct: number }; gheeds: { count: number; pct: number }; topGcMods: CharmModEntry[]; topScMods: CharmModEntry[] }`
    - `SkillUsageEntry` = the old `src/lib/aggregate/skillUsage.ts` type (fields `name, numWithAny, numAsBuild, numAsPrereq, numAtTwenty, avgBaseLevel, avgBaseLevelAsBuild, totalSample, pctBuild, pctAny, pctAtTwenty`, fractions) plus `role: 'core'|'synergy'`
    - `SkillFrequencyRow = { name: string; numOccurrences: number; totalSample: number; pct: number /* 0..100 */ }`
    - `MercSummary = { topType: string; typeFrequency: Array<{ mercType: string; act: number | null; numOccurrences: number; totalSample: number; pct: number }>; topItemsBySlot: Record<string, Array<{ itemName: string; itemType: string; invCode: string | null; pct: number }>> }`
    - `MetaCohort = { season: number; mode: 'softcore'|'hardcore'; className: string | null; minLevel: number; skills: Array<{ name: string; minLevel: number }>; poolSize: number; basePoolSize: number; coreStats: CoreStat[]; avgStats: AvgStat[]; topItemsBySlot: Record<MetaSlot, TopItem[]>; affixModsBySlot: Record<MetaSlot, AffixSlot>; charms: CharmsAggregate; skillFrequency: SkillFrequencyRow[]; skillUsage: SkillUsageEntry[] | null; levelDistribution: Array<{ level: number; count: number }>; mercenary: MercSummary; pricesComputedAt: string | null }`
    - `SlotDiff`, `CharacterDiff`: Task 8.
  - `meta-seed.ts`: `type MkItem = { name?: string; quality: string; slot?: string | null; charm?: 'Small Charm'|'Medium Charm'|'Large Charm'; runeword?: boolean; baseName?: string; owner?: 'player'|'merc'; invCode?: string | null; mods?: Array<[name: string, value: number, label?: string]> }`; `mkChar(p: { name: string; className?: string /* 'Paladin' */; level?: number /* 90 */; mode?: 'softcore'|'hardcore'; attributes?: Partial<Record<'strength'|'dexterity'|'vitality'|'energy', number>>; life?: number; mana?: number; skills?: Array<[skill: string, hard: number]>; items?: MkItem[]; merc?: string | null; account?: string }): CompactCharacter` (charm items get `isCharm true`, `slot null`, `baseType` = charm type; label defaults to the mod name); `seed(pool, chars: CompactCharacter[], season = 14): Promise<void>` via `upsertCharacter(pool, season, c, { character: { name: c.name } })`.
  - `stats.ts`:
    - `poolSizes(pool, f: CharacterFilter): Promise<{ poolSize: number; basePoolSize: number }>` (`basePoolSize` = same filter with `skills: []`)
    - `coreStats(pool, f): Promise<CoreStat[]>` averages of `attributes->>'strength'|'dexterity'|'vitality'|'energy'` and `life`, `mana` (null as 0); labels `Strength, Dexterity, Vitality, Energy, Life, Mana`; empty pool returns the 6 rows with `avg 0`.
    - `avgStats(pool, f, topN = 8): Promise<AvgStat[]>`: player items that are equipped (`slot is not null`, switch included, as the old `zone === 'Equipped'`) or non-unique charms (`is_charm and not (quality = 'Unique' and name = any(['Annihilus','Hellfire Torch',"Gheed's Fortune"]))`); per character and mod the sum of `coalesce((m->>'value')::numeric, 0)`; per mod `avgValue = total / poolSize`, `charsWithMod = count(per-char total > 0)`, mods with `charsWithMod 0` dropped. Excluded names verbatim from `avgStats.ts` `EXCLUDED_MOD_NAMES`; labels from `MOD_DICTIONARY` (fallback modName); labels `corrupted|desecrated|mirrored` (case-insensitive) dropped; `suffix` = old `suffixForMod` (port verbatim); sort `charsWithMod desc, modName asc`; top `topN`.
  - Known deviation (ruling): charms count only from the inventory (the collector does not store stash charms).

- [ ] **Step 1: Write failing tests** (`meta-stats.test.ts`, seed with `mkChar`): 2 Paladins `strength 100 / 200`, `life 1000 / 2000` -> `coreStats` Strength `150`, Life `1500`; an empty filter result gives 6 rows all `avg 0`; `poolSizes` with a skill filter matching 1 of 2 -> `{ poolSize: 1, basePoolSize: 2 }`. `avgStats`: char A rare ring `item_fastercastrate 10` + small charm `item_fastercastrate 5`, char B nothing -> FCR `avgValue 7.5`, `charsWithMod 1`, `pctOfChars 0.5`, `suffix '%'`; `fireresist` and `item_addskill_tab` never appear; an Annihilus charm's mods are not counted; a merc item's mods are not counted; a switch-slot item is counted; mod labelled `Corrupted` in the dictionary is dropped; with 10 distinct mods only 8 returned, ordered by `charsWithMod` then name; empty pool -> `[]`.
- [ ] **Step 2:** Run `npx vitest run test/meta-stats.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): meta types, pool sizes, core and average stats`.

---

### Task 4: Top items per slot with prices, merc summary, skill frequency, level distribution

**Files:**
- Create: `server/src/api/meta/items.ts`
- Test: `server/test/meta-items.test.ts`

**Interfaces:**
- Consumes: `filterCte`, `slotFromItemName`, `runewordRecipe`, `getPriceMap`, `getRunePrices` (Tasks 1, 2), `mercTypeOf` (phase 2).
- Produces:
  - `type UsageRow = { item: string; itemType: string; numOccurrences: number; totalSample: number; pct: number }` (same as phase-1 `ItemUsageRow`)
  - `shapeTopItemsBySlot(rows: UsageRow[], limit = 8): Record<MetaSlot, Array<{ itemName: string; itemType: string; count: number; pct: number }>>` pure port of `src/lib/shape/topItems.ts` (rows without a slot dropped, sort `count desc`, then `itemName asc`, `pct` copied unchanged). Used by Task 9 parity.
  - `itemUsageRows(pool, f, owner: 'player'|'merc'): Promise<Array<UsageRow & { invCode: string | null }>>` same SQL semantics as phase-1 `itemUsageFor` plus `min(i.inv_code)`.
  - `topItemsBySlot(pool, f): Promise<Record<MetaSlot, TopItem[]>>`: shape player rows, attach `price` from `getPriceMap` key `` `${itemType}|${itemName}` ``; for runewords with a recipe: `runes` (each rune's price or `null`), `runeCostHr = round2(sum(price ?? 0.01))`, `runeCostEstimated = some price null`; no recipe or not a runeword: `runes null, runeCostHr null, runeCostEstimated false`.
  - `mercSummary(pool, f): Promise<MercSummary>`: `typeFrequency` from `character_merc.description` (raw, as `/characters/stats/merc-type-usage`), `act` via `mercTypeOf(raw).act`, sorted `numOccurrences desc, mercType asc`; `topType` = first or `''`; `topItemsBySlot` from merc item rows, slot via `slotFromItemName` else `'other'`, top 5 per slot by `pct desc`.
  - `skillFrequency(pool, f): Promise<SkillFrequencyRow[]>` = phase-1 `skillUsage` rows (hard >= 20), top 12 by `pct desc`.
  - `levelDistribution(pool, f): Promise<Array<{ level: number; count: number }>>` for the cohort's own mode and filter (minLevel applied; ruling: the old view ignored minLevel), ascending level.

- [ ] **Step 1: Write failing tests:** port the 3 cases of `src/lib/shape/topItems.test.ts` against `shapeTopItemsBySlot` (Heart of the Oak -> weapon pct 78, Harlequin Crest -> helm, Raven Frost -> ring; unknown item dropped; 9 helms -> 8, first Harlequin Crest). DB cases: 3 Paladins wearing `Harlequin Crest` (Unique, `invCode 'uap'`) and 1 wearing runeword `Spirit` in `Left Hand` -> helm top `{ itemName: 'Harlequin Crest', count: 3, pct: 75, invCode: 'uap' }`; with an `item_prices` row `Unique|Harlequin Crest 0.3` -> `price.medianHr 0.3`, without -> `price null`; rune prices for `Tal 0.01`, `Thul 0.02`, `Ort 0.03` only (Spirit = `Tal Thul Ort Amn`) -> `runeCostHr 0.07`, `runeCostEstimated true`, `runes[3]` `{ rune: 'Amn', medianHr: null }`; all four priced -> `runeCostEstimated false`; a runeword missing from the recipes -> `runes null, runeCostHr null`; merc `Defensive Auras` x2 and `Fire Arrow` x1 -> `topType 'Defensive Auras'`, `act 2`, merc `Andariel's Visage` under `helm`; `skillFrequency` contains `Blessed Hammer` with `pct 100` when all have 20 hard; `levelDistribution` with `minLevel 85` excludes level-80 characters; empty cohort -> every slot `[]`, `topType ''`, `[]` lists.
- [ ] **Step 2:** Run `npx vitest run test/meta-items.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. One price query and one rune query per cohort, not per item.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): meta top items per slot with prices and rune cost, merc, skills, levels`.

---

### Task 5: Affix frequency per slot

**Files:**
- Create: `server/src/api/meta/affixes.ts`
- Test: `server/test/meta-affixes.test.ts`

**Interfaces:**
- Consumes: `filterCte`, `SLOT_BY_EQUIPMENT`, `MOD_DICTIONARY`.
- Produces:
  - `TOP_MODS_PER_SLOT = 15`; `SKILL_TAB_MOD = 'item_addskill_tab'`
  - `affixBucketKey(name: string, label: string): string` = `name` except skill tab: `` `item_addskill_tab|${label.replace(/^\+?\d+(?:\.\d+)?\s+(?:to\s+)?/i, '').trim()}` `` (shared with Task 8).
  - `affixModsBySlot(pool, f): Promise<Record<MetaSlot, AffixSlot>>`: player items with `slot` in `SLOT_BY_EQUIPMENT` keys (switch included, as the old `slotFromRawItem`) and `quality in ('Rare','Magic','Crafted')`. SQL maps `slot` to the slot group (pass keys and values as two arrays), computes the bucket key in SQL with `regexp_replace(label, '^\+?\d+(\.\d+)?\s+(to\s+)?', '', 'i')` for the skill tab, and per (slot group, bucket): `count(*)`, `percentile_cont(0.5)` (= old median, mean of the middle two) and `percentile_disc(0.75)` (= old nearest-rank p75) over `coalesce(value, 0)`; `items` = number of eligible items in the slot group. TypeScript: label/category from the dictionary (skill tab: label = tab name, category `dict.item_addskill_tab?.category ?? 'skill'`; unknown: label = modName, category `'unknown'`); drop labels `corrupted|desecrated|mirrored` before the cut (ruling: the old UI filtered them after the cut); sort `count desc, modName asc`; top 15; `pct = count / items`. Every slot key present (`{ items: 0, mods: [] }` when empty).

- [ ] **Step 1: Write failing tests:** port every non-snapshot case of `src/lib/aggregate/affixMods.test.ts` with `mkChar` items: single rare ring counts; Unique/Set/Normal/Runeword items excluded; pct across characters (2 rings, mod on one -> `0.5`); values `[1,2,3,4]` -> `medianValue 2.5`, `p75Value 3`, values `[5,1,3]` -> median `3`, p75 `5`; sort by count; unknown mod -> label = name, category `'unknown'`; skill tab: `+3 to Combat Skills (Paladin Only)` and `+1 to Combat Skills (Paladin Only)` collapse into `item_addskill_tab|Combat Skills (Paladin Only)` with label `Combat Skills (Paladin Only)`, `+1 to Warcries Skills (Barbarian Only)` is a separate bucket. New: a rare in `Right Hand Switch` counts under `weapon`; a rare charm (no slot) is not counted; a mod labelled `Corrupted` never appears; 20 distinct mods on one helm -> 15 returned; empty cohort -> 9 slots each `{ items: 0, mods: [] }`.
- [ ] **Step 2:** Run `npx vitest run test/meta-affixes.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): meta affix frequency per slot`.

---

### Task 6: Charm patterns

**Files:**
- Create: `server/src/api/meta/charms.ts`
- Test: `server/test/meta-charms.test.ts`

**Interfaces:**
- Consumes: `filterCte`, `poolSizes` (Task 3), `MOD_DICTIONARY`.
- Produces: `charmsAggregate(pool, f, poolSize: number): Promise<CharmsAggregate>`: player items with `is_charm`. `avgCount = charms / poolSize`; Annihilus = `quality 'Unique' and name 'Annihilus'`, Torch = `'Hellfire Torch'`, Gheed = `"Gheed's Fortune"` (count and `pct = count / poolSize`, unique charms do not feed mod lists); other charms: `base_type 'Large Charm'` -> GC bucket, `'Small Charm' | 'Medium Charm'` -> SC/LC bucket; per bucket count every mod occurrence, `pct = count / poolSize`; top 12 per bucket sorted `count desc, modName asc`; labels from the dictionary. `poolSize 0` -> all zeros and empty lists.

- [ ] **Step 1: Write failing tests:** port every non-snapshot case of `src/lib/aggregate/charms.test.ts` (empty pool zeros; Annihilus by name + Unique; Torch on Medium Charm; Gheed on Large Charm; GC mods into `topGcMods`; Small + Medium into `topScMods`; `avgCount` across chars; uniques excluded from mod lists; pct denominator is the pool). New: pool of 2 where one character carries three Grand Charms each with `item_maxhp_percent` -> that entry has `count 3`, `pct 1.5`.
- [ ] **Step 2:** Run `npx vitest run test/meta-charms.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): meta charm patterns`.

---

### Task 7: Prereq-classified skill usage, cohort assembly, routes, cache warm-up, bench

**Files:**
- Create: `server/src/api/meta/skills.ts`, `server/src/api/meta/cohort.ts`, `server/src/scripts/meta-bench.ts`
- Modify: `server/src/api/app.ts`, `server/src/api/main.ts` (start warm-up)
- Test: `server/test/meta-skills.test.ts`, `server/test/meta-api.test.ts`

**Interfaces:**
- Consumes: Tasks 3 to 6, `SKILL_PREREQS`, `skillRole`, `parseFilter`.
- Produces:
  - `skillUsage(pool, f, className: string, topN = 16): Promise<SkillUsageEntry[] | null>`: `null` when `SKILL_PREREQS[className]` is missing; `[]` for an empty pool. Per character skills with `hard_level >= 1` (= old `baseLevel >= 1`); `prereq-only` = `hard_level = 1` and another skill of the same character with `hard_level > 1` lists it in `prereqs` (pairs passed as `unnest($a::text[], $b::text[]) as pr(skill, prereq)` from the class map). Counts and averages exactly as `src/lib/aggregate/skillUsage.ts`; `role = skillRole(className, name)`; sort `pctBuild desc, name asc`; top 16.
  - `metaFilter(f: CharacterFilter): CharacterFilter` = `f` with `items, mercTypes, mercItems = []`, `maxGearHr = null` (Meta cohorts are mode, season, level, classes, skills only).
  - `metaCohort(pool, f: CharacterFilter): Promise<MetaCohort>`: `className` = the single entry of `f.classes` or `null`; runs `poolSizes`, `coreStats`, `avgStats`, `topItemsBySlot`, `affixModsBySlot`, `skillFrequency`, `levelDistribution`, `mercSummary`, `skillUsage` (only with a className) and `getPrices(...).computedAt` with `Promise.all`, then `charmsAggregate` with the pool size.
  - `app.ts`: `export function cacheKeyFrom(path: string, query: Record<string, unknown>): string` (the existing `cacheKey` body; `cacheKey(req)` becomes `cacheKeyFrom(req.path, req.query)`); `KEY_PARAMS` adds `'char'`; route `GET /meta` = `cached(req => meta.metaCohort(pool, metaFilter(filterOf(req))))` with `import * as meta from './meta/cohort'` (namespace call, so tests can spy on it).
  - `warmMetaCache(): Promise<number>` returned on the app object (`app.locals.warmMeta`): for both modes and `classes` in `[none, ...CLASSES]` at the current season and `minLevel 80`, computes sequentially and stores under `cacheKeyFrom('/meta', { gameMode, classes })` (identical to a request `?gameMode=softcore&classes=Paladin`). `api/main.ts` calls it once after listen and every 14 min (`setInterval(...).unref()`), errors logged at warn, never thrown.
  - `meta-bench.ts`: `main()` reads `DATABASE_URL`, `CURRENT_SEASON`; for both modes x (no class + 7 classes) plus the 7 canonical builds from `scripts/refresh-validation-fixtures.ts` (Lightning Fury, Lightning Sentry, Whirlwind, Tornado, Bone Spear, Blessed Hammer, Blizzard at 20), calls `metaCohort` directly (no LRU), prints `cohort ms bytes` per line and `p95 <ms> max-bytes <n>`; exit code 1 when p95 > 1000 or any body > 200000 bytes.

- [ ] **Step 1: Write failing tests.** `meta-skills.test.ts`: port every case of `src/lib/aggregate/skillUsage.test.ts` (the `isPrereqOnly` cases via characters: Power Strike 1 + Lightning Strike 20 -> Power Strike `numAsPrereq 1`; Power Strike 5 -> build; 1-pt skill with nothing downstream -> build; Jab flagged when Power Strike invested; unknown class -> `null`; empty -> `[]`; skill missing from the map -> build; `avgBaseLevelAsBuild` excludes prereq rows; sorted by `pctBuild`); `role` of `Inner Sight` for an Amazon is `'synergy'`; skills at `hard_level 0` are ignored. `meta-api.test.ts` (seed 3 Paladins + 1 Sorceress, prices): `GET /api/v1/meta?gameMode=softcore&classes=Paladin` 200 with `poolSize 3`, `className 'Paladin'`, `skillUsage` an array, all 9 slot keys in `topItemsBySlot` and `affixModsBySlot`, body length < 200000; no `classes` -> `className null`, `skillUsage null`, `poolSize 4`; `classes=Druid` -> `poolSize 0`, `skillUsage []`, no `NaN` in `JSON.stringify(body)`; `?skills=` A then `?skills=` B (different single skills) return different `poolSize` (cache key); `skills=notjson` equals no skills; `items=Spirit` is ignored (`poolSize` unchanged); `app.locals.warmMeta()` resolves `16`, and after it a `GET /meta?gameMode=softcore&classes=Paladin` is answered from the cache (spy on `metaCohort` call count stays the same, via `vi.spyOn` on the cohort module); existing `/characters/stats/item-usage` unchanged.
- [ ] **Step 2:** Run `npx vitest run test/meta-skills.test.ts test/meta-api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, `npm test` (all phase-1/2 API tests green unchanged), `npx tsc --noEmit`, `npm run build` (`dist/scripts/meta-bench.js` exists). Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): meta cohort endpoint with classified skill usage, cache warm-up and bench`.

---

### Task 8: Diff endpoint

**Files:**
- Create: `server/src/api/meta/diff.ts`
- Modify: `server/src/api/meta/types.ts`, `server/src/api/app.ts`
- Test: `server/test/meta-diff.test.ts`

**Interfaces:**
- Consumes: `topItemsBySlot`, `affixModsBySlot`, `mercSummary`, `affixBucketKey`, `SLOT_BY_EQUIPMENT`, `metaFilter`.
- Produces:
  - `SlotDiff = { slot: MetaSlot; poolTopItemName: string | null; userItemName: string | null; userItemQuality: string | null; userMatchesPoolTop: boolean; poolTopAffixMods: Array<{ modName: string; displayLabel: string; pct: number; userHas: boolean }> }`
  - `CharacterDiff = { characterName: string; accountName: string | null; characterLevel: number; className: string; mode: 'softcore'|'hardcore'; mercTypeMatchesPool: boolean | null; poolMercType: string | null; userMercType: string | null; slots: Record<MetaSlot, SlotDiff> }`
  - `findDiffCharacter(pool, season: number, mode, query: string): Promise<{ id: number; mode: 'softcore'|'hardcore' } | null>` order: character name in mode, character name in the other mode, account in mode (highest level, `id desc`), account in the other mode. All `lower(...) = lower($n)`. (Same precedence as the old Meta: name before account.)
  - `diffCharacter(user: { name: string; account: string | null; level: number; className: string; mode; items: Array<{ slot: string; isSwitch: boolean; name: string; quality: string; baseName: string | null; isRuneword: boolean; mods: Array<{ name: string; label: string }> }>; mercDescription: string | null }, guide: { topItemsBySlot; affixModsBySlot; poolMercType: string | null }): CharacterDiff` pure. Per slot the user's item = first non-switch item mapping to it, else a switch item (ruling: the old code took whatever came first). Name: `name` when it differs from `baseName` or quality is Unique/Set, runeword with `name === baseName` -> `Runeword (<base>)`, else `<quality> <baseName>` (old rules on compact data). Pool top = first `TopItem`; `poolTopAffixMods` = first 5 mods; `userHas` compares `affixBucketKey(mod.name, mod.label)` (ruling: fixes the old skill-tab miss). Merc match `null` when either side is null.
  - Route `GET /meta/diff` (params: cohort params + `char`): missing or blank `char`, or not found -> 404 `{ error: { message: 'Character not found' } }`; else `{ diff: CharacterDiff }`. Cached under `cacheKeyFrom` (includes `char`) with the lower-cased name as for `byName`.

- [ ] **Step 1: Write failing tests:** port the `diffCharacter` cases of `src/lib/diff.test.ts` (slot mismatch Raven Frost vs `Rare Ring`; affix coverage has FCR, missing Life; exact pool top match; empty slot -> `userItemName null`, `userMatchesPoolTop false`; merc match / mismatch / `null`; metadata; slot without pool top), and the `findCharacterInSample` precedence cases as `findDiffCharacter` against the DB (name case-insensitive; account case-insensitive; no match `null`; name preferred over account; account picks the highest level). New: a switch rare plus a main-hand unique -> the unique is the user's weapon; skill tab `+2 to Combat Skills (Paladin Only)` on the user's amulet matches a pool bucket `item_addskill_tab|Combat Skills (Paladin Only)` with `userHas true`; a hardcore character found from `gameMode=softcore` returns `mode 'hardcore'`. Route: `GET /meta/diff?gameMode=softcore&classes=Paladin&char=mc-meeks` 200; `char=Foo` then `char=MC-MEEKS` give different bodies; `char=` 404; `char=No%20Such` 404 error body; empty cohort -> every `poolTopItemName null`.
- [ ] **Step 2:** Run `npx vitest run test/meta-diff.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test, `npm test`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): meta diff endpoint for a named character`.

---

### Task 9: Validation parity against our API

**Files:**
- Modify: `scripts/refresh-validation-fixtures.ts` (rewrite), `src/lib/validation/parity.test.ts` (rewrite), `src/lib/validation/fixtures/README.md`
- Create: `server/test/meta-parity.test.ts`

**Interfaces:**
- Consumes: `/meta` (Task 7) and the phase-1 stats endpoints; `shapeTopItemsBySlot` (Task 4); fixture files in `src/lib/validation/fixtures/`.
- Produces:
  - Fixture shape gains `meta?: MetaCohort`; `_meta` gains `api: string` and `season: number`. The refresh script fetches with plain `fetch` from `process.env.NEXT_PUBLIC_API_BASE ?? 'https://api.pd2meta.info/api/v1'` (no import of `src/lib/api.ts`), `gameMode 'softcore'` (ruling: S14 hardcore pools are too small early in the season), `minLevel 80`, the same 7 canonical builds, the 5 stats endpoints (same param names as today) plus `/meta?gameMode&classes&minLevel&skills`.
  - Web `parity.test.ts` per fixture: (1) `itemUsage` and `skillUsage` non-empty; (2) `skillUsage[0].totalSample === itemUsage[0].totalSample`; (3) slot coverage of `itemUsage` names >= 0.95 via `data/item-slots.json` (imported directly; `slot.ts` is deleted in Task 14); and with `it.skipIf(!f.meta)`: (4) `meta.poolSize === itemUsage[0].totalSample`; (5) every `meta.topItemsBySlot` entry exists in `itemUsage` with `pct` equal and `count === numOccurrences` (no invented items, no mutated %); (6) each entry sits in the slot `item-slots.json` gives it.
  - Server `meta-parity.test.ts` per fixture: `shapeTopItemsBySlot(f.itemUsage)` slot coverage >= 0.95, no invented items, pct preserved (ports of old tests 2 to 5); with `skipIf(!f.meta)`: projection of `f.meta.topItemsBySlot` to `{ itemName, itemType, count, pct }` deep-equals `shapeTopItemsBySlot(f.itemUsage)`.

- [ ] **Step 1: Write the new tests** (both files) against the existing fixtures. Expected now: (1) to (3) and server ports pass, `meta` cases skipped (fixtures have no `meta` until Task 15 recaptures).
- [ ] **Step 2:** Run `npx vitest run src/lib/validation` and `cd server && npx vitest run test/meta-parity.test.ts`. Expected: PASS with `meta` cases reported skipped.
- [ ] **Step 3:** Rewrite the refresh script; `npx tsx scripts/refresh-validation-fixtures.ts --dry-run` prints the 7 URLs per build and writes nothing (add the flag).
- [ ] **Step 4:** Update the fixtures README (source is our API, softcore, `meta` key, refresh cadence unchanged, sanity table to be refilled on recapture). Run both test commands again. Expected: PASS.
- [ ] **Step 5: Commit** `test: parity fixtures and checks against our own API`.

---

### Task 10: Web Meta data layer, URL state, header scope on Meta

**Files:**
- Create: `src/lib/meta/{types,state,api,across-slots,items-data}.ts`, `src/lib/meta/state.test.ts`, `src/lib/meta/api.test.ts`, `src/lib/meta/across-slots.test.ts`
- Modify: `src/lib/builds/url-state.ts` (+ test), `src/components/shell/SiteHeader.tsx` (+ `shell.test.tsx`), `src/lib/api.ts` (trim), `src/lib/api.test.ts`, delete `src/lib/api.url-contract.test.ts` (its endpoints leave the client)
- Test: as listed

**Interfaces:**
- Consumes: server types (Tasks 3, 8), `/meta`, `/meta/diff`, `readScope`, `CLASSES` list from `src/lib/builds`.
- Produces:
  - `types.ts`: verbatim copy of `server/src/api/meta/types.ts` plus `MetaSlot`, `META_SLOTS`.
  - `MetaState = { season: number | null; gameMode: 'softcore'|'hardcore'; className: string; minLevel: number; skills: Array<{ name: string; minLevel: number }>; mode: 'guide'|'diff'; char: string }`; `DEFAULT_META_STATE = { season: null, gameMode: 'softcore', className: 'Paladin', minLevel: 80, skills: [], mode: 'guide', char: '' }` (ruling: default mode follows the shared header, softcore; default class stays Paladin).
  - `parseMetaState(p: URLSearchParams): MetaState`: `season`/`gameMode` via `readScope` (`gameMode` compared lower-case); `className` must be one of the 7 classes else `'Paladin'`; `minLevel` integer clamped `80..99`, non-numeric -> 80; `skills` JSON array of `{ name: non-empty string, minLevel: integer }` (minLevel clamped `1..99`, bad entries dropped, bad JSON -> `[]`); `mode === 'diff'` else `'guide'`; `char` = `get('char')` trimmed, max 50 chars.
  - `serializeMetaState(s): URLSearchParams` always `gameMode` and `className`; `season` when not null; `minLevel` when not 80; `skills` JSON when non-empty; `mode=diff` and `char` only in diff mode. Old links parse and re-serialise to the same cohort.
  - `metaApiParams(s): URLSearchParams` = `season?, gameMode, classes=<className>, minLevel, skills?`.
  - `api.ts`: `getMeta(s: MetaState, signal?: AbortSignal): Promise<MetaCohort>` (`GET /meta`), `getMetaDiff(s, name: string, signal?): Promise<CharacterDiff | null>` (404 -> `null`; body `.diff`). Base from `API_BASE`.
  - `across-slots.ts`: `acrossSlots(data: Record<MetaSlot, AffixSlot>): { totalItems: number; mods: Array<{ modName: string; displayLabel: string; count: number; pct: number }> }` port of `aggregateAcrossSlots` (`AffixFrequencyTable.tsx`) using the exact `items` per slot instead of `count / pct`; same exclusions (meta flags, resist names, `item_singleskill`, `item_charged_skill`, `item_skillon*` prefixes); sort `count desc`.
  - `items-data.ts`: `ItemData` type and `useItemsData(): Map<string, ItemData>` moved verbatim from `src/components/ItemTooltip.tsx` (reads `/items.json`).
  - `src/lib/api.ts` keeps only `API_BASE`, `GameMode`, `SkillUsageRow`, `getSkillUsage(f: { gameMode; className?; minLevel? }, skills?)` (skill picker, unchanged endpoint); `api.test.ts` keeps the `getSkillUsage` cases.
  - `buildsHrefFromMeta(s: MetaState): string` (signature changes from `UiState`; same output rules: `/builds?gameMode=&classes=&skills=&minLevel=<snapped down to 80|85|90|95|99>`, plus `season` when set); `metaHref(BuildsState)` emits `serializeMetaState` names.
  - `SiteHeader`: `ScopeSwitch` shows on `/`, `/meta` and `/builds` (exact paths after trailing-slash strip), not on `/builds/character` or `/builds/account`.

- [ ] **Step 1: Write failing tests.** `state.test.ts`: `parseMetaState(new URLSearchParams('className=Paladin&skills=[{"name":"Blessed Hammer","minLevel":20}]&gameMode=hardcore&minLevel=85&mode=guide&char='))` gives `{ className: 'Paladin', gameMode: 'hardcore', minLevel: 85, mode: 'guide', char: '', skills: [{ name: 'Blessed Hammer', minLevel: 20 }] }`; `minLevel=60` -> 80, `minLevel=abc` -> 80, `minLevel=120` -> 99; `skills=notjson` and `skills=[{"name":1}]` -> `[]`; `className=Wizard` -> `'Paladin'`; `mode=foo` -> `'guide'`; `gameMode=HARDCORE` -> `'hardcore'`; empty params -> `DEFAULT_META_STATE`; round-trip of a full diff state; `serializeMetaState` of a guide state has no `char`; `metaApiParams` uses `classes=Paladin`. `api.test.ts` (mock `fetch`): `getMeta` URL starts `https://api.pd2meta.info/api/v1/meta?` and contains `classes=Paladin`; `getMetaDiff` 404 -> `null`, 200 -> the `diff` object, name encoded. `across-slots.test.ts`: two slots `{ items: 10 }` and `{ items: 30 }` each with FCR count 5 -> FCR `count 10`, `pct 0.25`, `totalItems 40`; `fireresist` and `item_singleskill` excluded; all-empty -> `{ totalItems: 0, mods: [] }`. `url-state.test.ts`: the phase-2 `buildsHrefFromMeta` assertion rewritten for `MetaState` (`minLevel 87` -> `minLevel=85`). `shell.test.tsx`: on `/` the season select and mode segment render; on `/builds/character` they do not.
- [ ] **Step 2:** Run `npx vitest run src/lib/meta src/lib/builds/url-state.test.ts src/components/shell src/lib/api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The old Meta page still compiles until Task 11 replaces it; in `FilterForm.tsx` change the one `buildsHrefFromMeta(s)` call to `buildsHrefFromMeta({ ...DEFAULT_META_STATE, gameMode: s.filter.gameMode, className: s.filter.className ?? 'Paladin', minLevel: s.filter.minLevel ?? 80, skills: s.skills })`.
- [ ] **Step 4:** Run the tests, `npm test`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): meta data layer, URL state and shared header scope`.

---

### Task 11: Meta page frame: header, filters, skill picker, cohort line, live updates

**Files:**
- Create: `src/components/meta/{MetaView,MetaHeader,MetaFilters,SkillPicker,CohortLine}.tsx`
- Modify: `src/app/page.tsx` (replace body; `src/app/meta/page.tsx` stays a re-export)
- Test: `src/components/meta/frame.test.tsx`

**Interfaces:**
- Consumes: Task 10 modules, `getSkillUsage`, `BUILD_PRESETS`, `isPresetActive`, `PRESET_MIN_LEVEL` (`src/lib/buildPresets.ts`), lx primitives (`Card`, `Segment`, `Button`, `Chip`, `SearchField`, `Bar`), `SkillIcon` and `ItemIcon` (`src/components/builds/ItemIcon.tsx`), `classIconUrl`, `skillIconUrl`, formatters, `displayName`, `useScope`.
- Produces:
  - `page.tsx`: `<main className="lx lx-stage min-h-screen"><Suspense fallback={<skelett block/>}><MetaView/></Suspense></main>`.
  - `MetaView`: state = `parseMetaState(useSearchParams())`; writes with `router.replace('/?' + serializeMetaState(next), { scroll: false })` (keeps the `/meta` path when on it); season and mode come from the header (no mode control in Meta). Fetch: on every change of `metaApiParams(state).toString()` wait 300 ms, abort the previous `AbortController`, call `getMeta`; a response is applied only if its request id is the latest. Keeps the last result visible with `aria-busy="true"` while loading; first load shows `skelett` blocks; failure shows a capsule `Could not load the meta. Retry` (secondary button refetches). Diff: when `mode === 'diff'` and `char` is non-empty, `getMetaDiff` after the cohort (same abort rules). Layout: `MetaHeader`, filters card, `CohortLine`, then a 12-column grid of result cards (Tasks 12, 13); below 1024px one column; cards enter with `kaskade-karten`.
  - `MetaHeader({ seasonLabel, state, poolSize })`: eyebrow `META`, headline `Meta`, line `Alliance (S14) · Softcore · Paladin · level 80+` (season label from `/builds/seasons`, same text as the header select; `-` while unknown), explainer `What the characters of one build actually wear: the uniques per slot, the affixes on their rares, their charms, skills and mercs, across every matching level 80+ ladder character.`
  - `MetaFilters({ state, onChange })` inside a `karte`:
    - `Segment` `Build guide | Diff my character` (`mode`).
    - Diff mode: `SearchField` label `Character or account name` + primary `Compare` capsule; Enter or click commits `char` (typing alone does not refetch, ruling: a name is a lookup, not a filter).
    - Class: 7 capsule buttons with class icon and name, `aria-pressed`, single select; changing class clears `skills`.
    - Presets: one `Chip`-sized capsule per `BUILD_PRESETS[className]` entry, tier letter in a mono well square before the name, `aria-pressed` via `isPresetActive`; click sets `skills` to the preset skills at `PRESET_MIN_LEVEL`, clicking the active preset clears skills.
    - Min level: native `<input type="range" min=80 max=99 step=1>` styled like `GearBudget` (well track, `glow` fill, knob spring `--feder-zackig`), label `Level 85+`, `aria-valuetext` equal to the label, commits after 250 ms.
  - `SkillPicker({ state, onChange })`: fetches `getSkillUsage({ gameMode, className, minLevel }, state.skills)` on class/mode/skill-name change (abort previous); `SearchField` `Search skills...`; top 12 rows then `Show all N`; each row a `<button aria-pressed>` with skill icon, name, `Bar` at `pct`, `formatPct`; selected skills as chips `Blessed Hammer 20+` with a mono `<input type="number" min=1 max=99 aria-label="Minimum hard points for Blessed Hammer">` (commit on blur or Enter) and a remove button.
  - `CohortLine({ meta, state })`: `1,234 characters match` (mono), `of 5,678 Paladins` when `skills.length > 0`, secondary link `See characters ›` -> `buildsHrefFromMeta(state)`, caption `Prices updated 3m ago` from `pricesComputedAt` via `formatAgo` (hidden when null). Zero: `0 characters match` plus `Try fewer skills or a lower level.`
  - No Generate and no Reset button (spec 4.2 ruling). A ghost `Clear skills` appears next to the skill chips when any are set.

- [ ] **Step 1: Write failing tests** (mock `next/navigation`, `fetch`, fake timers): rendering `/?className=Paladin&gameMode=hardcore&minLevel=85` requests `/meta?...classes=Paladin&minLevel=85...gameMode=hardcore` once after 300 ms; three skill clicks within 300 ms produce exactly one `/meta` request; a slow first response resolved after a fast second one does not replace the second (fixture `poolSize` 111 vs 222, screen shows `222 characters match`); clicking `Sorceress` calls `router.replace` with `className=Sorceress` and no `skills`; clicking an active preset clears skills; the min level range set to 90 updates the URL after 250 ms with `minLevel=90`; diff mode: typing a name makes no `/meta/diff` request until `Compare`; with skills set the line shows `of 5,678 Paladins`; `See characters` href contains `classes=Paladin`; there is no button named `Generate`; no element with the old mode buttons `Hardcore`/`Softcore` exists inside the Meta body; an old link with `skills=notjson` renders without throwing.
- [ ] **Step 2:** Run `npx vitest run src/components/meta/frame.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement; replace `src/app/page.tsx`. The old `src/components/*.tsx` files are now unused (deleted in Task 14).
- [ ] **Step 4:** Run tests, `npm test`, `npm run typecheck`, `npm run build` (export has `out/index.html` and `out/meta/index.html`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Meta tab frame with live filters on the meta endpoint`.

---

### Task 12: Result cards: average stats, top items with prices, affixes, charms

**Files:**
- Create: `src/components/meta/{AvgStatsCard,TopItemsCard,ItemPriceTip,AffixCard,CharmsCard}.tsx`
- Modify: `src/components/meta/MetaView.tsx` (wire cards)
- Test: `src/components/meta/cards.test.tsx`

**Interfaces:**
- Consumes: `MetaCohort` fields, `acrossSlots`, `useItemsData`, `ItemIcon`, `qualityClass`, `formatHr`, `formatPct`, `formatCount`, `buildMarketUrl` (`src/lib/price/marketUrl.ts`) with `uniqueId` from `data/unique-ids.json` (imported directly), lx `Card`, `Segment`, `Bar`, `Tooltip`.
- Produces (every card a `karte` with a 20px/600 title; tables inside use `tabelle` on `mat-thick`):
  - `AvgStatsCard({ core, avg })`: title `Average build stats`; 6 core tiles (label caption, mono value `Math.round`), then `Top stats from gear and charms` list: label, mono `avgValue` (1 decimal below 10, else integer) + `suffix`, caption `on 82% of characters` (`pctOfChars * 100`). Empty `avg`: `No gear stats for this cohort.`
  - `TopItemsCard({ data, gameMode })`: title `Top items by slot`; 9 groups in `META_SLOTS` order with capitalised slot name; rows: `ItemIcon` (item art from `invCode`), quality-coloured name wrapped in `ItemPriceTip`, type caption, mono count, `Bar` + `formatPct(pct)`, price capsule `formatHr(price.medianHr) + ' HR'` or `n/a`, for runewords a caption `Runes 0.52 HR` (`Runes ~0.52 HR` when `runeCostEstimated`); when `price` is null and rune cost exists the rune cost becomes the capsule value with the `~`/`Runes` caption; `Market` ghost link (`target="_blank" rel="noopener"`) always present. Empty slot: `No unique, set or runeword items in this slot.`
  - `ItemPriceTip({ item, gameMode, itemsData, children })`: lx `Tooltip` (`mat-chrome`, 16px radius) on hover and focus: quality-coloured name, attribute lines from `items.json` (`afterAttributes ?? beforeAttributes`, comma-split), price block `Median 0.34 HR` + `12 sold in the last 7 days` / `7 open asks in the last 7 days` / `No price yet`, rune block for runewords: `Ber + Ist + ...` and one mono row per rune (`n/a, counted as 0.01` for null), total. No network request on hover.
  - `AffixCard({ data })`: title `Most common affixes`, caption `Magic, rare and crafted items only.`; `Segment` `By slot | All slots`. By slot: 9 groups, header `Helm · 812 items`, rows label, mono count, `formatPct(pct * 100)`, mono median and p75 (column heads `Median`, `P75`); empty group text `No magic, rare or crafted items in this slot.` All slots: `acrossSlots(data)` rows label, count, `% of items`.
  - `CharmsCard({ data })`: title `Charm patterns`; tiles `Charms per character` (`avgCount` 1 decimal), `Annihilus`, `Hellfire Torch`, `Gheed's Fortune` (each `formatPct(pct * 100)` + count caption); two lists `Grand charms` (`topGcMods`) and `Small and large charms` (`topScMods`): label, mono count, `formatPct(pct * 100)` (values over 100% allowed). Empty: `No charms in this cohort.`

- [ ] **Step 1: Write failing tests** with a fixed `MetaCohort` fixture: top items show `Harlequin Crest` with `75%` and `0.30 HR`; an unpriced unique shows `n/a` and still has a `Market` link whose href starts `https://www.projectdiablo2.com/market?` and contains `item.unique.id=` when the id is known; a runeword with `price null`, `runeCostHr 0.52`, `runeCostEstimated true` shows `~0.52 HR`; focusing an item name shows its first items.json attribute line and `12 sold in the last 7 days`; a rune row with `medianHr null` shows `n/a, counted as 0.01`; affix by slot shows `Median` and `P75` columns with the fixture values; switching to `All slots` shows the across-slots totals; charm tile `Annihilus` shows `41%`; a charm mod with `pct 1.5` shows `150%`; an all-empty cohort renders every card's empty text and no `NaN` anywhere in the document text.
- [ ] **Step 2:** Run `npx vitest run src/components/meta/cards.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire into `MetaView` (grid: Avg stats 5 cols + Top items 7 cols; Affixes 7 + Charms 5; then Task 13 cards).
- [ ] **Step 4:** Run tests, `npm test`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): meta stats, top items with own prices, affix and charm cards`.

---

### Task 13: Build sheet and diff cards

**Files:**
- Create: `src/components/meta/{BuildSheetCard,DiffCard}.tsx`
- Modify: `src/components/meta/MetaView.tsx`
- Test: `src/components/meta/sheet-diff.test.tsx`

**Interfaces:**
- Consumes: `skillUsage`, `skillFrequency`, `levelDistribution`, `mercenary` (Task 7 types), `CharacterDiff`, `SkillIcon`, `ItemIcon`, `qualityClass`, `displayName`, formatters.
- Produces:
  - `BuildSheetCard({ meta })`: title `Build sheet`. Skills: when `skillUsage` is an array, rows with `numAtTwenty > 0` sorted by `pctAtTwenty desc`, split by `role`; `Core skills` shown, ghost toggles `Show synergies (n)` and `Show prerequisites (n)` (prerequisites = rows with `numAtTwenty 0` and `numAsPrereq > 0`), each row skill icon, name, `Bar` at `pctAtTwenty * 100`, mono `20+ on 82%`, caption `any points 97% · avg 18`; top 3 core rows marked with an `--accent-text` left edge. When `skillUsage` is `null`, rows from `skillFrequency` (`pct` 0..100). Level distribution: one bar per level 80..99 (`Bar`-style vertical bars in an inline SVG or flex, mono level ticks, `role="img"` with `aria-label` `Level 80 to 99 distribution, most at 85`). Mercenary: `Top type` value + `Act 2` caption, type list with `formatPct`, merc items by slot (`ItemIcon`, quality-coloured name, `formatPct`). Empty cohort: `No characters match, so there is no build sheet yet.`
  - `DiffCard({ diff, notFoundName, state })`: title `Your character vs the cohort`, line `MC-MEEKS · Level 95 Paladin · Hardcore` (masked name). Per slot row: slot name, your item (quality-coloured) or `-`, pool top or `-`, match chip `Matches the top pick` (ok) / `Differs` (warn) / nothing when either side is missing, then the 5 top affixes as small chips with a check or a muted cross and `formatPct(pct * 100)`. Merc line `Merc: Defensive Auras (cohort: Defensive Auras)` with the same chip logic. Not found: `No character or account named "<name>" this season.` plus link `Track this account` -> `/builds/account?name=<encoded>&season=<s>` (the account page shows the add form when empty).

- [ ] **Step 1: Write failing tests:** with `skillUsage` containing one synergy and one prereq-only row, only core rows show; `Show synergies (1)` reveals the synergy; `Show prerequisites (1)` reveals the prereq row; `skillUsage: null` renders `skillFrequency` names; level chart `aria-label` names the mode level; merc shows `Act 2`; empty cohort shows the empty text; diff with a matching helm shows `Matches the top pick`, a mismatched ring shows `Differs`, an empty slot shows `-` and no chip; a profane character name is masked in the line; not found shows the text and the `Track this account` href with the encoded name; nothing renders the word `pd2-character-downloader`.
- [ ] **Step 2:** Run `npx vitest run src/components/meta/sheet-diff.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire (`DiffCard` at the top of the results in diff mode, `BuildSheetCard` full width last).
- [ ] **Step 4:** Run tests, `npm test`, `npm run typecheck`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): meta build sheet and diff cards`.

---

### Task 14: Retire the old Meta code, D2 theme and Cinzel; footer; README and CLAUDE.md

**Files:**
- Delete: the files listed under "deleted (Task 14)" in File structure, `src/lib/price/parse.test.ts`, `src/lib/kontra/tierStyle.ts` (Task 11 renders tiers without it)
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/builds/ItemIcon.tsx`, `src/components/character/EquipmentGrid.tsx`, `package.json` / `package-lock.json`, `README.md`, `CLAUDE.md`
- Create: `src/components/shell/SiteFooter.tsx`
- Test: `src/components/shell/shell.test.tsx` (footer case), repo-wide checks below

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `globals.css`: only `@import "tailwindcss";` and `@import "./lx.css";` plus the Tailwind `@theme` entries still used (`--font-mono`, `--font-sans` -> Geist); no Cinzel, no `--rarity-*`, no `d2-*`, `rarity-*`, shadcn tokens or imports. `layout.tsx`: no `Cinzel` import or variable; `<body className="lx lx-stage min-h-full flex flex-col">`; metadata title `PD2 Meta`, description `Builds and gear meta for Project Diablo 2 ladder characters.`; renders `<SiteFooter/>` after `children`.
  - `ItemIcon.tsx` and `EquipmentGrid.tsx` rims use `var(--color-q-unique|set|runeword|rare|magic|crafted)` instead of `var(--rarity-*)`.
  - `SiteFooter`: `mat-thin` band, 12px muted text, links underline on hover in `--accent-text`: `Character and market data from the official Project Diablo 2 API.` / `Parts of the code from pd2.tools by Cole Estrin (MIT).` (link `https://github.com/coleestrin/pd2-tools`) / `Item and skill data from the PD2 wiki (CC BY-SA 4.0).` (link `https://wiki.projectdiablo2.com`) / `Build tiers from the Dark Humility tier list via pd2.madebykontra.com.` / `Not affiliated with Project Diablo 2.` / `Feedback: @tekk0n on Discord` / ghost link `Buy me a beer` (`https://www.buymeacoffee.com/SteenC`, owner's existing link).
  - Dependencies removed when `grep -rn "<pkg>" src` finds nothing: `idb-keyval`, `shadcn`, `radix-ui`, `class-variance-authority`, `tw-animate-css`, `lucide-react`; `components.json` deleted. `data/snapshot.json` and its scripts stay (script input only, not bundled). The nightly workflow stays unchanged (it also produces `data/unique-ids.json`, which the Meta market links use); `public/price-snapshot.json` is no longer read by the app.
  - `README.md` rewritten: what pd2meta is (Builds and Meta tabs), architecture (`server/` collector + Postgres + read API on the VPS, web on Vercel), local dev (`npm run dev`, `npm test`, `cd server && npm test`), data sources, static data sync (`node server/scripts/sync-static.js` after refreshing `data/*.json` or `public/runeword-runes.json`), deploy pointer `deploy/RUNBOOK.md`, credits and licences (as footer).
  - `CLAUDE.md`: Stack (Next 16, no IndexedDB), Module boundaries (Meta aggregation is server side in `server/src/api/meta/`; the web only renders; `src/lib/meta/api.ts` and `src/lib/builds/api.ts` are the only network modules), and the Data sources section: live API; prices = own `item_prices` (Unique/Set/Runeword/Rune medians from `market_listings`, hourly, sold preferred); no pd2trader.com; no snapshot fallback; static data copies; tier list as today.

- [ ] **Step 1: Write the failing checks.** `shell.test.tsx`: the footer renders `Not affiliated with Project Diablo 2.` and a link to `https://github.com/coleestrin/pd2-tools`. Repo check script lines (run in Step 4): `grep -rn "pd2trader.com" src` (no match), `grep -rn "idb-keyval\|Cinzel\|d2-panel\|d2-title\|rarity-unique\|--rarity-" src` (no match), `grep -rn "components/ui/" src` (no match).
- [ ] **Step 2:** Run `npx vitest run src/components/shell`. Expected: FAIL.
- [ ] **Step 3:** Delete, edit, `npm uninstall` the unused packages, write footer and docs.
- [ ] **Step 4:** Run the greps (all empty), `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; then `grep -rl "idb-keyval\|pd2trader" out/_next` is empty. Expected: PASS.
- [ ] **Step 5: Commit** `chore(web): retire client aggregation, D2 theme and Cinzel; footer credits; docs`.

---

### Task 15: Deploy, checks, fixtures recapture, merge, sprint close (controller runs this task, not a subagent)

**Files:**
- Modify: `deploy/RUNBOOK.md` (phase 3+4 section), `src/lib/validation/fixtures/*.json` (recaptured) and README table, `CLAUDE.md` (status line), `plan/roadmap.md`

**Interfaces:**
- Consumes: everything above.
- Produces: production API with `/meta` and `/meta/diff`, www.pd2meta.info with the new Meta tab.

- [ ] **Step 1: Server deploy** per `deploy/RUNBOOK.md` (`git archive HEAD server deploy`, put, extract, `docker compose up -d --build`). Migration 004 runs on start. Wait for the collector's next `price job:` log line (runes priced). Add a "Phase 3+4 deploy" section to the runbook: server before web, wait for the price job, run the bench.
- [ ] **Step 2: Verify API:** `select item_type, count(*) from item_prices group by 1` has a `Rune` row count > 10; `curl -s 'https://api.pd2meta.info/api/v1/meta?gameMode=softcore&classes=Paladin' | wc -c` < 200000 and `poolSize > 0`; same with `skills=[{"name":"Blessed Hammer","minLevel":20}]` gives a smaller `poolSize`; a Spirit/Enigma entry has `runeCostHr` not null; `/meta/diff?...&char=<a real name>` 200; `char=NoSuchName123` 404; `/prices?gameMode=softcore` still lists Unique rows; old `/characters/stats/item-usage` unchanged; `/stats` heartbeat fresh, `requestsLastHour <= 3600`. Bench: `docker compose -p pd2meta exec -T api node dist/scripts/meta-bench.js` exits 0 (p95 < 1000 ms, max bytes < 200000); record the numbers in the runbook section. If it fails, stop and report the slowest cohorts before merging.
- [ ] **Step 3: Recapture fixtures:** `npx tsx scripts/refresh-validation-fixtures.ts`, update the README sanity table, run `npx vitest run src/lib/validation --reporter=verbose` and `cd server && npx vitest run test/meta-parity.test.ts --reporter=verbose`: all pass, 0 skipped. Commit `test: recapture validation fixtures from our API`.
- [ ] **Step 4: Headless web check** on `npm run dev` at `http://localhost:3000` against the live API (CORS allows it; previews are SSO-protected), Playwright headless only (`tools/shopify-session` pattern, never a visible browser): `/` loads dark, Meta shows Paladin softcore results without a Generate click; header Hardcore switch refetches Meta; preset click updates results and URL; skill min level edit works; an old link `/?className=Sorceress&skills=[{"name":"Blizzard","minLevel":20}]&gameMode=hardcore&minLevel=85&mode=guide&char=` reproduces that cohort; item tooltip shows our price and rune cost; affix `All slots` view; diff with a real character name; `See characters` lands on `/builds` with class and skills; `/builds` and a character page still work; network log has no request to `pd2trader.com`; theme toggle to light. Screenshot Meta in both themes into the session scratchpad and compare with the look rules (glass over stage, capsules, one accent, no grey-border white cards, no Cinzel).
- [ ] **Step 5: Merge** `sprint/4.3-meta` into `main` (Vercel auto-deploys); repeat the Meta part of Step 4 on `https://www.pd2meta.info/` and one old shared link.
- [ ] **Step 6: Sprint close:** `CLAUDE.md` status line (phases 3 and 4 merged, next phase 5 archive S11 to S13 + parity), `plan/roadmap.md` entry. Commit `docs: sprint 4.3 close` on `main`.

---

## Rulings made in this plan (owner can overturn)

- Phases 3 and 4 ship as one sprint `4.3-meta`; the Meta tab is built once, on the endpoints and in the final look.
- One `GET /meta` returns every Meta aggregate for a cohort (about 20 to 40 KB); diff is a separate `GET /meta/diff` because it needs a name and is rare.
- Meta cohorts use only season, mode, classes, min level and skills; Builds-only filters (items, merc, gear budget) are ignored on `/meta`.
- Aggregation runs in SQL over `character_items.mods` with TypeScript only for labels, slot mapping and cuts; median = `percentile_cont(0.5)`, p75 = `percentile_disc(0.75)`, which reproduce the old JS definitions exactly.
- Static data: committed byte-identical copies in `server/src/core/static/`, synced by `server/scripts/sync-static.js`, drift caught by a test; the Docker build context stays `server/`. Kontra presets stay web-only.
- Old units are kept per field (fractions vs 0..100) so the old tests port unchanged; each type documents its unit.
- Charms and average stats count inventory charms only (stash charms are not stored); the old client counted stash charms too.
- Affix lists drop corrupted/desecrated/mirrored before the top-15 cut, so each slot shows 15 real mods.
- Level distribution respects the cohort's min level (the old view always started at 80).
- Diff prefers the main-hand item over the weapon switch and compares skill-tab affixes by tab, fixing two old misses; lookup order is character name, then account, current mode first.
- Runes are priced from our own market listings as `item_type 'Rune'` with the same thresholds; a rune without a price counts 0.01 HR and marks the rune cost estimated (old fallback kept, now visible).
- The hover price card shows only what we have (median, sample count, sold vs asks, rune breakdown); pd2trader's min, max, 7-day change and corruption prices are dropped.
- Cache warm-up for the 16 base cohorts (2 modes x no class + 7 classes) every 14 minutes keeps the landing cohorts fast; everything else is computed on demand and cached 15 minutes.
- Default Meta mode follows the shared header (softcore when absent); default class stays Paladin; legacy links with explicit `gameMode` keep working.
- The header season/mode switch shows on `/`, `/meta` and `/builds`; Meta has no mode control of its own.
- No Generate or Reset buttons; filters refetch after 300 ms (slider 250 ms); the diff name is committed with `Compare` or Enter.
- Kontra tier letters render as mono text in a well, not the old invented gradients.
- Validation fixtures are recaptured from our API in softcore; parity checks shaping and `/meta` against the stats endpoints of the same API.
- `data/snapshot.json`, its scripts and the nightly workflow stay; the app no longer reads `public/price-snapshot.json`.
