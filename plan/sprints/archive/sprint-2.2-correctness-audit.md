# Sprint 2.2 — Correctness audit + integration prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Branch:** `sprint/2.2-correctness-audit`
**Spec:** [`docs/specs/2026-05-11-sprint-2.2-correctness-audit-design.md`](../../docs/specs/2026-05-11-sprint-2.2-correctness-audit-design.md)

**Goal:** Ship a validation test suite that would have caught the 2.1.1 + 2.1.2 bugs before they reached production, plus the open-source posture changes needed before we can contribute to `coleestrin/pd2-tools`.

**Architecture:**
- Validation tests are fixture-based (deterministic, fast, no CI flakiness, no rate-limit risk to pd2.tools).
- One canonical build per class (7 total) sourced from existing `data/builds.json`.
- API URL contract tests use mocked `fetch` to verify our query builder passes `skills` correctly — would have caught 2.1.1 without needing live data.

**Tech Stack:** Vitest, TypeScript, Node 22, tsx (script runner). No new dependencies.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `scripts/refresh-validation-fixtures.ts` | NEW | Fetches stats endpoints for 7 canonical builds, writes fixtures |
| `src/lib/validation/fixtures/README.md` | NEW | When + how to refresh fixtures |
| `src/lib/validation/fixtures/paladin-hammerdin.json` | NEW | Generated fixture |
| `src/lib/validation/fixtures/amazon-lightning-fury.json` | NEW | Generated fixture |
| `src/lib/validation/fixtures/sorceress-blizzard.json` | NEW | Generated fixture |
| `src/lib/validation/fixtures/barbarian-whirlwind.json` | NEW | Generated fixture |
| `src/lib/validation/fixtures/necromancer-bone-spear.json` | NEW | Generated fixture |
| `src/lib/validation/fixtures/assassin-lightning-trapsin.json` | NEW | Generated fixture |
| `src/lib/validation/fixtures/druid-wind-tornado.json` | NEW | Generated fixture |
| `src/lib/validation/parity.test.ts` | NEW | Per-build parity tests against fixtures |
| `src/lib/api.url-contract.test.ts` | NEW | Mocked-fetch URL builder tests |
| `LICENSE` | NEW | MIT license matching `coleestrin/pd2-tools` |
| `README.md` | REWRITE | Replace 2-line stub with full project README |
| `plan/architecture/integration-notes.md` | NEW | Agenda for the coleestrin integration conversation |
| `CLAUDE.md` | MODIFY | Add fixture refresh command + status line update on close |
| `plan/roadmap.md` | MODIFY | Mark Sprint 2.2 done on close |

**Note on `src/lib/validation/`:** the project's convention is `<source>.test.ts` next to the source file. Validation tests cross-cut several modules (`api.ts`, `shape/topItems.ts`, `slot.ts`), so they get their own directory rather than landing arbitrarily in one. Fixtures live next to their consumer.

---

## Task 1 — API URL contract tests

Catches the 2.1.1-shape bug: our query builder must include `skills=` when given a non-empty skills array. Uses mocked `fetch` — no network.

**Files:**
- Create: `src/lib/api.url-contract.test.ts`

- [x] **Step 1 — Write the test file**

Create `src/lib/api.url-contract.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getMercItemUsage,
  getLevelDistribution,
} from "./api";

// Captures every URL the api.ts functions fetch, without hitting the network.
// Asserts the contract: when a non-empty skills array is passed, the URL must
// include a `skills=` JSON-encoded query parameter. When skills is omitted, the
// URL must NOT include `skills=`. This would have failed loudly when Sprint 2.1
// shipped — our endpoints were being called without skills and we never noticed
// until users compared our output to pd2.tools' UI.

describe("api.ts URL contract", () => {
  let capturedUrls: string[];

  beforeEach(() => {
    capturedUrls = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify([]), { status: 200 }),
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const FILTER = {
    gameMode: "hardcore" as const,
    className: "Amazon",
    minLevel: 80,
  };
  const SKILLS = [{ name: "Lightning Fury", minLevel: 20 }];

  describe("when skills array is non-empty", () => {
    it("getItemUsage URL includes skills= JSON-encoded", async () => {
      await getItemUsage(FILTER, SKILLS);
      expect(capturedUrls).toHaveLength(1);
      const params = new URL(capturedUrls[0]).searchParams;
      const raw = params.get("skills");
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(SKILLS);
    });

    it("getSkillUsage URL includes skills= JSON-encoded", async () => {
      await getSkillUsage(FILTER, SKILLS);
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });

    it("getMercTypeUsage URL includes skills= JSON-encoded", async () => {
      await getMercTypeUsage(FILTER, SKILLS);
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });

    it("getMercItemUsage URL includes skills= JSON-encoded", async () => {
      await getMercItemUsage(FILTER, SKILLS);
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });

    it("getLevelDistribution URL includes skills= JSON-encoded", async () => {
      await getLevelDistribution(
        { gameMode: FILTER.gameMode, className: FILTER.className },
        SKILLS,
      );
      expect(JSON.parse(new URL(capturedUrls[0]).searchParams.get("skills")!))
        .toEqual(SKILLS);
    });
  });

  describe("when skills array is omitted or empty", () => {
    it("getItemUsage URL omits skills=", async () => {
      await getItemUsage(FILTER);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getItemUsage URL omits skills= for explicit empty array", async () => {
      await getItemUsage(FILTER, []);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getSkillUsage URL omits skills=", async () => {
      await getSkillUsage(FILTER);
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });

    it("getLevelDistribution URL omits skills=", async () => {
      await getLevelDistribution({
        gameMode: FILTER.gameMode,
        className: FILTER.className,
      });
      expect(new URL(capturedUrls[0]).searchParams.has("skills")).toBe(false);
    });
  });

  describe("baseline params always present", () => {
    it("includes gameMode + classes + minLevel for getItemUsage", async () => {
      await getItemUsage(FILTER, SKILLS);
      const params = new URL(capturedUrls[0]).searchParams;
      expect(params.get("gameMode")).toBe("hardcore");
      expect(params.get("classes")).toBe("Amazon");
      expect(params.get("minLevel")).toBe("80");
    });
  });
});
```

- [x] **Step 2 — Run the tests**

Run: `npx vitest run src/lib/api.url-contract.test.ts`

Expected: all 11 tests pass. (Existing api.ts code from Sprint 2.1.1 already implements this contract; the tests lock it in.)

- [x] **Step 3 — Commit**

```bash
git add src/lib/api.url-contract.test.ts
git commit -m "sprint(2.2): URL contract tests for api.ts stats endpoints

Locks in the post-2.1.1 contract: every stats endpoint must include
skills= when called with a non-empty skills array, and omit it
otherwise. Mocked fetch, no network.

These tests would have failed loudly when Sprint 2.1 shipped —
catching the cohort-mismatch bug before users had to spot it.

11 tests, all green against existing code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Fixture refresh script

Pulls live data from pd2.tools for 7 canonical builds and writes one JSON file per build. Uses our own api.ts so the fixtures capture whatever query shape we send (deliberately — humans diff fixtures against pd2.tools' UI to catch our-side bugs).

**Files:**
- Create: `scripts/refresh-validation-fixtures.ts`
- Create: 7 fixture files under `src/lib/validation/fixtures/`

- [x] **Step 1 — Make the fixtures directory**

```bash
mkdir -p "C:/Coding/III____Full_Circle/PD2/src/lib/validation/fixtures"
```

- [x] **Step 2 — Write the refresh script**

Create `scripts/refresh-validation-fixtures.ts`:

```ts
/**
 * refresh-validation-fixtures.ts
 *
 * Fetches the 5 stats endpoints from api.pd2.tools for each of 7 canonical
 * builds (one per class) and writes one combined JSON file per build to
 * src/lib/validation/fixtures/.
 *
 * The parity test suite (src/lib/validation/parity.test.ts) reads these
 * fixtures and asserts that our shaping / slot-mapping preserves API data.
 *
 * Deliberately uses src/lib/api.ts (the same API client the app uses), so any
 * bug in URL building affects the fixtures the same way it affects production.
 * Humans diffing fixtures vs pd2.tools' UI catch those — see the design spec.
 *
 * Run weekly during active development, on every PD2 patch, or whenever a
 * parity test starts looking suspicious:
 *   npx tsx scripts/refresh-validation-fixtures.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getMercItemUsage,
  getLevelDistribution,
  type CommonFilter,
  type ItemUsageRow,
  type SkillUsageRow,
  type MercTypeUsageRow,
  type LevelDistribution,
} from "../src/lib/api";

type CanonicalBuild = {
  slug: string;
  className: string;
  build: string;
  skills: Array<{ name: string; minLevel: number }>;
};

const CANONICAL_BUILDS: CanonicalBuild[] = [
  { slug: "amazon-lightning-fury",      className: "Amazon",      build: "Lightning Fury",    skills: [{ name: "Lightning Fury", minLevel: 20 }] },
  { slug: "assassin-lightning-trapsin", className: "Assassin",    build: "Lightning Trapsin", skills: [{ name: "Lightning Sentry", minLevel: 20 }] },
  { slug: "barbarian-whirlwind",        className: "Barbarian",   build: "Whirlwind",         skills: [{ name: "Whirlwind", minLevel: 20 }] },
  { slug: "druid-wind-tornado",         className: "Druid",       build: "Wind (Tornado)",    skills: [{ name: "Tornado", minLevel: 20 }] },
  { slug: "necromancer-bone-spear",     className: "Necromancer", build: "Bone Spear",        skills: [{ name: "Bone Spear", minLevel: 20 }] },
  { slug: "paladin-hammerdin",          className: "Paladin",     build: "Hammerdin",         skills: [{ name: "Blessed Hammer", minLevel: 20 }] },
  { slug: "sorceress-blizzard",         className: "Sorceress",   build: "Blizzard",          skills: [{ name: "Blizzard", minLevel: 20 }] },
];

const COMMON: Omit<CommonFilter, "className"> = {
  gameMode: "hardcore",
  minLevel: 80,
};

type FixtureFile = {
  _meta: {
    build: string;
    fetchedAt: string;
    filter: CommonFilter;
    skills: CanonicalBuild["skills"];
  };
  itemUsage: ItemUsageRow[];
  skillUsage: SkillUsageRow[];
  mercTypeUsage: MercTypeUsageRow[];
  mercItemUsage: ItemUsageRow[];
  levelDistribution: LevelDistribution;
};

async function fetchOne(b: CanonicalBuild): Promise<FixtureFile> {
  const filter: CommonFilter = { ...COMMON, className: b.className };
  const [itemUsage, skillUsage, mercTypeUsage, mercItemUsage, levelDistribution] =
    await Promise.all([
      getItemUsage(filter, b.skills),
      getSkillUsage(filter, b.skills),
      getMercTypeUsage(filter, b.skills),
      getMercItemUsage(filter, b.skills),
      getLevelDistribution(
        { gameMode: filter.gameMode, className: filter.className },
        b.skills,
      ),
    ]);
  return {
    _meta: {
      build: b.slug,
      fetchedAt: new Date().toISOString(),
      filter,
      skills: b.skills,
    },
    itemUsage,
    skillUsage,
    mercTypeUsage,
    mercItemUsage,
    levelDistribution,
  };
}

async function main() {
  const root = process.cwd();
  const outDir = join(root, "src", "lib", "validation", "fixtures");
  await mkdir(outDir, { recursive: true });

  // Concurrency cap of 3 — be polite to api.pd2.tools.
  const CONCURRENCY = 3;
  for (let i = 0; i < CANONICAL_BUILDS.length; i += CONCURRENCY) {
    const batch = CANONICAL_BUILDS.slice(i, i + CONCURRENCY);
    console.log(`Fetching: ${batch.map((b) => b.slug).join(", ")}…`);
    await Promise.all(
      batch.map(async (b) => {
        const data = await fetchOne(b);
        const path = join(outDir, `${b.slug}.json`);
        await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
        const total = data.itemUsage[0]?.totalSample ?? 0;
        console.log(
          `  ✓ ${b.slug}.json  totalSample=${total}  rows=${data.itemUsage.length}`,
        );
      }),
    );
  }

  console.log(
    `\n✓ Wrote ${CANONICAL_BUILDS.length} fixtures to ${outDir}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [x] **Step 3 — Run the script**

Run: `npx tsx scripts/refresh-validation-fixtures.ts`

Expected output (totalSamples will vary with live ladder):
```
Fetching: amazon-lightning-fury, assassin-lightning-trapsin, barbarian-whirlwind…
  ✓ amazon-lightning-fury.json  totalSample=...  rows=...
  ✓ assassin-lightning-trapsin.json  totalSample=...  rows=...
  ✓ barbarian-whirlwind.json  totalSample=...  rows=...
Fetching: druid-wind-tornado, necromancer-bone-spear, paladin-hammerdin…
  ✓ druid-wind-tornado.json  totalSample=...  rows=...
  ✓ necromancer-bone-spear.json  totalSample=...  rows=...
  ✓ paladin-hammerdin.json  totalSample=...  rows=...
Fetching: sorceress-blizzard…
  ✓ sorceress-blizzard.json  totalSample=...  rows=...

✓ Wrote 7 fixtures to .../src/lib/validation/fixtures
```

- [x] **Step 4 — Sanity-check one fixture**

Run:
```bash
node -e "const f=require('./src/lib/validation/fixtures/paladin-hammerdin.json'); console.log('meta:', JSON.stringify(f._meta, null, 2)); console.log('itemUsage rows:', f.itemUsage.length, 'totalSample:', f.itemUsage[0]?.totalSample); console.log('first 3 items:', f.itemUsage.slice(0,3).map(r=>r.item+' ('+r.itemType+', n='+r.numOccurrences+')').join(', '));"
```

Expected:
- `_meta.skills` contains `[{ name: "Blessed Hammer", minLevel: 20 }]`
- `itemUsage` has > 50 rows
- `totalSample` > 0
- First items include unique/set/runeword names like "Heart of the Oak", "Spirit", "Enigma", etc.

If the totalSample is suspiciously large (e.g., > 500), the `skills` parameter isn't being sent and we have a regression — fix before continuing.

- [x] **Step 5 — Add the refresh command to CLAUDE.md**

Edit `CLAUDE.md`, find the Commands section, and add this line after `build-item-slots-from-wiki.ts`:

```markdown
- `npx tsx scripts/refresh-validation-fixtures.ts` — refresh `src/lib/validation/fixtures/*.json` (run weekly, on PD2 patches, or when parity tests start looking suspicious)
```

- [x] **Step 6 — Commit**

```bash
git add scripts/refresh-validation-fixtures.ts src/lib/validation/fixtures/ CLAUDE.md
git commit -m "sprint(2.2): fixture refresh script + initial fixtures

Pulls all 5 stats endpoints (item-usage, skill-usage, merc-type-usage,
merc-item-usage, level-distribution) for 7 canonical builds — one per
class, sourced from data/builds.json — and writes combined JSON
fixtures to src/lib/validation/fixtures/.

Uses the app's own api.ts deliberately. If our URL builder has a bug,
fixtures capture that bug, parity tests pass against the buggy
fixture, but humans diffing the fixture against pd2.tools' UI catch
it. URL contract tests (api.url-contract.test.ts) cover the
URL-building layer separately.

Concurrency capped at 3 to be polite to api.pd2.tools.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Fixtures README

Explains what fixtures are, when to refresh, what to look for when refreshing.

**Files:**
- Create: `src/lib/validation/fixtures/README.md`

- [x] **Step 1 — Write the README**

Create `src/lib/validation/fixtures/README.md`:

```markdown
# Validation fixtures

Captured pd2.tools API responses for canonical builds (one per class). Used by `src/lib/validation/parity.test.ts` to verify our shaping / slot-mapping preserves API data without dropping items or corrupting percentages.

## Refreshing

```bash
npx tsx scripts/refresh-validation-fixtures.ts
```

Cadence:
- **Weekly** during active development.
- **On every PD2 season patch** — item/skill metadata changes, popular builds shift, item-slots.json may need a wiki re-scrape.
- **Whenever a parity test starts looking suspicious** — either we have a real bug, or the upstream API behavior changed.

## What to look for when refreshing

After running the refresh script, eyeball the `totalSample` values:

| Build | Plausible totalSample range |
|---|---|
| paladin-hammerdin | 50–500 (Hammerdin is the highest-volume HC build by far) |
| amazon-lightning-fury | 20–200 |
| sorceress-blizzard | 30–200 |
| barbarian-whirlwind | 30–200 |
| necromancer-bone-spear | 10–100 |
| assassin-lightning-trapsin | 20–200 |
| druid-wind-tornado | 10–100 |

If a totalSample is suspiciously large (e.g., paladin-hammerdin showing 5000) it means the `skills` parameter isn't being sent — that's a 2.1.1-shape regression and needs fixing before the fixtures are committed.

## File shape

Each fixture is a single JSON file:

```json
{
  "_meta": {
    "build": "amazon-lightning-fury",
    "fetchedAt": "ISO timestamp",
    "filter": { "gameMode": "hardcore", "className": "Amazon", "minLevel": 80 },
    "skills": [{ "name": "Lightning Fury", "minLevel": 20 }]
  },
  "itemUsage": [...],
  "skillUsage": [...],
  "mercTypeUsage": [...],
  "mercItemUsage": [...],
  "levelDistribution": {...}
}
```
```

- [x] **Step 2 — Commit**

```bash
git add src/lib/validation/fixtures/README.md
git commit -m "sprint(2.2): docs for validation fixtures

Cadence, what totalSample ranges to expect on refresh, sanity check
to catch a 2.1.1-shape regression in the act.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Parity test suite

The main correctness deliverable. Five assertions per build × 7 builds = 35 sub-tests. Reads fixtures, runs our shaping, asserts invariants.

**Note vs spec:** Spec's Test 2 said "count items in our output". That undercounts because `shapeTopItemsBySlot` caps each slot at 8 items. The correct metric is "fraction of API rows that have a slot mapping" — which is what would have caught Sprint 2.1.2's 32% drop. The plan below uses this corrected metric.

**Files:**
- Create: `src/lib/validation/parity.test.ts`

- [x] **Step 1 — Write the parity test file**

Create `src/lib/validation/parity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shapeTopItemsBySlot } from "../shape/topItems";
import { slotFromItemName } from "../slot";
import type { ItemUsageRow, SkillUsageRow, MercTypeUsageRow } from "../api";

// Fixture imports — vitest resolves JSON imports natively.
import amazonLightningFury from "./fixtures/amazon-lightning-fury.json";
import assassinLightningTrapsin from "./fixtures/assassin-lightning-trapsin.json";
import barbarianWhirlwind from "./fixtures/barbarian-whirlwind.json";
import druidWindTornado from "./fixtures/druid-wind-tornado.json";
import necromancerBoneSpear from "./fixtures/necromancer-bone-spear.json";
import paladinHammerdin from "./fixtures/paladin-hammerdin.json";
import sorceressBlizzard from "./fixtures/sorceress-blizzard.json";

type Fixture = {
  _meta: { build: string; fetchedAt: string; filter: unknown; skills: unknown };
  itemUsage: ItemUsageRow[];
  skillUsage: SkillUsageRow[];
  mercTypeUsage: MercTypeUsageRow[];
  mercItemUsage: ItemUsageRow[];
  levelDistribution: unknown;
};

const FIXTURES: Fixture[] = [
  amazonLightningFury as Fixture,
  assassinLightningTrapsin as Fixture,
  barbarianWhirlwind as Fixture,
  druidWindTornado as Fixture,
  necromancerBoneSpear as Fixture,
  paladinHammerdin as Fixture,
  sorceressBlizzard as Fixture,
];

const COVERAGE_FLOOR = 0.95;
const PCT_TOLERANCE = 0.01;

describe("server-aggregate parity per canonical build", () => {
  for (const f of FIXTURES) {
    describe(f._meta.build, () => {
      // ── Test 1: totalSample consistency across endpoints ──────────────────
      // The server reports the same cohort size on every stats endpoint for
      // the same filter. If item-usage's totalSample disagrees with
      // skill-usage's, the server's filter semantics changed upstream.
      it("totalSample agrees between itemUsage and skillUsage", () => {
        const itemN = f.itemUsage[0]?.totalSample;
        const skillN = f.skillUsage[0]?.totalSample;
        if (itemN === undefined || skillN === undefined) return;
        expect(skillN).toBe(itemN);
      });

      // ── Test 2: item-slot coverage ≥ 95% ──────────────────────────────────
      // Every named item the API returns SHOULD have a slot mapping in
      // data/item-slots.json. If not, it's silently dropped from the UI
      // (this is the Sprint 2.1.2 bug shape — 32% drop on Cold Arrow Amazon).
      it(`item-slot coverage ≥ ${(COVERAGE_FLOOR * 100).toFixed(0)}%`, () => {
        if (f.itemUsage.length === 0) return;
        const hits = f.itemUsage.filter(
          (r) => slotFromItemName(r.item) !== null,
        ).length;
        const coverage = hits / f.itemUsage.length;
        const missing = f.itemUsage
          .filter((r) => slotFromItemName(r.item) === null)
          .slice(0, 10)
          .map((r) => `${r.itemType}: ${r.item}`);
        expect(
          coverage,
          `${f._meta.build}: ${hits}/${f.itemUsage.length} items have slot mapping ` +
            `(${(coverage * 100).toFixed(1)}%). Missing examples: ${missing.join(", ")}`,
        ).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
      });

      // ── Test 3: no invented items ─────────────────────────────────────────
      // Every item that appears in our shaped output must come from the API.
      // We never make up data.
      it("no invented items — every output item exists in API response", () => {
        const shaped = shapeTopItemsBySlot(f.itemUsage);
        const apiNames = new Set(f.itemUsage.map((r) => r.item));
        for (const items of Object.values(shaped)) {
          for (const item of items) {
            expect(
              apiNames.has(item.itemName),
              `${f._meta.build}: shaped output contains "${item.itemName}" but API didn't return it`,
            ).toBe(true);
          }
        }
      });

      // ── Test 4: slot consistency ──────────────────────────────────────────
      // For every item in our shaped output, slotFromItemName must agree on
      // the slot. shape and slot must be internally consistent.
      it("slot consistency — every item routed by slotFromItemName lookup", () => {
        const shaped = shapeTopItemsBySlot(f.itemUsage);
        for (const [slot, items] of Object.entries(shaped)) {
          for (const item of items) {
            expect(
              slotFromItemName(item.itemName),
              `${f._meta.build}: "${item.itemName}" is in shaped output's ${slot} bucket but slotFromItemName says it belongs elsewhere`,
            ).toBe(slot);
          }
        }
      });

      // ── Test 5: per-item percentage preservation ──────────────────────────
      // For each item in our shaped output, its pct matches the API row's
      // pct exactly (within fp tolerance). We never mutate values during
      // shaping.
      it("percentage preservation — output pct matches API pct per item", () => {
        const shaped = shapeTopItemsBySlot(f.itemUsage);
        const apiByName = new Map(f.itemUsage.map((r) => [r.item, r]));
        for (const [slot, items] of Object.entries(shaped)) {
          for (const item of items) {
            const apiRow = apiByName.get(item.itemName);
            expect(apiRow, `expected API row for ${item.itemName}`).toBeDefined();
            expect(
              item.pct,
              `${f._meta.build}/${slot}/${item.itemName}: shaped pct=${item.pct} but API pct=${apiRow!.pct}`,
            ).toBeCloseTo(apiRow!.pct, 2);
          }
        }
      });
    });
  }
});
```

- [x] **Step 2 — Run the tests**

Run: `npx vitest run src/lib/validation/parity.test.ts`

Expected: all tests pass (5 assertions × 7 builds = 35 sub-tests, all green against current code + freshly-pulled fixtures).

If the coverage test fails for a build:
- Look at the "Missing examples" message — those are items the API returned but our `data/item-slots.json` doesn't know about.
- Run `npx tsx scripts/build-item-slots-from-wiki.ts` to pick up any new items the wiki has.
- Re-run the test.

- [x] **Step 3 — Run the full test suite**

Run: `npm test`

Expected: all tests pass. Previous count was 126; this sprint adds the URL contract tests (11) + parity tests (35) = 172 total tests.

- [x] **Step 4 — Commit**

```bash
git add src/lib/validation/parity.test.ts
git commit -m "sprint(2.2): parity tests against API fixtures

Five assertions per build, seven builds, 35 sub-tests:
- totalSample agreement between item-usage and skill-usage
- ≥ 95% slot coverage of API rows (catches 2.1.2 shape)
- No invented items — output is a subset of API response
- slotFromItemName agrees with shape's bucketing
- Per-item pct preserved exactly through shaping

Coverage floor is 95% (not 100%) because new PD2 patches may add
items the wiki doesn't yet describe.

Spec deviation: spec's Test 2 said 'count items in our output'.
That undercounts because shapeTopItemsBySlot caps each slot at 8.
Corrected: 'fraction of API rows that have a slot mapping' — the
metric that would have caught Sprint 2.1.2's 32% drop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — LICENSE file

MIT license, matching `coleestrin/pd2-tools` for zero compat friction at integration time.

**Files:**
- Create: `LICENSE`

- [x] **Step 1 — Write the LICENSE file**

Create `LICENSE`:

```
MIT License

Copyright (c) 2026 Steven Obst

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [x] **Step 2 — Commit**

```bash
git add LICENSE
git commit -m "sprint(2.2): add MIT LICENSE

Matches coleestrin/pd2-tools for zero compat friction at integration
time. Copyright attribution to Steven Obst.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — README rewrite

Replace 2-line stub with a real project README.

**Files:**
- Modify: `README.md` (rewrite)

- [x] **Step 1 — Rewrite README.md**

Replace the entire content of `README.md` with:

```markdown
# PD2 Build Affix Aggregator

Aggregates Project Diablo 2 ladder builds from the [pd2.tools](https://pd2.tools) public API and surfaces what gear, affixes, and charms top players actually use for a given class + skills filter. Live at **https://pd2-aggregator.vercel.app**.

The use case: PD2 has very few written build guides, especially for off-meta builds. Players who want to know "what affixes should I roll on my Phoenix Strike Assassin's amulet?" can now pull the answer directly from what the ladder is doing.

## Quick start

```bash
git clone https://github.com/314159DD/pd2-aggregator.git
cd pd2-aggregator
npm install
npm run dev
# open http://localhost:3000
```

Other commands:
- `npm test` — run the test suite (vitest)
- `npm run typecheck` — TypeScript check
- `npm run build` — static export to `out/`

## Documentation

- [`plan/README.md`](plan/README.md) — full planning hub (vision, roadmap, architecture, decisions, providers, sprints)
- [`docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`](docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md) — original architecture doc
- [`CLAUDE.md`](CLAUDE.md) — guide for AI agents working in this repo

## Data sources

- **[pd2.tools](https://pd2.tools)** by [@coleestrin](https://github.com/coleestrin) — the ladder data source (public REST API). Without their work, this project doesn't exist.
- **[wiki.projectdiablo2.com](https://wiki.projectdiablo2.com)** — skill prereqs/synergies and item metadata. Content is CC-BY-SA; we link back to the wiki in-app.
- **[coleestrin/pd2-tools](https://github.com/coleestrin/pd2-tools)** — affix mod dictionary (MIT-licensed, copied with attribution).

## Stack

Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind 4, shadcn/ui, vitest. No backend — the browser talks to api.pd2.tools directly. Aggregation runs in a Web Worker; cache lives in IndexedDB.

## Contributing

Issues and PRs welcome. The current sprint and roadmap live in [`plan/`](plan/). Test suite must stay green (`npm test`) and types must check (`npm run typecheck`).

## License

[MIT](LICENSE).
```

- [x] **Step 2 — Commit**

```bash
git add README.md
git commit -m "sprint(2.2): rewrite README for public-repo audience

Replace 2-line stub with a real project README — what it does, quick
start, doc pointers, data-source attribution to pd2.tools, the wiki,
and coleestrin/pd2-tools, stack summary, contribution note.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Integration-prep doc

Agenda for the integration conversation with coleestrin. Not a port plan.

**Files:**
- Create: `plan/architecture/integration-notes.md`

- [x] **Step 1 — Write the integration notes**

Create `plan/architecture/integration-notes.md`:

```markdown
# Integration notes — pd2-aggregator → pd2.tools

**Updated:** 2026-05-11
**Status:** Planning — awaiting conversation with [@coleestrin](https://github.com/coleestrin)

After the Reddit launch of `pd2-aggregator.vercel.app`, coleestrin (pd2.tools maintainer) offered to host the tool as a subpage on pd2.tools and pointed at his open-source repo for contribution. This doc captures what we'd want to align on **before** any porting work starts.

It is **not** a port plan. It is the agenda for the first conversation.

## Current stack (one paragraph)

Next.js 16 (App Router) with static export, React 19, TypeScript, Tailwind 4 + shadcn/ui, vitest. No backend — the browser talks directly to `api.pd2.tools/api/v1`. Filter + aggregation runs in a Web Worker (`src/workers/aggregate.worker.ts`); IndexedDB caches the raw character pool for 24h via `idb-keyval`. All UI state lives in URL query params — no accounts, no server state.

## What's in scope to port

Cleanly portable, framework-agnostic:

| Layer | Files | Why portable |
|---|---|---|
| Aggregation logic | `src/lib/aggregate/*`, `src/lib/shape/*`, `src/lib/filter.ts`, `src/lib/diff.ts` | Pure functions, no UI assumptions, fully tested |
| Slot lookup | `src/lib/slot.ts`, `data/item-slots.json` | Static data + small pure function |
| Skill prereq classifier | `src/lib/aggregate/skillUsage.ts`, `data/skill-prereqs.json` | Same |
| Build presets | `src/lib/buildPresets.ts`, `data/builds.json` | Same |

UI portable IF their stack is React-based:

| Layer | Files | Adaptation needed |
|---|---|---|
| UI components | `src/components/*` | Tailwind classes may need to map to their styling system |
| Page composition | `src/app/page.tsx` | Their routing convention will differ |

## What changes in their environment

This is where integration unlocks real wins over our standalone version:

- **Direct DB queries** instead of the public REST API. Eliminates the entire class of cohort-mismatch bugs we hit in Sprint 2.1.1 (skills param not being sent) — SQL filters are explicit and typed.
- **Rare/magic/crafted items aggregable.** The public API's `/item-usage` endpoint returns only Unique/Set/Runeword rows because those have stable names. With direct DB access we can aggregate rare affix patterns by base, which is what the affix-mods table already does client-side — but now sourced from the full population, not our 1500-character sample.
- **No more snapshot fallback / IndexedDB cache** — their backend has the data live.
- **No more pagination stitching** — single SQL query.
- **Larger sample.** Our standalone version is capped at MAX_PAGES × PAGE_SIZE = 1500 characters per class. Their full population is ~21k.

## Open questions for coleestrin

Working agenda. Adjust before sending.

### Stack alignment
1. What's pd2.tools' frontend framework? (Inspecting the live site suggests React, possibly Next or Vite — confirm.)
2. UI library / styling — Tailwind, MUI, custom? How rigid is the style alignment expectation?
3. Build system — what does CI look like there?

### Product placement
4. Sub-route or modal — `pd2.tools/aggregator`? `pd2.tools/builds`? Or wired into existing character pages?
5. Does pd2.tools already have a "build aggregator" concept we'd be replacing/extending, or is this net-new?
6. Are existing per-character pages a useful integration point (e.g., add a "compare to top X% of this build" panel)?

### Data layer
7. DB schema — what shape do characters/items live in on the pd2.tools backend?
8. Are there existing aggregation queries / cached views we should reuse?
9. Update cadence — is character data live or batch-imported on an interval?

### Contribution process
10. Branch / PR conventions in `coleestrin/pd2-tools`?
11. Test infra — do they have a test suite we should plug into?
12. Code review expectations and merge cadence?
13. Hosting — would the integration live behind pd2.tools' existing auth/rate limits?

### Long-term
14. Is shared maintainership on the table once the port lands, or one-shot contribution?
15. Attribution — keep a "Built by Steven Obst" line somewhere or fully blend in?

## Suggested next step

Once these are answered, decompose porting into Phase 2.x sprints. Realistic shape:

- Sprint 2.x.1 — Fork pd2-tools, port pure aggregation logic + data files. No UI yet. Add a smoke test that the aggregation produces the same output against fixture data.
- Sprint 2.x.2 — Port UI components, adapted to their styling system.
- Sprint 2.x.3 — Wire into pd2.tools' routing + DB queries. Drop our IndexedDB / public-API path.
- Sprint 2.x.4 — Launch on pd2.tools, deprecate `pd2-aggregator.vercel.app` (or keep as mirror).

Estimated total: 2–4 weeks depending on stack overlap.

## Maintenance of the standalone version

Until porting completes, `pd2-aggregator.vercel.app` stays live. The validation test suite (Sprint 2.2) keeps us honest about correctness. If porting drags out past Sprint 2.3, revisit whether the standalone version is worth ongoing maintenance.
```

- [x] **Step 2 — Commit**

```bash
git add plan/architecture/integration-notes.md
git commit -m "sprint(2.2): integration-prep notes for coleestrin conversation

Agenda — not a port plan. Captures:
- Current stack summary
- What's portable as-is (pure functions, data files) vs UI
  components (depend on their styling system)
- What CHANGES in their environment (direct DB > public API,
  rares aggregable, larger sample, etc.)
- 15 open questions across stack alignment, product placement,
  data layer, contribution process, long-term posture
- Skeleton of how porting sprints would decompose, with rough
  effort estimate (2-4 weeks)

This doc becomes the agenda for the first conversation with
coleestrin; nothing here commits us to porting yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Sprint close

Standard close checklist: update roadmap + CLAUDE.md status, move sprint file to archive, merge to main.

**Files:**
- Modify: `plan/roadmap.md`
- Modify: `CLAUDE.md`
- Move: `plan/sprints/sprint-2.2-correctness-audit.md` → `plan/sprints/archive/`

- [x] **Step 1 — Mark all task checkboxes as completed in this sprint file**

Use sed or manual edits to flip `- [x]` to `- [x]` throughout this file.

```bash
sed -i 's/- \[ \]/- [x]/g' "C:/Coding/III____Full_Circle/PD2/plan/sprints/sprint-2.2-correctness-audit.md"
```

- [x] **Step 2 — Update plan/roadmap.md**

Add Sprint 2.2 done section. Open `plan/roadmap.md`, find the Sprint 2.1.2 / Sprint 2.2 - TBD section, and replace the "Sprint 2.2 — TBD" header with:

```markdown
### Sprint 2.2 — Correctness audit + integration prep (DONE 2026-05-11)

**Branch:** `sprint/2.2-correctness-audit` (merged to main)
**Detail:** [`sprints/archive/sprint-2.2-correctness-audit.md`](sprints/archive/sprint-2.2-correctness-audit.md) · [`docs/specs/2026-05-11-sprint-2.2-correctness-audit-design.md`](../docs/specs/2026-05-11-sprint-2.2-correctness-audit-design.md)

**Delivered:**
- **Validation test suite** — `src/lib/validation/parity.test.ts` + 7 canonical-build fixtures + `scripts/refresh-validation-fixtures.ts`. Catches the 2.1.1 + 2.1.2 bug shapes. Fixture refresh is single-purpose; URL contract is covered by separate mocked-fetch tests in `src/lib/api.url-contract.test.ts`.
- **Open-source posture** — `LICENSE` (MIT, matching `coleestrin/pd2-tools`), full `README.md` rewrite with attribution.
- **Integration prep** — `plan/architecture/integration-notes.md` captures the conversation agenda for coleestrin (current stack, portability map, open questions, suggested port decomposition).

**Verification:** test suite grew 126 → 172. tsc clean. next build clean.

### Sprint 2.3 — TBD
```

- [x] **Step 3 — Update CLAUDE.md status line**

Edit `CLAUDE.md`, find the `**Status:**` line, replace it with:

```markdown
**Status:** Phase 2 in progress. Sprint 2.2 shipped 2026-05-11 (validation test suite, MIT license, README rewrite, integration-prep doc for the coleestrin conversation). Sprint 2.3 scope TBD; main candidates are responding to coleestrin's integration offer and any new community feedback.
```

- [x] **Step 4 — Move sprint file to archive**

```bash
git mv "C:/Coding/III____Full_Circle/PD2/plan/sprints/sprint-2.2-correctness-audit.md" "C:/Coding/III____Full_Circle/PD2/plan/sprints/archive/sprint-2.2-correctness-audit.md"
```

- [x] **Step 5 — Verify everything still builds**

Run in order:
```bash
cd "C:/Coding/III____Full_Circle/PD2"
npm test
npm run typecheck
npm run build
```

Expected: 172 tests pass, tsc clean, next build clean.

- [x] **Step 6 — Commit the close**

```bash
git add CLAUDE.md plan/roadmap.md plan/sprints
git commit -m "sprint(2.2): close sprint + archive

- Marked all 8 task checkboxes completed
- plan/roadmap.md: Sprint 2.2 marked DONE with delivered summary
- CLAUDE.md status line updated
- Sprint file moved to plan/sprints/archive/

Closes the Sprint Close Checklist per CLAUDE.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [x] **Step 7 — Push branch + merge to main**

```bash
git push -u origin sprint/2.2-correctness-audit
git checkout main
git merge --no-ff sprint/2.2-correctness-audit -m "Merge sprint/2.2-correctness-audit

Sprint 2.2 — Correctness audit + integration prep (2026-05-11)

Ships the validation test suite that would have caught 2.1.1 + 2.1.2
before they reached production, plus open-source posture (LICENSE,
real README) and an integration-prep doc for the upcoming conversation
with coleestrin.

Tests grew 126 → 172. No new dependencies. No UI changes."
git push origin main
```

---

## Done When

- [x] All 8 tasks' checkboxes marked completed
- [x] `npm test && npm run typecheck && npm run build` all pass
- [x] Sprint file archived
- [x] Branch merged to main and pushed
- [x] Vercel auto-deploys (no UI changes — should be a no-op deploy)

## Out of scope (verbatim from spec)

- Porting any code to pd2-tools.
- New product features.
- Raw character data in fixtures (Sprint 2.3 candidate).
- Live-API CI tests.
- Privacy-friendly analytics.
- Custom domain.
- Donations stance.
