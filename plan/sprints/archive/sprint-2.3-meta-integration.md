# Sprint 2.3 — Meta integration into pd2.tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Branch (planning artifacts only):** `sprint/2.3-meta-integration` in `PD2/` repo
**Branch (actual implementation):** `feature/meta-build-aggregator` in `pd2-tools-fork/`
**Spec:** [`docs/specs/2026-05-11-sprint-2.3-meta-integration-design.md`](../../docs/specs/2026-05-11-sprint-2.3-meta-integration-design.md)

**Goal:** Ship a `/meta` build-aggregator page on pd2.tools as one cohesive PR — feature-parity with `pd2-aggregator.vercel.app`, adopting their Mantine UI, replacing public-API client fetches with direct Postgres aggregations via a new Express endpoint.

**Architecture:** Port pure logic + data files unchanged from `PD2/src/lib/` and `PD2/data/` to the fork's `web/src/lib/` and `web/src/data/`. Rewrite UI components from Tailwind+shadcn to Mantine v7. Replace browser→public-API with browser→React Query→Express→Postgres. Sprint 2.2's parity tests reborn as Jest+supertest backend integration tests.

**Tech Stack:**
- **Fork frontend:** Vite 5 + React 18 + TypeScript + React Router v7 + Mantine v7 + `@tanstack/react-query` v5 + `mantine-react-table` + `@tabler/icons-react`
- **Fork backend:** Express 4 + raw `pg` (no ORM) + Redis (via `autoCache(seconds)` middleware) + Jest + supertest
- **Workflow:** Two-repo setup — `PD2/` for planning, `pd2-tools-fork/` for implementation

**Important — Where work happens:**
- **Planning + spec + this plan file:** edited in `C:\Coding\III____Full_Circle\PD2` on branch `sprint/2.3-meta-integration`
- **All code from Task 3 onward:** edited in `C:\Coding\III____Full_Circle\pd2-tools-fork` on branch `feature/meta-build-aggregator`
- **Never edit `PD2/src/` source files in this sprint.** The standalone stays as-is; only its plan docs get updated.

---

## File Structure

### In `pd2-tools-fork/` (the implementation)

**Backend — new files:**

| Path | Responsibility |
|---|---|
| `api/src/routes/meta.ts` | Express Router for `/meta`. One GET handler. `autoCache(900)` middleware. Calls into `metaDB`. |
| `api/src/database/postgres/meta.ts` | Raw `pg` queries: cohort filter + item-usage + skill-usage + merc-type-usage + merc-item-usage + level-distribution aggregations. |
| `api/src/types/meta.ts` | Request + response types: `MetaQuery`, `MetaResponse`, `ItemUsageRow`, `SkillUsageRow`, `MercTypeUsageRow`, `LevelDistribution`. |
| `api/src/routes/meta.test.ts` | Jest + supertest integration tests — 7 canonical builds × 5 assertions each (parity tests reborn). |
| `api/src/database/postgres/meta.test.ts` | Unit tests for the DB module's query helpers (filter param sanitization, etc.). |

**Backend — modified files:**

| Path | Change |
|---|---|
| `api/src/routes/index.ts` | Register `router.use("/meta", metaRoutes)`. |
| `api/src/database/index.ts` | Export `metaDB`. |
| `api/src/types/index.ts` | Re-export meta types. |

**Frontend — new files:**

| Path | Responsibility |
|---|---|
| `web/src/pages/Meta.tsx` | Top-level page component, mirrors `Builds.tsx` shape. Composes filter + results sections. |
| `web/src/components/meta/FilterForm.tsx` | Class selector + game mode + min-level + skill picker + build preset row. Mantine. |
| `web/src/components/meta/BuildSheet.tsx` | Skill frequency table (with prereq classification toggle), level distribution, mercenary section. Mantine. |
| `web/src/components/meta/ItemFrequencyTable.tsx` | Per-slot top items. Uses `mantine-react-table`. |
| `web/src/components/meta/AffixFrequencyTable.tsx` | Per-slot affix mods with avg/median/p75. Mantine. |
| `web/src/components/meta/CharmPanel.tsx` | Charm patterns aggregation display. Mantine. |
| `web/src/components/meta/DiffView.tsx` | Per-slot diff between user character and pool top items. Mantine. |
| `web/src/components/meta/DataFreshness.tsx` | "Source: live / cached, fetched at: X" badge. Mantine. |
| `web/src/components/meta/MatchBanner.tsx` | "Characters found: N of M" header. Mantine. |
| `web/src/api/meta.ts` | Typed wrapper around the `/api/meta` endpoint using the existing `APIClient` pattern. |
| `web/src/hooks/useMetaData.ts` | React Query hook returning the meta response with loading/error state. |
| `web/src/lib/shape/buildSheet.ts` | Build sheet shaper (ported). |
| `web/src/lib/shape/topItems.ts` | Top items by slot shaper (ported). |
| `web/src/lib/filter.ts` | Pure client-side filter (ported — used for diff lookup). |
| `web/src/lib/diff.ts` | Per-slot diff function (ported). |
| `web/src/lib/slot.ts` | `slotFromItemName` + `slotFromRawItem` (ported). |
| `web/src/lib/buildPresets.ts` | Build presets module (ported). |
| `web/src/lib/types.ts` | `Character`/`Item`/`UiState` shared types (ported). |

**Not ported** — aggregation moved to the backend, so `aggregate/affixMods.ts`, `aggregate/avgStats.ts`, `aggregate/charms.ts`, `aggregate/skillUsage.ts`, `aggregate/types.ts`, and `aggregate/index.ts` stay in `PD2/` only. The fork consumes server-aggregated rows. See Task 14 Step 4.
| `web/src/data/skill-prereqs.json` | Skill prereq + synergy data (copied from PD2). |
| `web/src/data/item-slots.json` | Item name → slot map (copied from PD2). |
| `web/src/data/builds.json` | Canonical build presets (copied from PD2). |
| `web/src/data/mod-dictionary.json` | Affix mod dictionary (copied from PD2). |
| `web/src/config/url-state.ts` | URL params ↔ filter state (ported, may rename to fit their config dir). |

**Frontend — modified files:**

| Path | Change |
|---|---|
| `web/src/App.tsx` | Import `Meta` page + `<Route path="/meta" element={<Meta />} />`. |
| `web/src/components/layout/NavBar.tsx` | Add "Meta" menu entry. |
| `web/src/config/api.ts` | Add `META: '/meta'` to `API_ENDPOINTS`. |

### In `PD2/` (planning artifacts only)

- `plan/sprints/sprint-2.3-meta-integration.md` — this file
- `docs/specs/2026-05-11-sprint-2.3-meta-integration-design.md` — design spec (already written)
- At sprint close: archive this file, update `plan/roadmap.md`, update `CLAUDE.md` status line.

---

## Task 1 — Fork on GitHub (manual, Steven)

**Files:** none (GitHub UI action)

- [x] **Step 1: Fork the upstream repo**

Go to https://github.com/coleestrin/pd2-tools and click **Fork**. Choose `314159DD` as the owner. Keep the default name `pd2-tools`. Untick "Copy the main branch only" if you want all branches (not needed for this sprint).

- [x] **Step 2: Verify the fork exists**

Visit https://github.com/314159DD/pd2-tools. Confirm it's there and shows "forked from coleestrin/pd2-tools".

- [x] **Step 3: Confirm done**

Report back. Next task clones it locally.

---

## Task 2 — Clone fork + local dev verify

**Files:** none in PD2/. Creates new directory `C:\Coding\III____Full_Circle\pd2-tools-fork`.

- [x] **Step 1: Clone the fork**

```bash
cd "C:/Coding/III____Full_Circle"
git clone https://github.com/314159DD/pd2-tools.git pd2-tools-fork
cd pd2-tools-fork
```

- [x] **Step 2: Add upstream remote**

```bash
git remote add upstream https://github.com/coleestrin/pd2-tools.git
git remote -v
```

Expected output:
```
origin    https://github.com/314159DD/pd2-tools.git (fetch)
origin    https://github.com/314159DD/pd2-tools.git (push)
upstream  https://github.com/coleestrin/pd2-tools.git (fetch)
upstream  https://github.com/coleestrin/pd2-tools.git (push)
```

- [x] **Step 3: Install backend dependencies**

```bash
cd api
npm install
```

Expected: clean install (no high-severity audit warnings that block).

- [x] **Step 4: Install frontend dependencies**

```bash
cd ../web
npm install
```

- [x] **Step 5: Check `.env.example` for required environment variables**

```bash
cat ../.env.example
```

Note all required env vars (Postgres connection, Redis, etc.). If a `.env` doesn't exist at repo root, copy `.env.example` to `.env` and ask Steven for the dev credentials (we may need to either point at a dev/staging DB they share, or stand up a local Postgres with seed data).

- [x] **Step 6: Try `docker-compose up`**

```bash
cd ..
docker-compose up
```

Expected: Postgres + Redis + api + web all come up. Frontend reachable at `http://localhost:4173`.

If docker-compose fails (network errors, Windows path issues, missing env vars): STOP and report BLOCKED. We need a working local environment before we can build anything.

- [x] **Step 7: Manual smoke test**

Open `http://localhost:4173` in a browser. Click around — verify `/builds`, `/economy`, `/statistics`, `/leaderboard` all load. Verify the navbar renders. Verify API calls in the network tab return data (this proves the local Postgres has seed data).

- [x] **Step 8: Commit nothing yet, just confirm setup**

Report back with: clone path, npm install results, docker-compose status, smoke test screenshots/notes. No commits until Task 3.

---

## Task 3 — Create branch + skeleton route registration

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/pages/Meta.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/NavBar.tsx`

- [x] **Step 1: Create feature branch**

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork"
git checkout main
git pull origin main  # ensure latest
git checkout -b feature/meta-build-aggregator
```

- [x] **Step 2: Create placeholder `Meta.tsx`**

Create `web/src/pages/Meta.tsx`:

```tsx
import { Container, Title, Text } from "@mantine/core";
import { Helmet } from "react-helmet-async";

export default function Meta() {
  return (
    <Container size="xl" py="md">
      <Helmet>
        <title>Meta — PD2 Tools</title>
        <meta
          name="description"
          content="Build aggregator: top gear, affixes, and charms used by Project Diablo 2 ladder players for a given class and skills."
        />
      </Helmet>
      <Title order={1} mb="sm">
        Meta
      </Title>
      <Text c="dimmed">Build aggregator — coming soon.</Text>
    </Container>
  );
}
```

- [x] **Step 3: Register the route in App.tsx**

Read `web/src/App.tsx` to find the existing `<Routes>` block. Add an import for `Meta` (matching the style of existing page imports, likely lazy-loaded with `React.lazy` — match what other pages do). Add `<Route path="/meta" element={<Meta />} />` in the appropriate position (typically after `/builds`).

**If existing pages use `React.lazy`:**
```tsx
const Meta = lazy(() => import("./pages/Meta"));
// ...
<Route path="/meta" element={<Meta />} />
```

**If existing pages use direct import:**
```tsx
import Meta from "./pages/Meta";
// ...
<Route path="/meta" element={<Meta />} />
```

Mirror the existing style exactly.

- [x] **Step 4: Add NavBar entry**

Read `web/src/components/layout/NavBar.tsx`. Find the existing menu links (likely an array of `{ link, label }` objects or `<NavLink>` elements). Add `{ link: "/meta", label: "Meta" }` between the existing entries — placement to discuss with Steven (probably between `/builds` and `/economy`).

- [x] **Step 5: Run the dev server**

```bash
cd web
npm run dev
```

Expected: Vite dev server starts on port 4173 (or wherever their config has it). Visit `http://localhost:4173/meta`. Verify the placeholder page renders. Verify the navbar shows "Meta".

- [x] **Step 6: Run lint + typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: clean (no errors).

- [x] **Step 7: Commit**

```bash
cd ..
git add web/src/pages/Meta.tsx web/src/App.tsx web/src/components/layout/NavBar.tsx
git commit -m "feat(meta): add /meta route skeleton + navbar entry

Placeholder page reachable at /meta. NavBar shows the new entry.
Next: backend SQL aggregations."
```

**Checkpoint 1 done.** Verify by: opening `http://localhost:4173/meta` and seeing the placeholder. Verify NavBar entry. tsc + eslint clean.

---

## Task 4 — Recon pd2-tools' Postgres schema + existing DB patterns

**Files:** none modified. This task produces a notes file we'll delete at sprint close.

- [x] **Step 1: Read the existing characters DB module**

Read `api/src/database/postgres/index.ts` (or whichever module exports `characterDB`). Note:
- The character table name
- The columns we care about: id, name, account, class, level, game mode (hardcore/softcore), skills (separate table?), items (separate table?)
- Any views or stored procedures
- The query pattern for "filter characters by class + level"

- [x] **Step 2: Read the characters route**

Read `api/src/routes/characters.ts`. Note:
- How filters from query params are passed into the DB layer (zod? express-validator? plain destructuring?)
- How responses are shaped (do they wrap in `{ data, meta }`? plain arrays?)
- How `autoCache(seconds)` is applied

- [x] **Step 3: Read the economy DB module for aggregation patterns**

Read `api/src/database/postgres/economy.ts`. Look for `GROUP BY` queries — economy data is aggregated like ours will be. Note the patterns: parameterized queries, casting, JOINs.

- [x] **Step 4: Run a sample query**

If the dev DB is reachable:

```bash
cd api
# Connect via psql or via a one-off script:
npx ts-node -e "
import { Pool } from 'pg';
import { dbConfig } from './src/config/database';
const pool = new Pool(dbConfig);
pool.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \\'character\\' ORDER BY ordinal_position').then(r => { console.log(r.rows); pool.end(); });
"
```

(Adjust the import paths to match their actual files.) Document the character table's columns. Repeat for items, skills, mercenary tables.

- [x] **Step 5: Write schema notes**

Create `pd2-tools-fork/.meta-recon-notes.md` (this file is temporary — we delete it at sprint close):

```markdown
# Meta integration — schema recon notes

## Tables
- `character`: id, name, account_id, class_name, level, game_mode (HC/SC), last_updated, ...
- `character_skill`: character_id, skill_name, base_level, ...
- `character_item`: character_id, item_name, item_type (Unique/Set/Runeword/...), slot (equipped/inventory), modifiers (jsonb?), ...
- `character_mercenary`: character_id, merc_type, items (jsonb? separate table?), ...

(Replace with actual schema from the recon.)

## Filter pattern from characters.ts
[paste the relevant query]

## Caching pattern
autoCache(900) decorator — applied at route level via `router.get("/", autoCache(900), handler)`.

## Open questions for SQL design
- [x] How does the schema represent "skill at minLevel ≥ 20"? `base_level` column? Separate `realSkills` table?
- [x] Are items normalized or stored as jsonb on the character row?
- [x] What's the right way to express "AND character has Skill1 ≥ 20 AND Skill2 ≥ 20 AND ..."?
```

- [x] **Step 6: Commit the recon notes**

```bash
git add .meta-recon-notes.md
git commit -m "wip(meta): schema recon notes

Temporary notes file — captures schema + patterns we'll need for
the meta route SQL. Delete at sprint close."
```

---

## Task 5 — Backend types

**Files (in `pd2-tools-fork/`):**
- Create: `api/src/types/meta.ts`
- Modify: `api/src/types/index.ts`

- [x] **Step 1: Write the types file**

Create `api/src/types/meta.ts`:

```ts
/**
 * Request + response types for the /meta endpoint.
 *
 * The frontend passes a cohort filter (className + gameMode + minLevel +
 * skills) and receives all the aggregations needed to render the meta page:
 * top items per slot, skill usage, mercenary, level distribution. The shape
 * is intentionally close to what api.pd2.tools' public /stats/* endpoints
 * return, since this code path replaces those calls for our /meta page.
 */

export type GameMode = "hardcore" | "softcore";

export type SkillRequirement = {
  /** Skill name as it appears in character_skill.skill_name. */
  name: string;
  /** Hard-allocated skill points (base_level) must be >= this value. */
  minLevel: number;
};

export type MetaQuery = {
  gameMode: GameMode;
  className: string;
  minLevel: number;
  /** Empty array allowed — returns class-only cohort. */
  skills: SkillRequirement[];
};

export type ItemUsageRow = {
  item: string;
  itemType: "Unique" | "Set" | "Runeword" | "Rare" | "Magic" | "Crafted" | string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type SkillUsageRow = {
  name: string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type MercTypeUsageRow = {
  mercType: string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type LevelDistribution = {
  hardcore: Array<{ level: number; count: number }>;
  softcore: Array<{ level: number; count: number }>;
};

export type MetaResponse = {
  cohortSize: number;
  itemUsage: ItemUsageRow[];
  skillUsage: SkillUsageRow[];
  mercTypeUsage: MercTypeUsageRow[];
  mercItemUsage: ItemUsageRow[];
  levelDistribution: LevelDistribution;
};
```

- [x] **Step 2: Re-export from index**

Open `api/src/types/index.ts`. Add at the bottom:

```ts
export * from "./meta";
```

(If their index uses named re-exports rather than `*`, match their style.)

- [x] **Step 3: Verify typecheck**

```bash
cd api
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 4: Commit**

```bash
git add api/src/types/meta.ts api/src/types/index.ts
git commit -m "feat(meta): backend types

Request shape (MetaQuery), per-aggregation row types, combined
MetaResponse. Shapes mirror api.pd2.tools' public /stats/*
responses since /meta replaces those calls."
```

---

## Task 6 — Backend DB module: cohort query

**Files (in `pd2-tools-fork/`):**
- Create: `api/src/database/postgres/meta.ts`
- Modify: `api/src/database/index.ts`

- [x] **Step 1: Stub the DB module**

Create `api/src/database/postgres/meta.ts` with the module skeleton:

```ts
import { Pool } from "pg";
import { getPool } from "./connection"; // ← adjust to match their actual connection helper
import type {
  MetaQuery,
  ItemUsageRow,
  SkillUsageRow,
  MercTypeUsageRow,
  LevelDistribution,
} from "../../types/meta";

/**
 * Find the cohort of character IDs matching the query filter.
 *
 * A character matches if:
 * - class_name = query.className
 * - level >= query.minLevel
 * - game_mode = query.gameMode
 * - For every skill in query.skills: the character has that skill at
 *   base_level >= skill.minLevel.
 *
 * All other aggregation queries take this cohort as their starting set.
 *
 * Implementation note: the skills filter generates one EXISTS clause per
 * skill — efficient on a (character_id, skill_name) index, which the
 * character_skill table should have.
 */
export async function findCohort(query: MetaQuery): Promise<number[]> {
  const pool = getPool();
  const params: unknown[] = [query.className, query.minLevel, query.gameMode];
  const skillClauses: string[] = [];
  for (const skill of query.skills) {
    params.push(skill.name, skill.minLevel);
    skillClauses.push(
      `AND EXISTS (
        SELECT 1 FROM character_skill cs
        WHERE cs.character_id = c.id
          AND cs.skill_name = $${params.length - 1}
          AND cs.base_level >= $${params.length}
      )`,
    );
  }
  const sql = `
    SELECT c.id FROM character c
    WHERE c.class_name = $1
      AND c.level >= $2
      AND c.game_mode = $3
      ${skillClauses.join("\n      ")}
  `;
  const result = await pool.query<{ id: number }>(sql, params);
  return result.rows.map((r) => r.id);
}
```

**IMPORTANT:** the table names (`character`, `character_skill`) and column names (`class_name`, `level`, `game_mode`, `base_level`, etc.) are guesses based on the recon notes. **Before continuing, verify against `.meta-recon-notes.md` and the actual schema.** If names differ, adjust here and propagate to subsequent queries.

- [x] **Step 2: Export the module**

Open `api/src/database/index.ts`. Add:

```ts
export * as metaDB from "./postgres/meta";
```

(Match their existing pattern — they may export individual functions or a namespace; mirror their convention.)

- [x] **Step 3: Quick sanity test**

Write a one-off script to call `findCohort` against the dev DB:

```bash
cd api
npx ts-node -e "
import { metaDB } from './src/database';
metaDB.findCohort({
  gameMode: 'hardcore',
  className: 'Paladin',
  minLevel: 80,
  skills: [{ name: 'Blessed Hammer', minLevel: 20 }],
}).then(ids => {
  console.log('Cohort size:', ids.length);
  console.log('First 5 IDs:', ids.slice(0, 5));
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: returns a cohort. The size should be small for Hammerdin in HC (matches what we saw in the standalone — single digits to a few hundred depending on ladder state).

If the query fails (column doesn't exist, etc.): STOP and update the table/column names. Then re-test.

- [x] **Step 4: Commit**

```bash
git add api/src/database/postgres/meta.ts api/src/database/index.ts
git commit -m "feat(meta): findCohort query

Filters character by class + level + game_mode + per-skill base_level
requirement. Skill filter uses one EXISTS clause per requirement,
relies on the (character_id, skill_name) index for performance."
```

---

## Task 7 — Backend DB module: item-usage aggregation

**Files (in `pd2-tools-fork/`):**
- Modify: `api/src/database/postgres/meta.ts`

- [x] **Step 1: Add `aggregateItemUsage`**

Append to `api/src/database/postgres/meta.ts`:

```ts
import type { MetaQuery, ItemUsageRow } from "../../types/meta";

/**
 * Aggregate item usage across the cohort.
 *
 * Counts how many characters wear each named item (Unique / Set / Runeword
 * names — Rare / Magic / Crafted items have unique random names and aren't
 * aggregable this way; they'd need a separate by-base aggregation we don't
 * do here yet).
 *
 * Returns rows sorted by numOccurrences desc.
 */
export async function aggregateItemUsage(
  cohortIds: number[],
): Promise<ItemUsageRow[]> {
  if (cohortIds.length === 0) return [];
  const pool = getPool();
  const sql = `
    SELECT
      ci.item_name AS item,
      ci.item_type AS "itemType",
      COUNT(DISTINCT ci.character_id)::int AS "numOccurrences",
      $2::int AS "totalSample",
      (COUNT(DISTINCT ci.character_id)::float / $2 * 100) AS pct
    FROM character_item ci
    WHERE ci.character_id = ANY($1::int[])
      AND ci.item_name IS NOT NULL
      AND ci.item_type IN ('Unique', 'Set', 'Runeword')
      AND ci.is_equipped = true
    GROUP BY ci.item_name, ci.item_type
    ORDER BY "numOccurrences" DESC
  `;
  const result = await pool.query<ItemUsageRow>(sql, [cohortIds, cohortIds.length]);
  return result.rows;
}
```

**Schema assumptions to verify against recon notes:**
- `character_item` table with: `character_id`, `item_name`, `item_type`, `is_equipped` (bool)
- If their schema uses a different shape (e.g., items in a jsonb column on `character`, or a `location` column instead of `is_equipped`), adjust here.

- [x] **Step 2: Sanity test**

```bash
cd api
npx ts-node -e "
import { metaDB } from './src/database';
(async () => {
  const cohort = await metaDB.findCohort({
    gameMode: 'hardcore',
    className: 'Paladin',
    minLevel: 80,
    skills: [{ name: 'Blessed Hammer', minLevel: 20 }],
  });
  console.log('Cohort:', cohort.length);
  const items = await metaDB.aggregateItemUsage(cohort);
  console.log('Items found:', items.length);
  console.log('Top 5:', items.slice(0, 5));
})();
"
```

Expected: returns named items with reasonable percentages. Top items for Hammerdin should include Heart of the Oak, Spirit, Enigma, Arachnid Mesh, Herald of Zakarum, etc.

Compare against `pd2-aggregator.vercel.app/?...skills=[{"name":"Blessed Hammer","minLevel":20}]` — same top items? Within ±5% same percentages? **If not, the SQL is wrong — fix before continuing.**

- [x] **Step 3: Commit**

```bash
git add api/src/database/postgres/meta.ts
git commit -m "feat(meta): aggregateItemUsage query

Counts equipped Unique/Set/Runeword items across the cohort.
Rare/Magic/Crafted items skipped — they have unique random names and
can't be name-aggregated; future work to aggregate them by base."
```

---

## Task 8 — Backend DB module: skill-usage + mercenary + level-distribution

**Files (in `pd2-tools-fork/`):**
- Modify: `api/src/database/postgres/meta.ts`

- [x] **Step 1: Add `aggregateSkillUsage`**

Append:

```ts
/**
 * Aggregate skill usage across the cohort: for each skill, how many cohort
 * members have any points in it. Returns rows sorted by numOccurrences desc.
 */
export async function aggregateSkillUsage(
  cohortIds: number[],
): Promise<SkillUsageRow[]> {
  if (cohortIds.length === 0) return [];
  const pool = getPool();
  const sql = `
    SELECT
      cs.skill_name AS name,
      COUNT(DISTINCT cs.character_id)::int AS "numOccurrences",
      $2::int AS "totalSample",
      (COUNT(DISTINCT cs.character_id)::float / $2 * 100) AS pct
    FROM character_skill cs
    WHERE cs.character_id = ANY($1::int[])
      AND cs.base_level >= 1
    GROUP BY cs.skill_name
    ORDER BY "numOccurrences" DESC
  `;
  const result = await pool.query<SkillUsageRow>(sql, [cohortIds, cohortIds.length]);
  return result.rows;
}
```

- [x] **Step 2: Add `aggregateMercType` and `aggregateMercItems`**

Append:

```ts
export async function aggregateMercType(
  cohortIds: number[],
): Promise<MercTypeUsageRow[]> {
  if (cohortIds.length === 0) return [];
  const pool = getPool();
  const sql = `
    SELECT
      cm.merc_type AS "mercType",
      COUNT(DISTINCT cm.character_id)::int AS "numOccurrences",
      $2::int AS "totalSample",
      (COUNT(DISTINCT cm.character_id)::float / $2 * 100) AS pct
    FROM character_mercenary cm
    WHERE cm.character_id = ANY($1::int[])
      AND cm.merc_type IS NOT NULL
    GROUP BY cm.merc_type
    ORDER BY "numOccurrences" DESC
  `;
  const result = await pool.query<MercTypeUsageRow>(sql, [cohortIds, cohortIds.length]);
  return result.rows;
}

export async function aggregateMercItems(
  cohortIds: number[],
): Promise<ItemUsageRow[]> {
  if (cohortIds.length === 0) return [];
  const pool = getPool();
  const sql = `
    SELECT
      mi.item_name AS item,
      mi.item_type AS "itemType",
      COUNT(DISTINCT mi.mercenary_id)::int AS "numOccurrences",
      $2::int AS "totalSample",
      (COUNT(DISTINCT mi.mercenary_id)::float / $2 * 100) AS pct
    FROM mercenary_item mi
    JOIN character_mercenary cm ON cm.id = mi.mercenary_id
    WHERE cm.character_id = ANY($1::int[])
      AND mi.item_name IS NOT NULL
      AND mi.item_type IN ('Unique', 'Set', 'Runeword')
    GROUP BY mi.item_name, mi.item_type
    ORDER BY "numOccurrences" DESC
  `;
  const result = await pool.query<ItemUsageRow>(sql, [cohortIds, cohortIds.length]);
  return result.rows;
}
```

**Note:** the merc table structure (`character_mercenary` with separate `mercenary_item` table) is a guess. If their schema embeds merc items directly in the character row or uses a different join structure, adjust.

- [x] **Step 3: Add `aggregateLevelDistribution`**

Append:

```ts
/**
 * Level distribution buckets — counts at each integer level.
 * Returns both hardcore and softcore in the same shape pd2.tools' API uses
 * for level-distribution. We populate only the gameMode in the query; the
 * other side is an empty array.
 */
export async function aggregateLevelDistribution(
  cohortIds: number[],
  gameMode: "hardcore" | "softcore",
): Promise<LevelDistribution> {
  if (cohortIds.length === 0) return { hardcore: [], softcore: [] };
  const pool = getPool();
  const sql = `
    SELECT c.level, COUNT(*)::int AS count
    FROM character c
    WHERE c.id = ANY($1::int[])
    GROUP BY c.level
    ORDER BY c.level
  `;
  const result = await pool.query<{ level: number; count: number }>(sql, [cohortIds]);
  return gameMode === "hardcore"
    ? { hardcore: result.rows, softcore: [] }
    : { hardcore: [], softcore: result.rows };
}
```

- [x] **Step 4: Sanity test each**

Run a script that calls all four. Compare to the standalone's output for the same filter (Hammerdin) — values should match within a percentage point (small rounding differences expected if the cohorts differ by a character or two due to update timing).

- [x] **Step 5: Commit**

```bash
git add api/src/database/postgres/meta.ts
git commit -m "feat(meta): skill-usage + mercenary + level-distribution queries

Four more aggregation queries against the cohort. Schema assumptions
documented in code comments — adjust if pd2.tools' actual tables differ."
```

---

## Task 9 — Backend route + caching

**Files (in `pd2-tools-fork/`):**
- Create: `api/src/routes/meta.ts`
- Modify: `api/src/routes/index.ts`

- [x] **Step 1: Write the route handler**

Create `api/src/routes/meta.ts`:

```ts
import { Router, Request, Response, NextFunction } from "express";
import { autoCache } from "../middleware/auto-cache";
import { metaDB } from "../database";
import type {
  MetaQuery,
  MetaResponse,
  SkillRequirement,
  GameMode,
} from "../types/meta";

const router = Router();

/**
 * GET /api/meta
 *
 * Query params:
 *   gameMode   = "hardcore" | "softcore"
 *   className  = "Amazon" | "Assassin" | ... | "Sorceress"
 *   minLevel   = integer 1-99
 *   skills     = JSON-encoded array of { name: string, minLevel: number }
 *
 * Returns a MetaResponse: cohort size + 5 aggregations.
 *
 * Cached for 15 minutes via autoCache middleware (Redis-backed).
 */
router.get(
  "/",
  autoCache(900),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseQuery(req);
      const cohortIds = await metaDB.findCohort(query);
      const [itemUsage, skillUsage, mercTypeUsage, mercItemUsage, levelDistribution] =
        await Promise.all([
          metaDB.aggregateItemUsage(cohortIds),
          metaDB.aggregateSkillUsage(cohortIds),
          metaDB.aggregateMercType(cohortIds),
          metaDB.aggregateMercItems(cohortIds),
          metaDB.aggregateLevelDistribution(cohortIds, query.gameMode),
        ]);
      const response: MetaResponse = {
        cohortSize: cohortIds.length,
        itemUsage,
        skillUsage,
        mercTypeUsage,
        mercItemUsage,
        levelDistribution,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

function parseQuery(req: Request): MetaQuery {
  const gameMode = req.query.gameMode;
  if (gameMode !== "hardcore" && gameMode !== "softcore") {
    throw new HttpError(400, `gameMode must be 'hardcore' or 'softcore'`);
  }
  const className = req.query.className;
  if (typeof className !== "string" || className.length === 0) {
    throw new HttpError(400, "className is required");
  }
  const minLevelRaw = req.query.minLevel;
  const minLevel = typeof minLevelRaw === "string" ? parseInt(minLevelRaw, 10) : 1;
  if (Number.isNaN(minLevel) || minLevel < 1 || minLevel > 99) {
    throw new HttpError(400, "minLevel must be an integer 1-99");
  }

  let skills: SkillRequirement[] = [];
  const skillsRaw = req.query.skills;
  if (typeof skillsRaw === "string" && skillsRaw.length > 0) {
    try {
      const parsed = JSON.parse(skillsRaw);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      for (const s of parsed) {
        if (
          typeof s !== "object" ||
          s === null ||
          typeof s.name !== "string" ||
          typeof s.minLevel !== "number"
        ) {
          throw new Error(`malformed skill: ${JSON.stringify(s)}`);
        }
        skills.push({ name: s.name, minLevel: s.minLevel });
      }
    } catch (e) {
      throw new HttpError(
        400,
        `skills must be a JSON array of { name, minLevel }: ${(e as Error).message}`,
      );
    }
  }

  return { gameMode: gameMode as GameMode, className, minLevel, skills };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export default router;
```

**Note:** the `HttpError` class above is a stub — check `api/src/middleware/error-handler.ts` to see how their existing routes signal HTTP errors. If they use a different error class (e.g., from a library or a shared `errors.ts`), use that instead and remove the local class.

- [x] **Step 2: Register the route**

Open `api/src/routes/index.ts`. Find where other routes are mounted (e.g., `router.use("/characters", charactersRoutes)`). Add:

```ts
import metaRoutes from "./meta";
// ...
router.use("/meta", metaRoutes);
```

- [x] **Step 3: Smoke test the endpoint**

Restart the dev server (`docker-compose restart api` or whatever their workflow is). Hit the endpoint:

```bash
curl -sS "http://localhost:3000/api/meta?gameMode=hardcore&className=Paladin&minLevel=80&skills=%5B%7B%22name%22%3A%22Blessed+Hammer%22%2C%22minLevel%22%3A20%7D%5D" | jq '.cohortSize, (.itemUsage | length), (.skillUsage | length)'
```

Expected: returns a JSON response with cohortSize > 0 and non-empty arrays. (Adjust port if their dev server is on a different one.)

If it returns 500: check the API logs for the SQL error. If 404: check that the route is registered. If empty results: check the cohort query parameters.

- [x] **Step 4: Compare to standalone**

Hit the same filter against `pd2-aggregator.vercel.app` and confirm cohortSize matches (or is very close — drift of 1-2 characters is OK due to update timing). Confirm top items match.

- [x] **Step 5: Lint + typecheck**

```bash
cd api
npm run lint
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 6: Commit**

```bash
git add api/src/routes/meta.ts api/src/routes/index.ts
git commit -m "feat(meta): /api/meta route with autoCache(900)

GET endpoint that takes gameMode + className + minLevel + skills query
params, fans out to the 5 aggregation queries in parallel, returns a
combined MetaResponse. 15-minute Redis cache via autoCache middleware.

Query param parsing is strict — invalid gameMode/className/skills
return 400 with a clear message."
```

---

## Task 10 — Backend integration tests (parity tests reborn)

**Files (in `pd2-tools-fork/`):**
- Create: `api/src/routes/meta.test.ts`
- Create: `api/src/database/postgres/meta.test.ts` (optional unit tests for query builders)

This task ports Sprint 2.2's parity tests from `PD2/src/lib/validation/parity.test.ts` to the fork's backend. Same 7 canonical builds × 5 assertion types, but now testing the full SQL → API → JSON pipeline via supertest.

- [x] **Step 1: Check test infrastructure**

Read `api/package.json` for the test command (`jest` directly? `tsc + jest`?). Read an existing test file (`api/src/routes/routes.test.ts` or `api/src/database/postgres/economy.test.ts`) to understand:
- How they spin up the Express app for supertest (`app.ts` exported separately?)
- How they handle the DB during tests (real DB? mocked? jest-mock-extended? separate test DB?)
- Any setup/teardown patterns

- [x] **Step 2: Write the test file**

Create `api/src/routes/meta.test.ts`:

```ts
import request from "supertest";
import app from "../app"; // ← adjust to match their app export
import type { MetaResponse, ItemUsageRow } from "../types/meta";

// Same 7 canonical builds as PD2's validation parity tests. Asserts the
// full SQL→API pipeline preserves data fidelity.

type CanonicalBuild = {
  slug: string;
  className: string;
  skills: Array<{ name: string; minLevel: number }>;
};

const CANONICAL_BUILDS: CanonicalBuild[] = [
  { slug: "amazon-lightning-fury",      className: "Amazon",      skills: [{ name: "Lightning Fury", minLevel: 20 }] },
  { slug: "assassin-lightning-trapsin", className: "Assassin",    skills: [{ name: "Lightning Sentry", minLevel: 20 }] },
  { slug: "barbarian-whirlwind",        className: "Barbarian",   skills: [{ name: "Whirlwind", minLevel: 20 }] },
  { slug: "druid-wind-tornado",         className: "Druid",       skills: [{ name: "Tornado", minLevel: 20 }] },
  { slug: "necromancer-bone-spear",     className: "Necromancer", skills: [{ name: "Bone Spear", minLevel: 20 }] },
  { slug: "paladin-hammerdin",          className: "Paladin",     skills: [{ name: "Blessed Hammer", minLevel: 20 }] },
  { slug: "sorceress-blizzard",         className: "Sorceress",   skills: [{ name: "Blizzard", minLevel: 20 }] },
];

async function fetchMeta(b: CanonicalBuild): Promise<MetaResponse> {
  const res = await request(app)
    .get("/api/meta")
    .query({
      gameMode: "hardcore",
      className: b.className,
      minLevel: 80,
      skills: JSON.stringify(b.skills),
    });
  expect(res.status).toBe(200);
  return res.body as MetaResponse;
}

describe("/api/meta parity per canonical build", () => {
  for (const b of CANONICAL_BUILDS) {
    describe(b.slug, () => {
      let resp: MetaResponse;

      beforeAll(async () => {
        resp = await fetchMeta(b);
      });

      // Sanity: cohort non-empty (catches a fixture/DB/SQL issue).
      it("returns a non-empty cohort", () => {
        expect(resp.cohortSize).toBeGreaterThan(0);
        expect(resp.itemUsage.length).toBeGreaterThan(0);
      });

      // Test 1: totalSample consistency across aggregations.
      it("totalSample agrees between itemUsage and skillUsage", () => {
        const itemN = resp.itemUsage[0]?.totalSample;
        const skillN = resp.skillUsage[0]?.totalSample;
        expect(skillN).toBe(itemN);
      });

      // Test 2: totalSample matches cohortSize.
      it("totalSample matches cohortSize", () => {
        expect(resp.itemUsage[0].totalSample).toBe(resp.cohortSize);
      });

      // Test 3: no duplicate items (per (name, type) pair).
      it("no duplicate (item, itemType) rows", () => {
        const seen = new Set<string>();
        for (const r of resp.itemUsage) {
          const key = `${r.item}|${r.itemType}`;
          expect(seen.has(key), `duplicate row for ${key}`).toBe(false);
          seen.add(key);
        }
      });

      // Test 4: percentages are bounded.
      it("all pcts are in [0, 100]", () => {
        for (const r of resp.itemUsage) {
          expect(r.pct).toBeGreaterThanOrEqual(0);
          expect(r.pct).toBeLessThanOrEqual(100);
        }
      });

      // Test 5: pct math is correct.
      it("pct = numOccurrences / totalSample * 100", () => {
        for (const r of resp.itemUsage) {
          const expected = (r.numOccurrences / r.totalSample) * 100;
          expect(r.pct).toBeCloseTo(expected, 2);
        }
      });
    });
  }
});
```

- [x] **Step 3: Run the tests**

```bash
cd api
npm test
```

Expected: 7 build describes × 6 it blocks = 42 sub-tests, all green.

If `app` isn't exported from `api/src/app.ts`, refactor their app entry point — or use whatever pattern their existing test files use (e.g., they might import a `createApp()` factory).

If tests fail because the dev DB has different data than expected: that's actually fine — these are SHAPE assertions, not value assertions. They pass as long as the cohort is non-empty and the math is internally consistent.

- [x] **Step 4: Commit**

```bash
git add api/src/routes/meta.test.ts
git commit -m "test(meta): /api/meta parity tests (42 sub-tests)

Ports Sprint 2.2's PD2 parity tests to the fork as Jest+supertest
integration tests against the live Express app and dev Postgres.

Six assertions per build (slightly different from PD2's 5 — added
explicit cohortSize check) × 7 canonical builds = 42 sub-tests.

Tests assert internal consistency (totalSample agreement, math
correctness, no duplicates) rather than absolute population values,
so they pass regardless of ladder state."
```

**Checkpoint 2 done.** Backend route works end-to-end, parity tests green, output matches the standalone within drift tolerance.

---

## Task 11 — Frontend API client + config

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/api/meta.ts`
- Modify: `web/src/config/api.ts`

- [x] **Step 1: Add the endpoint constant**

Open `web/src/config/api.ts`. Find `API_ENDPOINTS` (or equivalent object). Add:

```ts
META: "/meta",
```

(Match their object's existing format. If they prefer absolute paths or have a `BUILDS: "/builds"` style, match it exactly.)

- [x] **Step 2: Write the typed client**

Read `web/src/api/characters.ts` to understand their wrapping pattern (probably exports a `charactersAPI` object with methods that call the `APIClient`).

Create `web/src/api/meta.ts`:

```ts
import { APIClient } from "./client";
import { API_ENDPOINTS } from "../config/api";

// Mirror api/src/types/meta.ts — keep these in sync. We duplicate rather
// than import across packages because web/ and api/ are independent
// npm packages.
export type GameMode = "hardcore" | "softcore";

export type SkillRequirement = {
  name: string;
  minLevel: number;
};

export type MetaQuery = {
  gameMode: GameMode;
  className: string;
  minLevel: number;
  skills: SkillRequirement[];
};

export type ItemUsageRow = {
  item: string;
  itemType: string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type SkillUsageRow = {
  name: string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type MercTypeUsageRow = {
  mercType: string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type LevelDistribution = {
  hardcore: Array<{ level: number; count: number }>;
  softcore: Array<{ level: number; count: number }>;
};

export type MetaResponse = {
  cohortSize: number;
  itemUsage: ItemUsageRow[];
  skillUsage: SkillUsageRow[];
  mercTypeUsage: MercTypeUsageRow[];
  mercItemUsage: ItemUsageRow[];
  levelDistribution: LevelDistribution;
};

export const metaAPI = {
  async fetchMeta(query: MetaQuery): Promise<MetaResponse> {
    return new APIClient().get<MetaResponse>(API_ENDPOINTS.META, {
      gameMode: query.gameMode,
      className: query.className,
      minLevel: query.minLevel,
      skills: JSON.stringify(query.skills),
    });
  },
};
```

(Adjust `APIClient` instantiation to match their actual pattern — they may export a singleton, or `APIClient.get(path, params)` may differ.)

- [x] **Step 3: Typecheck**

```bash
cd web
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 4: Commit**

```bash
git add web/src/api/meta.ts web/src/config/api.ts
git commit -m "feat(meta): frontend API client + endpoint constant

Mirrors api/src/types/meta.ts (duplicated for package boundary —
web/ and api/ are independent packages, no shared types module).

Uses the existing APIClient wrapper pattern."
```

---

## Task 12 — React Query hook

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/hooks/useMetaData.ts`

- [x] **Step 1: Read an existing hook**

Read `web/src/hooks/useCharacterData.ts` (or equivalent — find one of their React Query hooks). Note the pattern: `useQuery` key shape, staleTime, error handling.

- [x] **Step 2: Write the hook**

Create `web/src/hooks/useMetaData.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { metaAPI, type MetaQuery, type MetaResponse } from "../api/meta";

/**
 * Fetches /api/meta for the given filter. Backed by React Query, so
 * the same query key returns cached data within the staleTime (5 min
 * default in App.tsx's QueryClientProvider).
 *
 * Returns `data: undefined` until the first fetch completes. Use
 * `isLoading` to gate UI rendering.
 */
export function useMetaData(query: MetaQuery): UseQueryResult<MetaResponse, Error> {
  return useQuery({
    queryKey: ["meta", query],
    queryFn: () => metaAPI.fetchMeta(query),
    // Inherits staleTime/retry from QueryClientProvider in App.tsx.
  });
}
```

- [x] **Step 3: Typecheck**

```bash
cd web
npx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add web/src/hooks/useMetaData.ts
git commit -m "feat(meta): useMetaData React Query hook

Thin wrapper over metaAPI.fetchMeta. queryKey includes the full
filter so different builds get distinct cache entries."
```

---

## Task 13 — Meta page wired to backend (JSON dump)

**Files (in `pd2-tools-fork/`):**
- Modify: `web/src/pages/Meta.tsx`

- [x] **Step 1: Replace the placeholder with a working JSON dump**

Replace `web/src/pages/Meta.tsx` content:

```tsx
import { Container, Title, Text, Code, Stack, Loader, Alert } from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useMetaData } from "../hooks/useMetaData";

export default function Meta() {
  // Hardcoded filter for now — Checkpoint 4 adds the real filter form.
  const { data, isLoading, error } = useMetaData({
    gameMode: "hardcore",
    className: "Paladin",
    minLevel: 80,
    skills: [{ name: "Blessed Hammer", minLevel: 20 }],
  });

  return (
    <Container size="xl" py="md">
      <Helmet>
        <title>Meta — PD2 Tools</title>
      </Helmet>
      <Title order={1} mb="sm">
        Meta
      </Title>
      <Text c="dimmed" mb="lg">
        Build aggregator — checkpoint 3 (data path).
      </Text>

      {isLoading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {data && (
        <Stack>
          <Text>Cohort size: <strong>{data.cohortSize}</strong></Text>
          <Text>Top items ({data.itemUsage.length}):</Text>
          <Code block>{JSON.stringify(data.itemUsage.slice(0, 10), null, 2)}</Code>
        </Stack>
      )}
    </Container>
  );
}
```

- [x] **Step 2: Test in browser**

Run `docker-compose up` (or restart the FE dev server). Visit `http://localhost:4173/meta`. Expected: loader appears briefly, then cohort size + top 10 items displayed as JSON.

Verify the cohort size matches what Task 9's curl test showed for the same filter.

- [x] **Step 3: Commit**

```bash
git add web/src/pages/Meta.tsx
git commit -m "feat(meta): wire Meta page to /api/meta

Hardcoded Hammerdin filter for now; placeholder JSON dump of the
response. Validates the full FE → React Query → Express → SQL pipeline."
```

**Checkpoint 3 done.** Data flows end-to-end. Browser shows live aggregated data from the dev Postgres.

---

## Task 14 — Port pure aggregator logic + data files from PD2/

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/lib/aggregate/` (entire directory tree)
- Create: `web/src/lib/shape/`
- Create: `web/src/lib/filter.ts`, `diff.ts`, `slot.ts`, `buildPresets.ts`, `url-state.ts`
- Create: `web/src/lib/aggregate/types.ts`
- Create: `web/src/data/skill-prereqs.json`, `item-slots.json`, `builds.json`, `mod-dictionary.json`

These ports are mechanical file copies with minor import path adjustments.

- [x] **Step 1: Copy data files**

```bash
mkdir -p "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/data"
cp "C:/Coding/III____Full_Circle/PD2/data/skill-prereqs.json" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/data/"
cp "C:/Coding/III____Full_Circle/PD2/data/item-slots.json" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/data/"
cp "C:/Coding/III____Full_Circle/PD2/data/builds.json" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/data/"
cp "C:/Coding/III____Full_Circle/PD2/data/mod-dictionary.json" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/data/"
```

- [x] **Step 2: Copy lib files**

```bash
mkdir -p "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate" \
         "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/shape"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/aggregate/affixMods.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/aggregate/avgStats.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/aggregate/charms.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/aggregate/index.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/aggregate/skillUsage.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/aggregate/types.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/shape/buildSheet.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/shape/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/shape/topItems.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/shape/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/filter.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/diff.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/slot.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/buildPresets.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/types.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/"
cp "C:/Coding/III____Full_Circle/PD2/src/lib/url-state.ts" "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/"
```

- [x] **Step 3: Fix import paths**

Each ported file references data via `../../../data/<file>.json`. The new location is `web/src/lib/aggregate/skillUsage.ts` → `web/src/data/skill-prereqs.json`, which is `../../data/skill-prereqs.json`.

In every ported `.ts` file, find imports like:
```ts
import skillPrereqsRaw from "../../../data/skill-prereqs.json";
```

Change to:
```ts
import skillPrereqsRaw from "../../data/skill-prereqs.json";
```

For files at `web/src/lib/*.ts` (not in a subdir), the path is `../data/skill-prereqs.json`.

Check every ported file. Use grep to find them all:

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib"
grep -rln "data/.*\.json" .
```

- [x] **Step 4: Verify the types-only file `types.ts` is correct**

Open `web/src/lib/types.ts`. It contains the `Character`, `Item`, etc. types we ported. These describe the OLD shape that `api.pd2.tools` returned. Some of our ported aggregators take `Character[]` — but in the fork, we don't have raw Character objects on the frontend (the backend does the aggregation). 

Decision point: which ported aggregators do we actually USE on the frontend in the fork?
- `aggregateAffixModsBySlot` — takes `Character[]`. Not useful on FE — we'll move this logic to the backend in a future iteration.
- `aggregateCharms` — same.
- `aggregateAvgStats` — same.
- `aggregateSkillUsage` — same.
- `shapeTopItemsBySlot(rows)` — takes `ItemUsageRow[]` from server. **Used directly on FE.** ✓
- `slotFromItemName` — pure name → slot lookup. **Used directly on FE.** ✓
- `diffCharacter` — takes `Character + GuideSlice`. Used in diff view; needs the per-account character fetch from the existing pd2.tools API.
- `buildPresets.ts` — pure data + isPresetActive helper. **Used directly on FE.** ✓
- `url-state.ts` — UI state ↔ URL params. **Used directly on FE.** ✓

So most of the aggregate/* files are dead code on the frontend in the fork. We have two options:
- **A: Don't port them at all** — only port shape/topItems.ts, slot.ts, buildPresets.ts, url-state.ts, diff.ts (the ones actually used on FE).
- **B: Port them all** — keeps the test surface and the option to compute things client-side if needed for the diff view.

For checkpoint 3, **go with option A**. Only port what we use. This is YAGNI — the unused aggregators can be ported back later if/when needed. Reverse the Step 2 copies for `affixMods.ts`, `avgStats.ts`, `charms.ts`, `skillUsage.ts`:

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork/web/src/lib/aggregate"
rm affixMods.ts avgStats.ts charms.ts skillUsage.ts types.ts
# Keep index.ts but slim it down to only export shape/topItems consumers.
```

Update `web/src/lib/aggregate/index.ts` to remove imports of deleted files. If after slimming there's nothing left to export, delete `index.ts` too and adjust consumers.

- [x] **Step 5: Typecheck**

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork/web"
npx tsc --noEmit
```

Fix any import errors that surface.

- [x] **Step 6: Commit**

```bash
git add web/src/lib/ web/src/data/
git commit -m "feat(meta): port pure logic + data files from pd2-aggregator

Files ported (no changes except import-path fixes):
- web/src/lib/shape/buildSheet.ts
- web/src/lib/shape/topItems.ts
- web/src/lib/filter.ts
- web/src/lib/diff.ts
- web/src/lib/slot.ts
- web/src/lib/buildPresets.ts
- web/src/lib/url-state.ts
- web/src/lib/types.ts
- web/src/data/skill-prereqs.json
- web/src/data/item-slots.json
- web/src/data/builds.json
- web/src/data/mod-dictionary.json

Skipped (no longer used on FE — backend does the aggregation now):
- aggregate/affixMods.ts, avgStats.ts, charms.ts, skillUsage.ts

These can be ported back if the diff view needs client-side
aggregation in a later sprint."
```

---

## Task 15 — Port FilterForm to Mantine

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/components/meta/FilterForm.tsx`
- Modify: `web/src/pages/Meta.tsx` (replace hardcoded filter with FilterForm state)

This is the largest UI port. Reference `PD2/src/components/FilterForm.tsx` for the structure; rewrite each piece using Mantine components.

- [x] **Step 1: Read the PD2 FilterForm source**

Open `PD2/src/components/FilterForm.tsx`. Note its sections:
- Mode toggle (Build a guide / Diff my character) — tabs
- Diff character name input (only in diff mode)
- Game mode pills (hardcore / softcore)
- Class selector (7 pill buttons in a grid)
- Build preset row (conditional on class)
- Min level slider
- Skill picker (selected skills as chips + a scrollable list of available skills)
- Submit button

- [x] **Step 2: Map shadcn/Tailwind → Mantine equivalents**

| Standalone (shadcn) | Mantine equivalent |
|---|---|
| Custom Tab divs with d2-theme | `<Tabs>` from `@mantine/core` |
| Custom pillBtn divs | `<Button>` or `<Chip>` |
| Skill chip with inline number input | `<Pill>` or custom chip with `<NumberInput>` |
| Custom skill list with hover/select states | `<ScrollArea>` + `<UnstyledButton>` |
| Custom slider | `<Slider>` |
| Submit button | `<Button>` |
| Skill icon `<img>` | Keep as `<img>` — Mantine doesn't add value here |

- [x] **Step 3: Write the FilterForm**

Create `web/src/components/meta/FilterForm.tsx`. Use Mantine `Stack`, `Group`, `Tabs`, `Button`, `Pill`, `Slider`, `ScrollArea`, `NumberInput`, `TextInput`. Style with Mantine props (no Tailwind classes).

Outline (full implementation below — read carefully):

```tsx
import { useState, useEffect } from "react";
import {
  Stack,
  Group,
  Tabs,
  Button,
  Pill,
  Slider,
  ScrollArea,
  NumberInput,
  TextInput,
  Title,
  Text,
  Box,
  Loader,
} from "@mantine/core";
import { BUILD_PRESETS, PRESET_MIN_LEVEL, isPresetActive } from "../../lib/buildPresets";
import type { UiState } from "../../lib/url-state";

const CLASSES = [
  "Amazon",
  "Assassin",
  "Barbarian",
  "Druid",
  "Necromancer",
  "Paladin",
  "Sorceress",
];

type Props = {
  initial: UiState;
  onSubmit: (s: UiState) => void;
};

export function FilterForm({ initial, onSubmit }: Props) {
  const [s, setS] = useState<UiState>(initial);

  // Skill list comes from the meta endpoint's skillUsage rows for the current
  // (class, gameMode) — fetch separately or accept as prop. For now, derive
  // from data/skill-prereqs.json since we have it locally.
  const skillNames = (() => {
    if (!s.filter.className) return [];
    // Read from skill-prereqs.json — keys are skill names for that class.
    // Lazy-loaded; in production we'd fetch class skills from the meta endpoint.
    try {
      const skillPrereqs = require("../../data/skill-prereqs.json");
      return Object.keys(skillPrereqs[s.filter.className] || {});
    } catch {
      return [];
    }
  })();

  const selectedSkillNames = new Set(s.skills.map((sk) => sk.name));

  function toggleSkill(name: string) {
    if (selectedSkillNames.has(name)) {
      setS({ ...s, skills: s.skills.filter((sk) => sk.name !== name) });
    } else {
      setS({ ...s, skills: [...s.skills, { name, minLevel: 20 }] });
    }
  }

  function setSkillLevel(name: string, level: number) {
    setS({
      ...s,
      skills: s.skills.map((sk) =>
        sk.name === name ? { ...sk, minLevel: level } : sk,
      ),
    });
  }

  return (
    <Box p="md" mb="lg">
      <Stack gap="lg">
        <Tabs value={s.mode} onChange={(v) => v && setS({ ...s, mode: v as "guide" | "diff" })}>
          <Tabs.List>
            <Tabs.Tab value="guide">Build a guide</Tabs.Tab>
            <Tabs.Tab value="diff">Diff my character</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {s.mode === "diff" && (
          <TextInput
            placeholder="Character name or account name"
            value={s.diffName}
            onChange={(e) => setS({ ...s, diffName: e.currentTarget.value })}
          />
        )}

        <Stack gap="xs">
          <Title order={6}>Game mode</Title>
          <Group gap="xs">
            <Button
              variant={s.filter.gameMode === "hardcore" ? "filled" : "default"}
              onClick={() => setS({ ...s, filter: { ...s.filter, gameMode: "hardcore" } })}
            >
              Hardcore
            </Button>
            <Button
              variant={s.filter.gameMode === "softcore" ? "filled" : "default"}
              onClick={() => setS({ ...s, filter: { ...s.filter, gameMode: "softcore" } })}
            >
              Softcore
            </Button>
          </Group>
        </Stack>

        <Stack gap="xs">
          <Title order={6}>Class</Title>
          <Group gap="xs">
            {CLASSES.map((c) => (
              <Button
                key={c}
                variant={s.filter.className === c ? "filled" : "default"}
                onClick={() =>
                  setS({
                    ...s,
                    filter: { ...s.filter, className: c },
                    skills: [],
                  })
                }
              >
                {c}
              </Button>
            ))}
          </Group>
        </Stack>

        {s.filter.className && BUILD_PRESETS[s.filter.className] && (
          <Stack gap="xs">
            <Title order={6}>Build preset</Title>
            <Group gap="xs">
              {BUILD_PRESETS[s.filter.className].map((preset) => {
                const active = isPresetActive(
                  s.skills.map((sk) => sk.name),
                  preset,
                );
                return (
                  <Button
                    key={preset.name}
                    size="xs"
                    variant={active ? "filled" : "default"}
                    onClick={() =>
                      setS({
                        ...s,
                        skills: preset.skills.map((name) => ({
                          name,
                          minLevel: PRESET_MIN_LEVEL,
                        })),
                      })
                    }
                  >
                    {preset.name}
                  </Button>
                );
              })}
            </Group>
          </Stack>
        )}

        <Stack gap="xs">
          <Title order={6}>Min character level: {s.filter.minLevel ?? 80}</Title>
          <Slider
            min={1}
            max={99}
            value={s.filter.minLevel ?? 80}
            onChange={(v) => setS({ ...s, filter: { ...s.filter, minLevel: v } })}
          />
        </Stack>

        <Stack gap="xs">
          <Title order={6}>Skills</Title>
          {s.skills.length > 0 && (
            <Group gap="xs">
              {s.skills.map((sk) => (
                <Pill key={sk.name} withRemoveButton onRemove={() => toggleSkill(sk.name)}>
                  {sk.name} ≥
                  <NumberInput
                    value={sk.minLevel}
                    onChange={(v) =>
                      setSkillLevel(sk.name, typeof v === "number" ? v : parseInt(String(v)) || 1)
                    }
                    min={1}
                    max={30}
                    hideControls
                    style={{ display: "inline-block", width: 40, marginLeft: 4 }}
                  />
                </Pill>
              ))}
            </Group>
          )}
          {skillNames.length > 0 && (
            <ScrollArea h={240}>
              <Stack gap={2}>
                {skillNames.map((name) => (
                  <Button
                    key={name}
                    variant={selectedSkillNames.has(name) ? "filled" : "subtle"}
                    justify="flex-start"
                    onClick={() => toggleSkill(name)}
                  >
                    {name}
                  </Button>
                ))}
              </Stack>
            </ScrollArea>
          )}
        </Stack>

        <Button onClick={() => onSubmit(s)} size="lg">
          Generate guide
        </Button>
      </Stack>
    </Box>
  );
}
```

(This is a draft — adjust to match pd2.tools' typical styling: probably use `Container` widths, Mantine theming colors, etc. Look at `Builds.tsx` for the conventions.)

- [x] **Step 4: Wire FilterForm into Meta.tsx**

Replace `web/src/pages/Meta.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Container, Title, Text, Stack, Loader, Alert, Code } from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useMetaData } from "../hooks/useMetaData";
import { FilterForm } from "../components/meta/FilterForm";
import { DEFAULT_UI_STATE, paramsToUiState, uiStateToParams, type UiState } from "../lib/url-state";

export default function Meta() {
  const [uiState, setUiState] = useState<UiState>(DEFAULT_UI_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setUiState(paramsToUiState(new URLSearchParams(window.location.search)));
    setHydrated(true);
  }, []);

  function handleSubmit(s: UiState) {
    setUiState(s);
    window.history.replaceState(null, "", "?" + uiStateToParams(s).toString());
  }

  const { data, isLoading, error } = useMetaData({
    gameMode: uiState.filter.gameMode,
    className: uiState.filter.className || "Paladin",
    minLevel: uiState.filter.minLevel ?? 80,
    skills: uiState.skills,
  });

  if (!hydrated) {
    return (
      <Container size="xl" py="md">
        <Title order={1}>Meta</Title>
        <Text c="dimmed">Loading…</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Helmet>
        <title>Meta — PD2 Tools</title>
      </Helmet>
      <Title order={1} mb="sm">
        Meta
      </Title>
      <FilterForm initial={uiState} onSubmit={handleSubmit} />
      {isLoading && <Loader />}
      {error && <Alert color="red">{error.message}</Alert>}
      {data && (
        <Stack>
          <Text>Cohort size: <strong>{data.cohortSize}</strong></Text>
          <Code block>{JSON.stringify(data.itemUsage.slice(0, 10), null, 2)}</Code>
        </Stack>
      )}
    </Container>
  );
}
```

- [x] **Step 5: Test in browser**

`npm run dev` (or `docker-compose up`). Visit `/meta`. Click through:
- Switch tabs (Build a guide / Diff my character)
- Pick a class — verify build presets appear
- Click a preset — verify skill chip appears
- Manually toggle a skill — verify chip appears/disappears
- Adjust min level slider
- Click "Generate guide" — verify URL updates and data refetches

- [x] **Step 6: Lint + typecheck**

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork/web"
npm run lint
npx tsc --noEmit
```

- [x] **Step 7: Commit**

```bash
git add web/src/components/meta/FilterForm.tsx web/src/pages/Meta.tsx
git commit -m "feat(meta): FilterForm in Mantine

Mode toggle (guide/diff), game mode pills, class selector, build
preset row, min-level slider, skill picker with chips. URL-state
hydration on mount, URL update on submit.

Skill names sourced from data/skill-prereqs.json for now — TODO:
in a future iteration, fetch class skills from the meta endpoint
so the source of truth is one place."
```

**Checkpoint 4 done.** FilterForm works end-to-end. Picking different filters in the UI triggers different meta API calls; data refreshes.

---

## Task 16 — Port ItemFrequencyTable to Mantine

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/components/meta/ItemFrequencyTable.tsx`
- Modify: `web/src/pages/Meta.tsx`

- [x] **Step 1: Read the existing reference**

Open `pd2-tools-fork/web/src/components/builds/UniqueCard/index.tsx` or whichever component shows tabular item data on the `/builds` page. Note: do they use `mantine-react-table`? A custom `<Table>`? Match their pattern.

Also read `PD2/src/components/ItemFrequencyTable.tsx` for the data shape we display.

- [x] **Step 2: Write the component**

Create `web/src/components/meta/ItemFrequencyTable.tsx`. Use `mantine-react-table` if pd2-tools uses it elsewhere; otherwise a plain Mantine `<Table>` with `<Tabs>` for the 9 slot views.

```tsx
import { Tabs, Table, Text, Badge, Group } from "@mantine/core";
import { shapeTopItemsBySlot, type TopItemsBySlot } from "../../lib/shape/topItems";
import type { ItemUsageRow } from "../../api/meta";

const SLOTS: Array<keyof TopItemsBySlot> = [
  "helm", "armor", "weapon", "offhand", "gloves", "belt", "boots", "amulet", "ring",
];

export function ItemFrequencyTable({ rows }: { rows: ItemUsageRow[] }) {
  const bySlot = shapeTopItemsBySlot(rows);
  return (
    <Tabs defaultValue="helm">
      <Tabs.List>
        {SLOTS.map((slot) => (
          <Tabs.Tab key={slot} value={slot}>
            {slot} ({bySlot[slot].length})
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {SLOTS.map((slot) => (
        <Tabs.Panel key={slot} value={slot} pt="md">
          {bySlot[slot].length === 0 ? (
            <Text c="dimmed" fs="italic">— no data —</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Item</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th ta="right">Count</Table.Th>
                  <Table.Th ta="right">%</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bySlot[slot].map((item) => (
                  <Table.Tr key={item.itemName}>
                    <Table.Td>{item.itemName}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={rarityColor(item.itemType)}>
                        {item.itemType}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">{item.count.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{item.pct.toFixed(1)}%</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

function rarityColor(itemType: string): string {
  switch (itemType) {
    case "Unique": return "yellow";
    case "Set": return "green";
    case "Runeword": return "orange";
    case "Rare": return "yellow";
    case "Magic": return "blue";
    case "Crafted": return "violet";
    default: return "gray";
  }
}
```

- [x] **Step 3: Wire into Meta.tsx**

Replace the JSON dump in Meta.tsx with `<ItemFrequencyTable rows={data.itemUsage} />` inside an Accordion or Stack section.

- [x] **Step 4: Test in browser + commit**

Verify the table renders for the current filter. Commit:

```bash
git add web/src/components/meta/ItemFrequencyTable.tsx web/src/pages/Meta.tsx
git commit -m "feat(meta): ItemFrequencyTable in Mantine

Tabbed table per slot (helm, armor, weapon, offhand, gloves, belt,
boots, amulet, ring). Rarity badges color-coded. Uses
shapeTopItemsBySlot from the ported lib."
```

---

## Task 17 — Port AffixFrequencyTable to Mantine

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/components/meta/AffixFrequencyTable.tsx`
- Modify: `web/src/pages/Meta.tsx`

- [x] **Step 1: Backend gap check**

Look at the current `MetaResponse` shape. It has `itemUsage` (named items) but NOT affix-mod aggregations. Affix mods are computed client-side in PD2 from raw characters; the fork doesn't have raw characters on the FE.

Decision: this requires a NEW backend aggregation. Add it.

In `api/src/database/postgres/meta.ts`, add:

```ts
export type AffixModRow = {
  slot: string;
  modName: string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
  avg: number;
  median: number;
  p75: number;
};

export async function aggregateAffixMods(
  cohortIds: number[],
): Promise<AffixModRow[]> {
  if (cohortIds.length === 0) return [];
  const pool = getPool();
  // Aggregates affix mods on Rare/Magic/Crafted items, per slot.
  // Schema assumption: character_item.modifiers is JSONB array of { name, values }.
  // Adjust if their schema stores modifiers differently (separate table, etc.).
  const sql = `
    WITH mods AS (
      SELECT
        ci.slot,
        m->>'name' AS mod_name,
        (m->'values'->>0)::float AS mod_value
      FROM character_item ci, jsonb_array_elements(ci.modifiers) AS m
      WHERE ci.character_id = ANY($1::int[])
        AND ci.item_type IN ('Rare', 'Magic', 'Crafted')
        AND ci.is_equipped = true
        AND ci.slot IS NOT NULL
    )
    SELECT
      slot,
      mod_name AS "modName",
      COUNT(*)::int AS "numOccurrences",
      $2::int AS "totalSample",
      (COUNT(*)::float / $2 * 100) AS pct,
      AVG(mod_value) AS avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mod_value) AS median,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY mod_value) AS p75
    FROM mods
    GROUP BY slot, mod_name
    HAVING COUNT(*) >= 3
    ORDER BY slot, pct DESC
  `;
  const result = await pool.query<AffixModRow>(sql, [cohortIds, cohortIds.length]);
  return result.rows;
}
```

Add to the meta route + types as well. Then the FE can consume it directly.

- [x] **Step 2: Update backend types + route**

Add `affixMods: AffixModRow[]` to `MetaResponse` in both `api/src/types/meta.ts` and `web/src/api/meta.ts`. Add to the route's Promise.all.

- [x] **Step 3: Write the component**

Similar to ItemFrequencyTable — tabs per slot, table per slot showing modName, pct, avg, median, p75. Use a mod-name dictionary lookup for display labels (port logic from PD2's affix display).

```tsx
import { Tabs, Table, Text } from "@mantine/core";
import type { AffixModRow } from "../../api/meta";
import modDictionary from "../../data/mod-dictionary.json";

const SLOTS = ["helm", "armor", "weapon", "offhand", "gloves", "belt", "boots", "amulet", "ring"];

export function AffixFrequencyTable({ rows }: { rows: AffixModRow[] }) {
  const bySlot: Record<string, AffixModRow[]> = {};
  for (const r of rows) {
    if (!bySlot[r.slot]) bySlot[r.slot] = [];
    bySlot[r.slot].push(r);
  }
  return (
    <Tabs defaultValue="helm">
      <Tabs.List>
        {SLOTS.map((slot) => (
          <Tabs.Tab key={slot} value={slot}>
            {slot} ({bySlot[slot]?.length || 0})
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {SLOTS.map((slot) => (
        <Tabs.Panel key={slot} value={slot} pt="md">
          {!bySlot[slot] || bySlot[slot].length === 0 ? (
            <Text c="dimmed" fs="italic">— no data —</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mod</Table.Th>
                  <Table.Th ta="right">%</Table.Th>
                  <Table.Th ta="right">Avg</Table.Th>
                  <Table.Th ta="right">Median</Table.Th>
                  <Table.Th ta="right">p75</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bySlot[slot].slice(0, 20).map((row) => (
                  <Table.Tr key={row.modName}>
                    <Table.Td>
                      {(modDictionary as Record<string, { displayLabel?: string }>)[row.modName]?.displayLabel || row.modName}
                    </Table.Td>
                    <Table.Td ta="right">{row.pct.toFixed(1)}%</Table.Td>
                    <Table.Td ta="right">{row.avg.toFixed(1)}</Table.Td>
                    <Table.Td ta="right">{row.median.toFixed(1)}</Table.Td>
                    <Table.Td ta="right">{row.p75.toFixed(1)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
```

- [x] **Step 4: Wire + test + commit**

Add `<AffixFrequencyTable rows={data.affixMods} />` to Meta.tsx. Verify table renders. Commit:

```bash
git add api/src/database/postgres/meta.ts api/src/routes/meta.ts api/src/types/meta.ts web/src/api/meta.ts web/src/components/meta/AffixFrequencyTable.tsx web/src/pages/Meta.tsx
git commit -m "feat(meta): AffixFrequencyTable + backend aggregateAffixMods

Adds the backend aggregation for affix mods on Rare/Magic/Crafted
items (PERCENTILE_CONT for median/p75) — replacing client-side
aggregation from PD2 since we no longer have raw character data
on the FE. Mantine table grouped by slot, top 20 mods per slot."
```

---

## Task 18 — Port CharmPanel, BuildSheet, DataFreshness, MatchBanner

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/components/meta/CharmPanel.tsx`
- Create: `web/src/components/meta/BuildSheet.tsx`
- Create: `web/src/components/meta/DataFreshness.tsx`
- Create: `web/src/components/meta/MatchBanner.tsx`
- Modify: `web/src/pages/Meta.tsx`

These are smaller components. Port them following the same Mantine pattern. Each one is a clear translation from `PD2/src/components/X.tsx` to a Mantine version.

For **CharmPanel**: needs a backend aggregation similar to affix mods but scoped to charm items. Add `aggregateCharms` to `meta.ts`. (Schema assumption: charms are `character_item` rows where `item_type` = `Charm` and aren't in equipment slot — adjust to match their actual data.)

For **BuildSheet**: uses `skillUsage` from the existing response. Add the prereq-classifier logic — port the `aggregateSkillUsage` function from `PD2/src/lib/aggregate/skillUsage.ts` but adapt it to take server-aggregated `SkillUsageRow[]` rather than raw `Character[]`. The classification (main/synergy/prereq/utility) still works because it's based on point distributions, which the API provides in aggregate.

Actually — re-examining `aggregateSkillUsage`: it requires PER-CHARACTER skill levels (it checks for each character whether any other skill at >1pt has this skill as a prereq). The server's `skillUsage` endpoint gives us aggregate counts, not per-character distributions.

Two options:
- **A: Move the classifier to the backend.** Add a `classifyBuildSkill` SQL/aggregation step that classifies each (skill, character) pair using the prereq map. Then return aggregated counts per classification.
- **B: Skip prereq classification on the fork.** Show the raw skill frequency without the toggle. Accept the regression.

Decision: **A**. The prereq classification is one of our key features (it directly fixed commenter A's bug). Skipping it is a feature regression. Port the classifier as a backend aggregation.

This is significant new backend work. Pull it out as Task 18a:

- [x] **Task 18a — Backend: classified skill aggregation**

In `api/src/database/postgres/meta.ts`:

```ts
import skillPrereqsRaw from "../../../web/src/data/skill-prereqs.json";

type SkillPrereqs = Record<string, Record<string, { prereqs: string[]; receivesBonusesFrom: string[] }>>;
const SKILL_PREREQS = skillPrereqsRaw as SkillPrereqs;

export type ClassifiedSkillRow = SkillUsageRow & {
  numAsBuild: number;
  numAsPrereq: number;
  pctBuild: number;
};

/**
 * Classify each character's 1-point skills as "prereq" if some skill at
 * baseLevel > 1 on the same character has it as a prereq. Then aggregate
 * counts of "numAsBuild" (count where it's part of the build) vs
 * "numAsPrereq" (count where it's a prereq-only).
 *
 * This requires per-character skill data — done by SQL window functions.
 */
export async function aggregateSkillUsageClassified(
  cohortIds: number[],
  className: string,
): Promise<ClassifiedSkillRow[]> {
  if (cohortIds.length === 0) return [];
  const classMap = SKILL_PREREQS[className];
  if (!classMap) {
    // Unknown class — fall back to non-classified.
    const rows = await aggregateSkillUsage(cohortIds);
    return rows.map((r) => ({
      ...r,
      numAsBuild: r.numOccurrences,
      numAsPrereq: 0,
      pctBuild: r.pct,
    }));
  }

  const pool = getPool();
  // Pull all (character, skill, baseLevel) tuples for the cohort.
  // Classify per character in app code rather than in SQL — easier.
  const sql = `
    SELECT cs.character_id, cs.skill_name, cs.base_level
    FROM character_skill cs
    WHERE cs.character_id = ANY($1::int[])
      AND cs.base_level >= 1
  `;
  const result = await pool.query<{ character_id: number; skill_name: string; base_level: number }>(
    sql,
    [cohortIds],
  );

  // Group by character.
  const byChar = new Map<number, Map<string, number>>();
  for (const row of result.rows) {
    let cs = byChar.get(row.character_id);
    if (!cs) {
      cs = new Map();
      byChar.set(row.character_id, cs);
    }
    cs.set(row.skill_name, row.base_level);
  }

  // Aggregate per skill: numWithAny / numAsBuild / numAsPrereq.
  const stats = new Map<string, { numWithAny: number; numAsBuild: number; numAsPrereq: number }>();
  for (const [, charSkills] of byChar) {
    for (const [skillName, baseLevel] of charSkills) {
      let s = stats.get(skillName);
      if (!s) {
        s = { numWithAny: 0, numAsBuild: 0, numAsPrereq: 0 };
        stats.set(skillName, s);
      }
      s.numWithAny++;
      if (isPrereqOnly(skillName, charSkills, classMap)) {
        s.numAsPrereq++;
      } else {
        s.numAsBuild++;
      }
    }
  }

  const total = cohortIds.length;
  const out: ClassifiedSkillRow[] = [];
  for (const [name, s] of stats) {
    out.push({
      name,
      numOccurrences: s.numWithAny,
      numAsBuild: s.numAsBuild,
      numAsPrereq: s.numAsPrereq,
      totalSample: total,
      pct: (s.numWithAny / total) * 100,
      pctBuild: (s.numAsBuild / total) * 100,
    });
  }
  out.sort((a, b) => b.pctBuild - a.pctBuild);
  return out.slice(0, 16);
}

function isPrereqOnly(
  skillName: string,
  characterSkills: Map<string, number>,
  classMap: Record<string, { prereqs: string[]; receivesBonusesFrom: string[] }>,
): boolean {
  if (characterSkills.get(skillName) !== 1) return false;
  for (const [otherName, level] of characterSkills) {
    if (level <= 1) continue;
    if (otherName === skillName) continue;
    if (classMap[otherName]?.prereqs.includes(skillName)) return true;
  }
  return false;
}
```

Update `MetaResponse.skillUsage: ClassifiedSkillRow[]`. Update the route. Update the FE types.

Then port BuildSheet, CharmPanel, DataFreshness, MatchBanner as Mantine components — each ~50-100 lines.

- [x] **Step 4: Wire all components into Meta.tsx + test + commit**

Compose all sections in Meta.tsx in the same order PD2 uses. Test in browser.

```bash
git add api/ web/src/components/meta/ web/src/pages/Meta.tsx
git commit -m "feat(meta): BuildSheet, CharmPanel, DataFreshness, MatchBanner

Backend: aggregateSkillUsageClassified — classifies per-character
skills using the prereq map, returns numAsBuild/numAsPrereq for the
build sheet's prereq toggle.

Frontend: 4 new Mantine components composing the full Meta page UI."
```

**Checkpoint 5 done.** All result sections render. Feature-parity with the standalone for the build-a-guide flow.

---

## Task 19 — Port DiffView (Diff my character)

**Files (in `pd2-tools-fork/`):**
- Create: `web/src/components/meta/DiffView.tsx`
- Modify: `web/src/pages/Meta.tsx`

The diff view compares a user-named character against the cohort's top items. In the fork, character lookup uses pd2-tools' existing characters API (we already have `charactersAPI` available).

- [x] **Step 1: Use existing character API**

Read `web/src/api/characters.ts`. Confirm there's a method like `charactersAPI.getCharacterByName(name)` or `getAccount(account)`. Use that to fetch the character.

- [x] **Step 2: Port the diff function**

Our `web/src/lib/diff.ts` is already ported (Task 14). It takes a `Character` and a `GuideSlice`. The fork's character API likely returns characters in a slightly different shape — write an adapter function in `web/src/lib/diff-adapter.ts` that converts a fork-shaped character to the PD2 `Character` type.

- [x] **Step 3: Write DiffView**

```tsx
import { Stack, Table, Text, Alert } from "@mantine/core";
import { diffCharacter, type CharacterDiff } from "../../lib/diff";

export function DiffView({ data }: { data: CharacterDiff }) {
  return (
    <Stack>
      <Text>Diffing <strong>{data.characterName}</strong> ({data.className} L{data.characterLevel}) against pool.</Text>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Slot</Table.Th>
            <Table.Th>Your item</Table.Th>
            <Table.Th>Pool top</Table.Th>
            <Table.Th>Match</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {Object.values(data.slots).map((s) => (
            <Table.Tr key={s.slot}>
              <Table.Td>{s.slot}</Table.Td>
              <Table.Td>{s.userItemName ?? "(empty)"}</Table.Td>
              <Table.Td>{s.poolTopItemName ?? "(no data)"}</Table.Td>
              <Table.Td>{s.userMatchesPoolTop ? "✓" : "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
```

- [x] **Step 4: Wire into Meta.tsx**

When `uiState.mode === "diff"` and `uiState.diffName` is set, fetch the character via `charactersAPI` and compute the diff using `diffCharacter()`. Show the DiffView; hide the cohort tables.

- [x] **Step 5: Test + commit**

Pick a real character name from pd2.tools. Test the diff. Commit:

```bash
git add web/src/components/meta/DiffView.tsx web/src/lib/diff-adapter.ts web/src/pages/Meta.tsx
git commit -m "feat(meta): Diff my character view

Looks up the named character via charactersAPI, adapts to the PD2
Character shape, runs diffCharacter against the current cohort's
top items, renders a per-slot comparison table."
```

**Checkpoint 6 done.**

---

## Task 20 — Polish: loading states, error handling, responsive, accessibility

**Files (in `pd2-tools-fork/`):**
- Modify: `web/src/pages/Meta.tsx` and all `web/src/components/meta/*.tsx`

- [x] **Step 1: Loading states**

For each section (FilterForm, ItemFrequencyTable, AffixFrequencyTable, etc.), add a Mantine `<Skeleton>` or `<Loader>` when data is loading.

- [x] **Step 2: Error handling**

Wrap the data fetch in a Mantine `<Alert color="red">` with a "retry" button on error.

- [x] **Step 3: Empty state**

If `cohortSize === 0`: show a friendly empty state ("No characters match this filter. Try a different class or skills.")

- [x] **Step 4: Mobile responsive**

Test at 375px width (iPhone SE). Mantine components are mostly responsive by default, but tables may need to scroll horizontally. Wrap tables in `<ScrollArea>` or use Mantine's responsive table props.

- [x] **Step 5: Accessibility check**

- All interactive elements have `aria-label` or visible text
- Tab navigation works for keyboard users
- Color contrast meets WCAG AA (Mantine's defaults usually do)
- Focus states are visible

- [x] **Step 6: Commit**

```bash
git add web/src/pages/Meta.tsx web/src/components/meta/
git commit -m "feat(meta): polish — loading/error/empty/responsive/a11y

Skeletons during initial load, Alert on error with retry, friendly
empty state when cohort is empty, ScrollArea wrappers for tables on
mobile, keyboard tab order verified."
```

**Checkpoint 7 done.**

---

## Task 21 — Sprint close in PD2/ + PR draft + push

**Files (in PD2/ and pd2-tools-fork/):**

- [x] **Step 1: Final smoke test in fork**

`docker-compose up`. Visit `/meta`. Test:
- Hammerdin filter → see Hammerdin data
- Switch to WW Barb preset → data refreshes
- Diff a known character
- Resize browser to mobile

Run `npm run lint`, `npx tsc --noEmit`, `npm test` (backend Jest only — frontend has no test script). All clean.

- [x] **Step 2: Delete the temporary recon notes**

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork"
git rm .meta-recon-notes.md
git commit -m "chore(meta): drop temporary schema recon notes"
```

- [x] **Step 3: Write the PR description**

In a separate file or as the PR body — draft:

```markdown
## Add /meta build aggregator page

Adds a new top-level page at `/meta` that aggregates Project Diablo 2
ladder build data: top items per slot, affix mod patterns, charm
patterns, skill usage with prereq classification, mercenary, level
distribution, plus a "diff my character" mode.

This implementation is a port of https://pd2-aggregator.vercel.app —
discussed in Discord (link to thread). All public-API code paths
have been replaced with direct Postgres aggregations via a new
Express route + autoCache(900) middleware.

### What's new

**Backend:**
- `api/src/routes/meta.ts` — single GET endpoint with strict query-param parsing
- `api/src/database/postgres/meta.ts` — six aggregations (cohort filter, item usage, affix mods with median/p75, skill usage with prereq classification, mercenary, level distribution)
- `api/src/types/meta.ts` — request + response types
- `api/src/routes/meta.test.ts` — Jest + supertest, 42 sub-tests across 7 canonical builds

**Frontend:**
- `web/src/pages/Meta.tsx` — top-level page
- `web/src/components/meta/*` — 8 components (FilterForm, BuildSheet, ItemFrequencyTable, AffixFrequencyTable, CharmPanel, DiffView, DataFreshness, MatchBanner)
- `web/src/api/meta.ts` — typed API client
- `web/src/hooks/useMetaData.ts` — React Query hook
- `web/src/lib/*` — pure logic ported from pd2-aggregator (slot map, build presets, URL state, diff function, type definitions)
- `web/src/data/*` — skill prereq + synergy data, item-slot map, build preset definitions, affix mod dictionary

**Wired in:**
- `web/src/App.tsx` — `<Route path="/meta">`
- `web/src/components/layout/NavBar.tsx` — new menu entry
- `web/src/config/api.ts` — `META` endpoint constant
- `api/src/routes/index.ts` — mount `/meta` router
- `api/src/database/index.ts` — export `metaDB`
- `api/src/types/index.ts` — re-export meta types

### Verification

- Backend Jest tests pass (`cd api && npm test`)
- Frontend tsc clean + eslint clean (`cd web && npx tsc --noEmit && npm run lint`)
- Manual smoke test for 7 canonical builds — output matches `pd2-aggregator.vercel.app` within drift tolerance
- Tested at mobile width (375px)

### Open follow-ups (not in this PR)

- Add a frontend test runner — `web/` has no vitest/jest setup currently; we lean on the existing tsc + eslint + manual testing. Happy to open a follow-up PR if you'd like vitest added.
- Aggregate Rare/Magic/Crafted items by base (currently only Unique/Set/Runeword are name-aggregable)
- Build-name auto-detection — given a cohort, identify which canonical build applies

### Data sources

- Skill prereq + synergy data scraped from wiki.projectdiablo2.com (CC-BY-SA — attribution in `web/src/data/`)
- Affix mod dictionary derived from `coleestrin/pd2-tools` (already in this repo)
- Item-slot map regenerated from snapshot data (pd2-tools' character DB)

### Screenshots

[insert screenshots — desktop + mobile, filter form + results + diff view]

---

Built by Steven Obst — happy to iterate on review feedback. Discord thread for context: [link]
```

- [x] **Step 4: Push branch + open PR**

```bash
cd "C:/Coding/III____Full_Circle/pd2-tools-fork"
git push -u origin feature/meta-build-aggregator
```

Go to GitHub: https://github.com/coleestrin/pd2-tools/compare/main...314159DD:pd2-tools:feature/meta-build-aggregator

Open the PR. Use the description above. Don't mark "Ready for review" yet — discuss with Steven first if anything needs tweaking before announcing on Discord.

- [x] **Step 5: Ping coleestrin on Discord**

Send LAMP a Discord message:

> Hey, the meta page PR is ready: [link]. Took the look-and-feel approach we discussed; backend uses direct DB queries via a new `/meta` route with autoCache, frontend ports the aggregation logic + UI in Mantine. Jest tests cover the parity assertions. Let me know what feedback you have — happy to iterate.

- [x] **Step 6: In PD2/: update plan docs + close sprint**

```bash
cd "C:/Coding/III____Full_Circle/PD2"
git checkout sprint/2.3-meta-integration

# Update CLAUDE.md status line
# Update plan/roadmap.md — Sprint 2.3 marked DONE with delivered summary
# Mark all checkboxes [x] in plan/sprints/sprint-2.3-meta-integration.md
# Move plan/sprints/sprint-2.3-meta-integration.md → plan/sprints/archive/

# Commit + merge to main
```

(Detailed close steps mirror Sprint 2.2's Task 8 close — same pattern.)

**Checkpoint 8 done. PR submitted. Sprint complete.**

---

## Done When

- [x] All 21 tasks marked completed
- [x] PR open against `coleestrin/pd2-tools:main` from `314159DD:pd2-tools:feature/meta-build-aggregator`
- [x] Backend Jest tests green in CI
- [x] Frontend tsc + eslint green in CI
- [x] Discord ping sent to LAMP
- [x] PD2/ sprint 2.3 file archived, roadmap + CLAUDE.md updated, merged to main

## Out of scope (per spec)

- vitest setup on the fork's frontend
- Refactors in pd2-tools outside `/meta`-related files
- New product features beyond standalone parity
- Dual public-API + direct-DB code paths in the fork
- Editing the standalone (PD2/) source

## Deferred follow-ups (per spec, post-merge tracking)

- Add a frontend test runner to pd2-tools
- Cross-cutting refactors in pd2-tools
- New product features (build-name auto-detect, historical trends, browser extension, Discord bot, saved filters)
- Standalone sunset timeline (~3-month redirect, then takedown)
