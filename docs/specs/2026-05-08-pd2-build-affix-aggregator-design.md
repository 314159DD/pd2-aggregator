# PD2 Build Affix Aggregator — Design

**Date:** 2026-05-08
**Owner:** Steven Obst
**Status:** Approved (design); revised 2026-05-08 mid-implementation after API reality check.

> **Revision note (2026-05-08):** The original design assumed `GET /api/v1/characters` returned all ~21k tracked characters in one 3.4 MB payload. That was wrong — the endpoint paginates 50 per page, and the full dataset is ~1.4 GB. See the **Revised data layer** section near the bottom of this doc for the corrected architecture. Earlier sections that still apply are unchanged; sections that were affected are marked with `(SUPERSEDED — see Revised data layer)`.

---

## Problem

Project Diablo 2 (a mod for Diablo 2) has very few written build guides. The community-run site [pd2.tools](https://pd2.tools) tracks ~21,000 ladder characters with full gear and skill data, exposed via an unauthenticated public REST API at `https://api.pd2.tools/api/v1`. Filtering that data by class + skills (e.g. Holy Bolt / Fist of the Heavens / Holy Nova / Holy Light Paladin in Hardcore) returns the cohort of players actually running the build — but the site itself doesn't aggregate across that cohort to answer "what gear affixes matter most".

This project builds a personal-use web app that does that aggregation and produces a distilled guide.

## Non-goals

- No writes back to pd2.tools. Read-only consumer.
- No user accounts, no server-side persistence of filters. URL params are the only state.
- No real-time ladder watching. 24-hour snapshot freshness is acceptable.
- No competing with pd2.tools. We consume their public data; we don't replicate their UI.
- No scaling concerns. Single user (the owner). Vercel free tier is sufficient.

## Success criteria

For any given filter (class + skills + gameMode + minLevel), the app produces a single-page guide that answers:

1. Which uniques / sets / runewords are most often equipped, by slot.
2. For magic / rare / crafted gear, which affix mods appear most often, by slot, with median and p75 values.
3. Charm inventory patterns (top GC mods, top SC mods, anni / torch / gheed presence).
4. Build sheet: average skill point allocation, stat allocation, level distribution, mercenary type and gear.

The "Diff my character" mode answers: "given my character's current gear, which top mods am I missing?"

## Architecture

### Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind + shadcn/ui (matches the owner's other projects)
- **State:** URL query params + IndexedDB for the data cache. No server state.
- **Build target:** static export (`output: 'export'`).
- **Hosting:** Vercel free tier.
- **Data store:** none. The api.pd2.tools server is the database.

### Why static export with no backend

The browser hits `api.pd2.tools` directly. CORS verified at design time as `Access-Control-Allow-Origin: *`. The dump fits in a single 3.4 MB JSON response with all gear and skills inline. All filtering and aggregation runs locally in a Web Worker. No server, no DB, no auth, no cost.

### Data flow

```
[ App boot ]
     │
     ▼
data-loader.load()
     │
     ├─ IndexedDB has dump < 24h old? ──► return cached
     │
     ├─ fetch https://api.pd2.tools/api/v1/characters
     │      │
     │      ├─ success → store in IndexedDB w/ timestamp → return
     │      │
     │      └─ fail (network, 5xx) → load /data/snapshot.json fallback
     │
     ▼
[ User submits filter form ]
     │
     ▼
worker.postMessage({ characters, filter, mode })
     │
     ▼
filter() → rank by level desc → take top N → aggregate() → GuideSections
     │
     ▼
[ UI renders cards ]
```

### Repo layout

```
PD2/
├─ CLAUDE.md
├─ docs/
│  └─ specs/
│     └─ 2026-05-08-pd2-build-affix-aggregator-design.md   # this file
├─ data/
│  ├─ snapshot.json                  # 3.4 MB fallback dump, refreshed manually
│  ├─ item-bases.json                # supplemental wiki/source-derived
│  └─ mod-dictionary.json            # affix code → human label
├─ scripts/
│  ├─ refresh-snapshot.ts            # one-shot: GET /characters, write to data/
│  └─ build-mod-dictionary.ts        # one-shot: pull from coleestrin/pd2-tools + pd2 wiki
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  └─ page.tsx                    # filter form + results, mode toggle
│  ├─ lib/
│  │  ├─ data-loader.ts              # only module that touches IndexedDB / network
│  │  ├─ filter.ts                   # pure: (chars, filter) → matched chars
│  │  ├─ aggregate.ts                # pure: (chars) → GuideSections
│  │  ├─ diff.ts                     # pure: (myChar, GuideSections) → DiffSections
│  │  └─ types.ts                    # API response types, mirrors pd2.tools shape
│  ├─ workers/
│  │  └─ aggregate.worker.ts         # runs filter + aggregate off main thread
│  └─ components/
│     ├─ FilterForm.tsx
│     ├─ ItemFrequencyTable.tsx      # section 1
│     ├─ AffixFrequencyTable.tsx     # section 2
│     ├─ CharmPanel.tsx              # section 3
│     ├─ BuildSheet.tsx              # section 4
│     └─ DiffView.tsx                # diff mode output
├─ tests/
│  ├─ aggregate.test.ts
│  ├─ filter.test.ts
│  └─ fixtures/
│     └─ characters.json             # 5–10 fake chars covering edge cases
├─ next.config.js                    # output: 'export'
├─ vitest.config.ts
└─ package.json
```

### Module boundaries

- `lib/data-loader.ts` is the only module that touches IndexedDB or the network. Returns `Promise<Character[]>`.
- `lib/filter.ts`, `lib/aggregate.ts`, `lib/diff.ts` are pure functions — no I/O. Trivially unit-testable.
- The web worker is the only place async aggregation happens. The main thread stays responsive.
- Reference data (`mod-dictionary.json`, `item-bases.json`) is imported as JSON. Never fetched at runtime.

## Data layer (SUPERSEDED — see Revised data layer)

### Live API

| Endpoint                              | Used for                              |
| ------------------------------------- | ------------------------------------- |
| `GET /api/v1/characters`              | Full dump (3.4 MB, ~21k characters). Sole runtime source. |
| `GET /api/v1/characters/stats/skill-usage` | Optional sanity-check overlay on the build sheet |

We deliberately do **not** call per-character or per-account endpoints. The `/characters` dump contains every field we need for every character, and it caches well.

### Character record shape (verified at design time)

```ts
type Character = {
  accountName: string;
  character: {
    name: string;
    level: number;
    class: { id: number; name: string };
    life: number; mana: number;
    gold: { stash: number; total: number; character: number };
    points: { stat: number; skill: number };
    skills: Array<{ id: number; name: string; level: number }>;
  };
  realSkills: Array<{ name: string; level: number }>;  // gear-boosted skill levels
  items: Item[];
  mercenary: Mercenary;
  file: { header: number; version: number; checksum: number; filesize: number; updated_at: number };
  lastUpdated: number;
};
```

(Full type derivation happens during `lib/types.ts` implementation by sampling the response.)

### Caching strategy

- IndexedDB store: `pd2-cache`, single key `characters-dump`, value `{ data: Character[]; fetchedAt: number }`.
- TTL: 24 hours. Stale → refetch in background, serve stale immediately if available.
- Hard fallback: `data/snapshot.json` shipped with the static build, used when both cache and live fetch fail.

### Snapshot refresh

`scripts/refresh-snapshot.ts` is a Node script run manually before deploys:

```
ts-node scripts/refresh-snapshot.ts
git add data/snapshot.json
git commit -m "Refresh snapshot"
```

Kept manual on purpose — no Vercel cron, no GitHub Action. If the snapshot is more than 7 days old at app boot, the UI shows a soft warning.

## The mod dictionary

The single hardest piece of the project. Each item in the API dump has a list of properties in compact form. We need a lookup from `mod_id` (or whatever the dump uses) to human-readable label, format string, and value-bucket logic.

### Build pipeline

`scripts/build-mod-dictionary.ts` runs once (and again when PD2 patches change mods). It:

1. Clones `coleestrin/pd2-tools` from GitHub. Reads its TypeScript label maps. Subject to license check (LICENSE file inspected — if MIT/Apache, we copy; if GPL, we treat as reference and re-derive from the pd2 wiki).
2. Scrapes the relevant pd2 wiki pages (`wiki.projectdiablo2.com/wiki/...`) for any mods not covered by step 1, plus item base stats and unique/set/runeword definitions.
3. Merges into `data/mod-dictionary.json` with the shape:

```ts
type ModDictionary = Record<string, {
  label: string;          // "Faster Cast Rate"
  format: string;         // "{value}% Faster Cast Rate"
  category: "stat" | "skill" | "resist" | "damage" | "utility";
  itemSlots?: string[];   // slots this mod can roll on
}>;
```

4. Prints a coverage report: count of distinct mod IDs found in `data/snapshot.json` and which ones have no dictionary entry. Coverage gaps must be addressed before shipping each release.

### Reference data sources, in priority order

1. **`coleestrin/pd2-tools` source** — authoritative; it's what the live site uses to render.
2. **PD2 wiki** (`wiki.projectdiablo2.com`) — fills gaps, especially PD2-specific items and balance changes.
3. **Owner's manual entries** — only as a last resort, in a separate `data/mod-dictionary.overrides.json` to keep them auditable.

## Filtering

`lib/filter.ts` exposes:

```ts
type Filter = {
  gameMode: "hardcore" | "softcore";
  className: string;
  skills: Array<{ name: string; minLevel: number }>;  // hard-allocated points only
  minCharLevel: number;
  topN: number;
};

function filter(chars: Character[], f: Filter): Character[];
```

Match logic mirrors pd2.tools: a character matches if it has the requested class, the requested gameMode, ≥ minCharLevel, and **every** named skill at ≥ that skill's minLevel (using `character.skills`, the hard-allocated levels — not `realSkills`).

After filtering, characters are sorted by `character.level` descending and the top `topN` are taken (default 100). The owner can change topN via the form.

## Aggregation (PARTIALLY SUPERSEDED — most sections come from server endpoints; only affix mods and charms are aggregated client-side)

`lib/aggregate.ts` produces:

```ts
type GuideSections = {
  topItemsBySlot: Record<Slot, Array<{ baseName: string; itemName: string; type: ItemType; count: number; pct: number }>>;
  affixModsBySlot: Record<Slot, Array<{ modId: string; label: string; count: number; pct: number; medianValue: number; p75Value: number }>>;
  charms: {
    avgCount: number;
    annihilus: { count: number; pct: number };
    torch: { count: number; pct: number };
    gheeds: { count: number; pct: number };
    topGcMods: Array<{ label: string; count: number; pct: number }>;
    topScMods: Array<{ label: string; count: number; pct: number }>;
  };
  build: {
    skillPoints: Array<{ skillName: string; avgPoints: number; medianPoints: number }>;
    stats: { str: number; dex: number; vit: number; energy: number };  // averages
    levelDistribution: Array<{ level: number; count: number }>;
    mercenary: {
      topType: string;
      typeCounts: Record<string, number>;
      topItems: Record<MercSlot, Array<{ baseName: string; itemName: string; count: number; pct: number }>>;
    };
  };
  poolSize: number;  // n
};
```

### Aggregation rules

- For each item in a matched character's inventory:
  - If unique / set / runeword → bump `topItemsBySlot[slot]` by item identity. Its mods are fixed and not aggregated as affixes.
  - If magic / rare / crafted → for each of its mods, bump `affixModsBySlot[slot][modId]` and append the value to a list for median/p75 computation.
- Charms (slot = inventory): bump `charms.topGcMods` / `topScMods` based on `cm2` vs `cm1` base codes. Annihilus / torch / gheed checked by unique-item identity.
- Skill points: average and median across the matched pool, top 6 skills by average shown.
- Stats: averages of `character.stats` (post-base, post-gear). The exact field name is verified during implementation (the dump has the data; the path may need adjustment).
- Level distribution: histogram by character level.
- Mercenary: type counts; per-merc-slot item-frequency table.

### Item slots

```
helm | armor | weapon | offhand | gloves | belt | boots | amulet | ring
```

Two ring slots are merged into one bucket (rings are interchangeable). Charms are not a slot — they're aggregated separately in the `charms` block. Mercenary slots are tracked separately under `build.mercenary.topItems`.

## UI

### Page layout

Single page at `/`. Mode toggle at the top selects between **Build a guide** and **Diff my character**.

```
┌──────────────────────────────────────────────────────────────┐
│  PD2 Build Affix Aggregator                          [About] │
├──────────────────────────────────────────────────────────────┤
│  MODE: (•) Build a guide   ( ) Diff my character             │
├──────────────────────────────────────────────────────────────┤
│  FILTERS                                                     │
│  Game Mode: ( ) Softcore  (•) Hardcore                       │
│  Class:     [ Paladin ▼ ]                                    │
│  Skills:    [+ Holy Bolt 20] [+ FoH 20] [+ Holy Nova 20]    │
│             [+ Holy Light 20]   [Add skill ▼]                │
│  Min char level: [────●──── 75 ]                             │
│  Top N:          [────●──── 100 ]                            │
│  [ Generate Guide ]                                          │
├──────────────────────────────────────────────────────────────┤
│  Matched: 184 characters → analyzing top 100                 │
│  Data freshness: live (fetched 4 min ago)                    │
├──────────────────────────────────────────────────────────────┤
│  ▼ TOP EQUIPPED ITEMS BY SLOT          (n=100)               │
│  ▼ MOST COMMON AFFIX MODS              (n=100)               │
│  ▼ CHARM PATTERNS                      (n=100)               │
│  ▼ BUILD SHEET (skills + stats + merc) (n=100)               │
└──────────────────────────────────────────────────────────────┘
```

### URL state

Filter form syncs to URL query params: `?mode=guide&gameMode=hardcore&class=Paladin&skills=...&minLevel=75&topN=100`. Bookmarkable, shareable.

### Component responsibilities

| Component                | Renders                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `FilterForm`             | Mode toggle, all filter inputs, submit button. Owns URL sync.           |
| `ItemFrequencyTable`     | One table per slot. Click row → expand to show that item's fixed mods.  |
| `AffixFrequencyTable`    | One sub-table per slot with rare/crafted volume. Top 5 highlighted.     |
| `CharmPanel`             | Header counters (anni/torch/gheed), two side-by-side mod tables.        |
| `BuildSheet`             | Skill bar chart, stat allocation, level histogram, merc block.          |
| `DiffView`               | Active in diff mode. Side-by-side: user's gear vs pool's top mods, gaps highlighted. |

### UX rules

- Every percentage shows the absolute count on hover.
- Every section header shows pool size (`n=100`).
- Loading state while the worker runs (typically <500 ms).
- Empty-state messages when a filter matches zero characters.

### Diff mode

User pastes their character name OR account name. We search the cached dump for a match (by `character.name` or `accountName`, case-insensitive). 

- **Found:** render `DiffView`. For each section, show the pool's top result alongside the user's value, highlighting gaps. Examples:
  - Helm slot: pool top = "Crown of Ages" (62%). User has "Andariel's Visage". Show as a notable difference, not a recommendation.
  - Ring affix mods: pool top 5 = [FCR, Mana, AllRes, Life, Str]. User's two rings have [FCR, Life]. Show "missing: Mana, AllRes, Str" in red.
  - Skill points: pool average for Fist of the Heavens = 28. User has 20. Show delta.
- **Not found:** message: "Your character isn't in the pd2.tools dataset. Push it via [pd2-character-downloader](https://github.com/coleestrin/pd2-character-downloader) so it appears here."

## Testing

- **`tests/aggregate.test.ts`** — vitest. Hand-craft a 5–10-char fixture covering: matched and unmatched chars, multiple item types per slot, charms with overlapping mods, edge cases (zero matches, single match, all-same-item slot). Assert the four aggregator outputs.
- **`tests/filter.test.ts`** — same fixture, assert class / gameMode / skill-minLevel / charLevel filtering produces the right subset.
- **Mod-dictionary coverage check** — `scripts/build-mod-dictionary.ts` prints a coverage report. CI-style assertion: every mod_id present in `data/snapshot.json` must have a dictionary entry, or the build fails.
- **No E2E / browser tests.** Personal tool; the owner sees breakage himself.

## Deploy

- Vercel project pointed at the repo. Default `next build && next export`. Custom domain optional.
- `scripts/refresh-snapshot.ts` runs locally before deploys. Kept manual.
- Pre-commit (optional): typecheck + vitest.

## Risks and open questions

| Risk                                                       | Mitigation                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mod dictionary completeness (PD2-specific mods)            | Coverage report in `build-mod-dictionary.ts`. Manual `mod-dictionary.overrides.json` for last-resort fills. |
| `coleestrin/pd2-tools` license incompatible with copying   | Read LICENSE before copying. If GPL, treat as reference only and re-derive from the wiki.                   |
| api.pd2.tools schema changes (mod IDs renamed in a patch)  | Snapshot test pinning known mod_id → label. Fails loud on rename.                                           |
| Owner's character not in the public dump                   | Surface a clear "push your character via pd2-character-downloader" message in diff mode. Out of v1 scope to fetch from elsewhere. |
| `character.stats` field path uncertain                     | Verified during implementation by sampling the response. Fall back to skill-only build sheet if absent.     |

## Phase 2 (out of scope)

- Save filters server-side. (Requires backend.)
- Push owner's character to the dataset from inside the app. (Use the upstream tool instead.)
- Multi-build comparison view.
- Track build meta over time (snapshot diff between weekly captures).

## License decision (deferred to implementation)

`coleestrin/pd2-tools` LICENSE inspected at first task of implementation. Decision recorded in `docs/decisions/<date>-pd2-tools-license.md`.

Result (2026-05-08): **MIT**. We may copy mod-label maps and item-base data from `coleestrin/pd2-tools` directly with attribution.

---

## Revised data layer (2026-05-08, supersedes earlier "Data layer" section)

### What we learned at implementation time

`GET /api/v1/characters` paginates 50 records per page. Full dataset = ~424 pages × 3.4 MB ≈ 1.4 GB. Fetching the whole thing client-side is not viable.

Server-side filters on `/characters` are partial:
- `?gameMode=hardcore|softcore` — works (drops total from ~21k to ~4.5k for HC).
- `?minLevel=N` — works.
- `?className=...`, `?requiredSkills=...` — silently ignored.

But the API also exposes **server-side aggregate endpoints** that DO accept the full filter set including `className`. These return tiny pre-aggregated JSON.

### Endpoint inventory (verified at implementation time)

| Endpoint                                     | Filters accepted                              | Returns                                        | Size       |
| -------------------------------------------- | --------------------------------------------- | ---------------------------------------------- | ---------- |
| `/api/v1/characters/stats/item-usage`        | `gameMode`, `className`, `minLevel`           | `[{item, itemType, numOccurrences, totalSample, pct}]`     | ~50 KB     |
| `/api/v1/characters/stats/skill-usage`       | `gameMode`, `className`, `minLevel`           | `[{name, numOccurrences, totalSample, pct}]`   | ~18 KB     |
| `/api/v1/characters/stats/merc-item-usage`   | `gameMode`, `className`, `minLevel`           | merc gear frequency table                      | ~tiny      |
| `/api/v1/characters/stats/merc-type-usage`   | `gameMode`, `className`, `minLevel`           | merc type frequency                            | ~tiny      |
| `/api/v1/characters/stats/level-distribution`| `gameMode`, `className`                       | level histogram (separate softcore/hardcore arrays) | ~1 KB      |
| `/api/v1/characters?gameMode=&minLevel=&page=` | `gameMode`, `minLevel`                       | 50 raw chars per page                          | ~3.4 MB/pg |
| `/api/v1/characters/accounts/{accountName}`  | path                                          | one account's characters                       | varies     |
| `/api/v1/statistics/character-counts`        | none                                          | `{hardcore, softcore}` totals                  | ~30 B      |

### Hybrid approach

Three sections of the guide come straight from server aggregates — zero local computation:

| Guide section                           | Source                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Top equipped items by slot              | `/characters/stats/item-usage` + a small slot lookup over the returned itemType |
| Build sheet — skill points              | `/characters/stats/skill-usage` (top 6 by pct)                                  |
| Build sheet — level distribution        | `/characters/stats/level-distribution`                                          |
| Build sheet — mercenary type            | `/characters/stats/merc-type-usage`                                             |
| Build sheet — mercenary items           | `/characters/stats/merc-item-usage`                                             |

Two sections still need raw character data — the API doesn't aggregate them server-side:

| Guide section            | Source                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Most common affix mods   | Sampled raw chars (5 pages × 50 = 250 raw records, filtered by `gameMode`+`minLevel` server-side, then by `className`+skill levels client-side, then aggregated locally). |
| Charm patterns           | Same sampled raw set as above.                                                                                                                                        |

Sample size is a knob: 5 pages = ~250 raw chars = ~17 MB total payload, ~70–100 matches for a given class+skill combo (enough for percentage stats with ±5% confidence). User can crank it up via a UI knob if they want tighter numbers.

### Revised module map

```
src/
├─ lib/
│  ├─ api.ts             # Thin HTTP client. One function per endpoint. Pure I/O.
│  ├─ data-loader.ts     # Orchestrates: server aggregates + sampled raw fetch + IndexedDB cache.
│  ├─ filter.ts          # Pure: filters the sampled raw set by className+skills+charLevel.
│  ├─ slot.ts            # Maps itemType / item location → slot enum.
│  ├─ aggregate/
│  │  ├─ affixMods.ts    # Pure: aggregates affix mods from filtered raw chars.
│  │  └─ charms.ts       # Pure: aggregates charm patterns from filtered raw chars.
│  ├─ shape/
│  │  ├─ topItems.ts     # Pure: shapes /item-usage response into UI rows + slot bucketing.
│  │  ├─ buildSheet.ts   # Pure: shapes /skill-usage, /level-distribution, /merc-* into one card.
│  │  └─ index.ts        # Re-exports.
│  └─ diff.ts            # Pure: diffs a single character's items vs the guide sections.
└─ workers/
   └─ aggregate.worker.ts  # Runs filter + affixMods + charms only. The shape/* fns run on main thread (cheap).
```

### Caching strategy (revised)

- **Server-aggregate endpoints** are cheap (≤50 KB, fast). Cache per-filter-combo in IndexedDB with a 1h TTL. Filter changes typically invalidate.
- **Sampled raw set** is the expensive call (~17 MB). Cache per `(gameMode, minLevel, samplePages)` key in IndexedDB with a 24h TTL.
- **Per-account character** (diff mode) cached per accountName for 1h.
- **Snapshot fallback** is a small JSON checked into the repo (5 pages of HC chars at minLevel 80) used when the network is unreachable. It's smaller now — ~17 MB instead of the original 1.4 GB nonsense.

### Diff mode (revised)

User pastes a name (character or account). Lookup order:
1. Try `/characters/accounts/{name}` — 200 → render diff against the active filter's guide.
2. If 404, search the cached sampled raw set for `character.name` matching case-insensitively.
3. If still no match, surface the "push your character via pd2-character-downloader" message.

This is more robust than the original local-search-only plan because we now hit the per-account endpoint first, which works even if the user's character isn't in our sampled subset.

### Open issues with revised approach

- **affixMods + charms accuracy depends on sample size.** With 250 raw chars filtered to ~80 of the right class, percentages have ~±5% confidence. UI surfaces this as "n=80" so the user knows. Knob to fetch more pages if they want tighter numbers.
- **Server aggregates may not match client filtering exactly.** The server-aggregate endpoints don't accept `requiredSkills`, so the item-usage table reflects ALL Paladins at minLevel ≥ X, not just Paladins running this exact skill loadout. We surface this distinction in the UI ("Top items across all HC Paladins ≥ L80, n=3491; affix-mod stats below filtered to skill match, n=80"). Not perfect but transparent.

