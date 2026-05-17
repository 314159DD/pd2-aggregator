# Kontra Tier-List Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled build presets with builds from the Dark Humility tier list, each preset button showing its tier letter as a coloured square.

**Architecture:** A nightly script fetches the DH Google Sheet CSV, computes each build's tier from the sheet's cutoff legend, joins it with a hand-curated build→skills mapping, and emits `data/kontra-builds.json`. The static UI reads that file; `FilterForm` renders tier-badged preset buttons.

**Tech Stack:** TypeScript, Next.js 16 static export, vitest, tsx for the build script, GitHub Actions for the nightly refresh.

Design doc: `docs/specs/2026-05-17-kontra-tierlist-integration-design.md`.

---

### Task 0: Setup

**Files:** none

- [ ] **Step 1: Install dependencies**

Run: `cd ~/Developer/pd2-aggregator && npm install`
Expected: completes, `node_modules/` populated.

- [ ] **Step 2: Verify baseline is green**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors. If not, stop — the baseline is broken.

- [ ] **Step 3: Create the working branch**

Run: `git checkout -b sprint/3.2-kontra-tierlist`
Expected: switched to a new branch.

---

### Task 1: Tier types and the 18-tier scale

**Files:**
- Create: `src/lib/kontra/types.ts`

- [ ] **Step 1: Write the types**

```typescript
/** The 18-step Dark Humility tier scale, best to worst. */
export const TIER_ORDER = [
  "S+", "S", "S-",
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F+", "F", "F-",
] as const;

export type Tier = (typeof TIER_ORDER)[number];

/** A single tier cutoff parsed from the sheet legend. */
export type TierCutoff = { tier: Tier; minMpm: number };

/** One build row parsed from the DH sheet (pre-tier, pre-skill-join). */
export type SheetBuild = {
  /** Exact build name from the sheet, whitespace-trimmed. */
  rawName: string;
  /** Handicap level parsed from a "(H Lvl N)" suffix; 0 if absent. */
  handicap: number;
  /** Normalized MPM — the "Top 3 T3 Map Avg. Std. MPM" column. */
  normalizedMpm: number;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kontra/types.ts
git commit -m "feat(kontra): tier scale + sheet types"
```

---

### Task 2: Parse the DH sheet CSV

**Files:**
- Create: `src/lib/kontra/parseSheet.ts`
- Test: `src/lib/kontra/parseSheet.test.ts`

The CSV has one row per build. The first column is the build name. The
`Top 3 T3 Map Avg. Std. MPM` column holds the normalized MPM. The
`Tier-Cutoffs` and `Tiers` columns form an 18-row legend embedded alongside
the first 18 build rows (each row: a cutoff number + a tier label).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseSheet } from "./parseSheet";

const CSV = `S10-13 Tested Build,T3 Map 1,MPM 1,Density 1,(MPM*200)/(D+100) 1,T3 Map 2,MPM 2,Density 2,(MPM*200)/(D+100) 2,T3 Map 3,MPM 3,Density 3,(MPM*200)/(D+100) 3,Top 3 Map Avg. MPM,Top 3 T3 Map Avg. Std. MPM,Top 3 Map Avg. MPM Mean,Tier-Cutoffs,Tiers,A,B,C,D
Nova (H Lvl 1),Blood Moon,719,125,639.11,Phlegethon,677,136,573.73,Canyon,650,116,601.85,682.00,604.90,532,673.58,S+,x,x,x,x
Blessed Hammer (H Lvl 1) ,Blood Moon,741,131,641.56,Phlegethon,672,129,586.90,Throne,531,116,491.67,648.00,573.37,x,649.21,S,x,x,x,x`;

describe("parseSheet", () => {
  it("parses build rows with trimmed names and normalized MPM", () => {
    const { builds } = parseSheet(CSV);
    expect(builds).toHaveLength(2);
    expect(builds[0]).toEqual({ rawName: "Nova (H Lvl 1)", handicap: 1, normalizedMpm: 604.9 });
    // trailing whitespace on the raw name is trimmed
    expect(builds[1].rawName).toBe("Blessed Hammer (H Lvl 1)");
  });

  it("parses the embedded tier-cutoff legend", () => {
    const { cutoffs } = parseSheet(CSV);
    expect(cutoffs[0]).toEqual({ tier: "S+", minMpm: 673.58 });
    expect(cutoffs[1]).toEqual({ tier: "S", minMpm: 649.21 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kontra/parseSheet.test.ts`
Expected: FAIL — `parseSheet` is not defined.

- [ ] **Step 3: Implement `parseSheet`**

```typescript
import type { SheetBuild, TierCutoff, Tier } from "./types";
import { TIER_ORDER } from "./types";

const TIER_SET = new Set<string>(TIER_ORDER);

/** Split one CSV line, respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function handicapFrom(name: string): number {
  const m = name.match(/\(H Lvl (\d+)\)/i);
  return m ? Number(m[1]) : 0;
}

export type ParsedSheet = { builds: SheetBuild[]; cutoffs: TierCutoff[] };

export function parseSheet(csv: string): ParsedSheet {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = splitCsvLine(lines[0]).map((h) => h.trim());

  const idx = (name: string) => header.indexOf(name);
  const nameCol = 0;
  const mpmCol = idx("Top 3 T3 Map Avg. Std. MPM");
  const cutoffCol = idx("Tier-Cutoffs");
  const tierCol = idx("Tiers");
  if (mpmCol < 0 || cutoffCol < 0 || tierCol < 0) {
    throw new Error("DH sheet header changed — expected columns missing");
  }

  const builds: SheetBuild[] = [];
  const cutoffs: TierCutoff[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rawName = (cells[nameCol] ?? "").trim();
    const mpm = Number(cells[mpmCol]);
    if (rawName && Number.isFinite(mpm)) {
      builds.push({ rawName, handicap: handicapFrom(rawName), normalizedMpm: mpm });
    }
    const cutoffVal = Number(cells[cutoffCol]);
    const tierVal = (cells[tierCol] ?? "").trim();
    if (Number.isFinite(cutoffVal) && TIER_SET.has(tierVal)) {
      cutoffs.push({ tier: tierVal as Tier, minMpm: cutoffVal });
    }
  }

  return { builds, cutoffs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kontra/parseSheet.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kontra/parseSheet.ts src/lib/kontra/parseSheet.test.ts
git commit -m "feat(kontra): parse DH sheet CSV — builds + cutoff legend"
```

---

### Task 3: Compute a build's tier

**Files:**
- Create: `src/lib/kontra/tiering.ts`
- Test: `src/lib/kontra/tiering.test.ts`

First, fetch kontra's open-source tiering logic and confirm reuse is allowed:

- [ ] **Step 1: Check the kontra repo licence and tiering source**

Run: `curl -s https://raw.githubusercontent.com/JakubKontra/pd2-dh-tierlist/main/LICENSE | head -5`
Run: `curl -s https://raw.githubusercontent.com/JakubKontra/pd2-dh-tierlist/main/src/data/tiering.ts`

- If a permissive licence (MIT/Apache/ISC/BSD): port the handicap + cutoff
  logic from their `tiering.ts`, keeping a `// Ported from JakubKontra/pd2-dh-tierlist (<licence>)` attribution comment.
- If no licence or a restrictive one: do NOT copy code. Use the simple
  cutoff lookup below (handicap ignored unless their file reveals an
  explicit, independently-reimplementable formula). Note the divergence
  in a code comment.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { tierFor } from "./tiering";
import type { TierCutoff } from "./types";

const CUTOFFS: TierCutoff[] = [
  { tier: "S+", minMpm: 673.58 },
  { tier: "S", minMpm: 649.21 },
  { tier: "S-", minMpm: 624.84 },
  { tier: "A+", minMpm: 600.47 },
  { tier: "A", minMpm: 576.10 },
  { tier: "F-", minMpm: 0 },
];

describe("tierFor", () => {
  it("returns the highest tier whose cutoff the MPM meets", () => {
    expect(tierFor(700, CUTOFFS)).toBe("S+");
    expect(tierFor(604.9, CUTOFFS)).toBe("A+");
    expect(tierFor(649.21, CUTOFFS)).toBe("S"); // exact boundary is inclusive
  });

  it("returns the lowest tier when MPM is below every higher cutoff", () => {
    expect(tierFor(10, CUTOFFS)).toBe("F-");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/kontra/tiering.test.ts`
Expected: FAIL — `tierFor` is not defined.

- [ ] **Step 4: Implement `tierFor`**

```typescript
import type { Tier, TierCutoff } from "./types";

/**
 * The build's tier = the highest cutoff whose minMpm the build meets.
 * `cutoffs` need not be pre-sorted.
 */
export function tierFor(normalizedMpm: number, cutoffs: TierCutoff[]): Tier {
  const sorted = [...cutoffs].sort((a, b) => b.minMpm - a.minMpm);
  for (const c of sorted) {
    if (normalizedMpm >= c.minMpm) return c.tier;
  }
  return sorted[sorted.length - 1].tier;
}
```

If Step 1 found a permissive licence and a handicap adjustment, add a
`handicapAdjust(mpm, handicap)` function ported from their source and apply
it before the cutoff lookup. Otherwise `tierFor` stands alone.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/kontra/tiering.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kontra/tiering.ts src/lib/kontra/tiering.test.ts
git commit -m "feat(kontra): tier computation from cutoff legend"
```

---

### Task 4: Seed the curated build→skills mapping

**Files:**
- Create: `data/kontra-build-skills.json`

This file maps each DH sheet build name to its defining skill(s). It is the
source of truth for skills; the sheet has none. Keyed by the exact
whitespace-trimmed `rawName`.

- [ ] **Step 1: Pull the full build list**

Run the snapshot fetch (or `curl` the CSV export, following the redirect) and
list every distinct `rawName`. There are ~130.

- [ ] **Step 2: Seed each entry**

For every build, write `{ "skills": [...] }`. Most names contain the skill
directly (`"Blessed Hammer (H Lvl 1)"` → `["Blessed Hammer"]`). Rules:
- Skill strings MUST match `character.character.skills[].name` as used by
  the existing `data/builds.json` (cross-check spellings there).
- Multi-skill builds (`"Confuse (+ Amp + Iron Maiden)"`) list all named skills.
- Gear/aura variants that share skills get a shared `"mergeInto": "<display name>"`
  (e.g. both `Physical Sacrifice` rows → `"mergeInto": "Physical Sacrifice"`).
- For names where the build is ambiguous, use the pd2.tools `/skill-usage`
  co-occurrence query (filter the class by the name's skill, read the top
  co-occurring skills) as a research aid, then pick the defining skills by
  judgement. Add a `"notes"` field explaining non-obvious choices.

Shape (see design doc for the full example):

```json
{
  "Blessed Hammer (H Lvl 1)": { "skills": ["Blessed Hammer"] },
  "Physical Sacrifice (1-H) (Schaeffer's) (RT'd)": { "skills": ["Sacrifice"], "mergeInto": "Physical Sacrifice" }
}
```

- [ ] **Step 3: Commit**

```bash
git add data/kontra-build-skills.json
git commit -m "data(kontra): seed curated build->skills mapping"
```

---

### Task 5: The snapshot pipeline script

**Files:**
- Create: `scripts/build-kontra-snapshot.ts`
- Create: `src/lib/kontra/buildSnapshot.ts` (pure join logic)
- Test: `src/lib/kontra/buildSnapshot.test.ts`

Split: `buildSnapshot.ts` holds the pure transform (parsed sheet + mapping →
grouped presets) so it is unit-testable; `build-kontra-snapshot.ts` is the thin
I/O shell (fetch CSV, read mapping, write JSON).

- [ ] **Step 1: Write the failing test for the join**

```typescript
import { describe, it, expect } from "vitest";
import { buildPresetsFromSheet } from "./buildSnapshot";
import type { ParsedSheet } from "./parseSheet";

const sheet: ParsedSheet = {
  cutoffs: [
    { tier: "S", minMpm: 600 },
    { tier: "A", minMpm: 500 },
    { tier: "F-", minMpm: 0 },
  ],
  builds: [
    { rawName: "Blessed Hammer (H Lvl 1)", handicap: 1, normalizedMpm: 650 },
    { rawName: "Physical Sacrifice (1-H)", handicap: 0, normalizedMpm: 520 },
    { rawName: "Physical Sacrifice (2-H)", handicap: 0, normalizedMpm: 610 },
    { rawName: "Unmapped Build", handicap: 0, normalizedMpm: 400 },
  ],
};
const mapping = {
  "Blessed Hammer (H Lvl 1)": { skills: ["Blessed Hammer"] },
  "Physical Sacrifice (1-H)": { skills: ["Sacrifice"], mergeInto: "Physical Sacrifice" },
  "Physical Sacrifice (2-H)": { skills: ["Sacrifice"], mergeInto: "Physical Sacrifice" },
};
const skillClass: Record<string, string> = {
  "Blessed Hammer": "Paladin",
  Sacrifice: "Paladin",
};

describe("buildPresetsFromSheet", () => {
  it("joins, merges variants (highest tier wins), groups by class", () => {
    const { presets, unmapped } = buildPresetsFromSheet(sheet, mapping, skillClass);
    const pal = presets["Paladin"];
    expect(pal).toHaveLength(2);
    const sac = pal.find((p) => p.id === "physical-sacrifice")!;
    expect(sac.tier).toBe("S"); // 610 -> S, beats the 1-H variant's A
    expect(sac.sources).toHaveLength(2);
    expect(sac.skills).toEqual(["Sacrifice"]);
  });

  it("reports builds with no mapping entry", () => {
    const { unmapped } = buildPresetsFromSheet(sheet, mapping, skillClass);
    expect(unmapped).toContain("Unmapped Build");
  });

  it("sorts presets best tier first", () => {
    const { presets } = buildPresetsFromSheet(sheet, mapping, skillClass);
    expect(presets["Paladin"][0].tier).toBe("S");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kontra/buildSnapshot.test.ts`
Expected: FAIL — `buildPresetsFromSheet` is not defined.

- [ ] **Step 3: Implement `buildSnapshot.ts`**

```typescript
import type { ParsedSheet } from "./parseSheet";
import type { Tier } from "./types";
import { TIER_ORDER } from "./types";
import { tierFor } from "./tiering";

export type SkillMapEntry = { skills: string[]; mergeInto?: string; notes?: string };
export type SkillMap = Record<string, SkillMapEntry>;

export type KontraPreset = {
  id: string;
  name: string;
  tier: Tier;
  className: string;
  skills: string[];
  sources: string[];
};
export type KontraPresetsByClass = Record<string, KontraPreset[]>;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const tierRank = (t: Tier) => TIER_ORDER.indexOf(t);

export function buildPresetsFromSheet(
  sheet: ParsedSheet,
  mapping: SkillMap,
  skillClass: Record<string, string>,
): { presets: KontraPresetsByClass; unmapped: string[] } {
  const unmapped: string[] = [];
  // group key -> accumulator
  const groups = new Map<
    string,
    { name: string; skills: string[]; className: string; tier: Tier; sources: string[] }
  >();

  for (const b of sheet.builds) {
    const entry = mapping[b.rawName];
    if (!entry) {
      unmapped.push(b.rawName);
      continue;
    }
    const className = skillClass[entry.skills[0]];
    if (!className) {
      unmapped.push(b.rawName); // skill not recognised — treat as needs-curation
      continue;
    }
    const tier = tierFor(b.normalizedMpm, sheet.cutoffs);
    const displayName = entry.mergeInto ?? b.rawName.replace(/\s*\(.*$/, "").trim();
    const key = entry.mergeInto ?? b.rawName;

    const existing = groups.get(key);
    if (existing) {
      existing.sources.push(b.rawName);
      if (tierRank(tier) < tierRank(existing.tier)) existing.tier = tier;
    } else {
      groups.set(key, {
        name: displayName,
        skills: entry.skills,
        className,
        tier,
        sources: [b.rawName],
      });
    }
  }

  const presets: KontraPresetsByClass = {};
  for (const g of groups.values()) {
    (presets[g.className] ??= []).push({
      id: slug(g.name),
      name: g.name,
      tier: g.tier,
      className: g.className,
      skills: g.skills,
      sources: g.sources,
    });
  }
  for (const cls of Object.keys(presets)) {
    presets[cls].sort(
      (a, b) => tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name),
    );
  }
  return { presets, unmapped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kontra/buildSnapshot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the I/O shell `scripts/build-kontra-snapshot.ts`**

```typescript
/**
 * build-kontra-snapshot.ts
 *
 * Builds data/kontra-builds.json from the Dark Humility tier-list Google Sheet
 * and the curated data/kontra-build-skills.json mapping.
 *
 * Run:  npx tsx scripts/build-kontra-snapshot.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSheet } from "../src/lib/kontra/parseSheet";
import { buildPresetsFromSheet, type SkillMap } from "../src/lib/kontra/buildSnapshot";

const SHEET_ID = "1ipTsARndewEJaREWfcDeuCelKWpCEcFy9nrigp220_Y";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const ROOT = join(import.meta.dirname, "..");

/** skill name -> class, derived from data/skill-prereqs.json. */
async function loadSkillClass(): Promise<Record<string, string>> {
  const raw = JSON.parse(
    await readFile(join(ROOT, "data/skill-prereqs.json"), "utf8"),
  );
  // skill-prereqs.json is keyed by class; invert to skill -> class.
  // Confirm the actual shape on first run and adjust this mapping if needed.
  const out: Record<string, string> = {};
  for (const [className, skills] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(skills)) {
      for (const s of skills) {
        const name = typeof s === "string" ? s : (s as { name?: string }).name;
        if (name) out[name] = className;
      }
    } else if (skills && typeof skills === "object") {
      for (const name of Object.keys(skills)) out[name] = className;
    }
  }
  return out;
}

async function main() {
  const res = await fetch(CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();

  const sheet = parseSheet(csv);
  const mapping = JSON.parse(
    await readFile(join(ROOT, "data/kontra-build-skills.json"), "utf8"),
  ) as SkillMap;
  const skillClass = await loadSkillClass();

  const { presets, unmapped } = buildPresetsFromSheet(sheet, mapping, skillClass);

  await writeFile(
    join(ROOT, "data/kontra-builds.json"),
    JSON.stringify(presets, null, 2) + "\n",
  );

  const classCount = Object.keys(presets).length;
  const presetCount = Object.values(presets).reduce((n, p) => n + p.length, 0);
  console.log(`Wrote data/kontra-builds.json — ${presetCount} presets across ${classCount} classes.`);
  if (unmapped.length) {
    console.warn(`\n${unmapped.length} sheet builds have no usable mapping entry:`);
    for (const u of unmapped) console.warn(`  - ${u}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Note: on first run, verify the real shape of `data/skill-prereqs.json` and
adjust `loadSkillClass` to match — the inversion above handles both an
array-of-skills and an object-keyed shape, but confirm before relying on it.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-kontra-snapshot.ts src/lib/kontra/buildSnapshot.ts src/lib/kontra/buildSnapshot.test.ts
git commit -m "feat(kontra): snapshot pipeline — join sheet + mapping into presets"
```

---

### Task 6: Generate the snapshot

**Files:**
- Create: `data/kontra-builds.json` (generated)

- [ ] **Step 1: Run the script**

Run: `npx tsx scripts/build-kontra-snapshot.ts`
Expected: `Wrote data/kontra-builds.json — N presets across 7 classes.`
If the unmapped list is non-empty, return to Task 4 and add the missing
entries, then re-run until every intended build maps.

- [ ] **Step 2: Sanity-check the output**

Run: `npx tsx -e "const d=require('./data/kontra-builds.json'); console.log(Object.keys(d), Object.values(d).flat().length)"`
Expected: all 7 class names, a sensible preset count.

- [ ] **Step 3: Commit**

```bash
git add data/kontra-builds.json
git commit -m "data(kontra): generate initial kontra-builds.json snapshot"
```

---

### Task 7: Wire the new presets into `buildPresets.ts`

**Files:**
- Modify: `src/lib/buildPresets.ts`
- Test: `src/lib/buildPresets.test.ts`

- [ ] **Step 1: Update the failing test**

Add to `src/lib/buildPresets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BUILD_PRESETS, isPresetActive } from "./buildPresets";

describe("BUILD_PRESETS (kontra source)", () => {
  it("is grouped by class and every preset carries a tier", () => {
    for (const [cls, presets] of Object.entries(BUILD_PRESETS)) {
      expect(presets.length).toBeGreaterThan(0);
      for (const p of presets) {
        expect(p.tier).toBeTruthy();
        expect(p.skills.length).toBeGreaterThan(0);
        expect(p.className).toBe(cls);
      }
    }
  });

  it("isPresetActive still matches order-independently", () => {
    const p = Object.values(BUILD_PRESETS)[0][0];
    expect(isPresetActive([...p.skills].reverse(), p)).toBe(true);
    expect(isPresetActive([], p)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/buildPresets.test.ts`
Expected: FAIL — `p.tier` / `p.className` undefined.

- [ ] **Step 3: Rewrite `buildPresets.ts`**

```typescript
import kontraBuilds from "../../data/kontra-builds.json";
import type { Tier } from "./kontra/types";

export type BuildPreset = {
  /** Display name shown on the button. */
  name: string;
  /** Stable slug id. */
  id: string;
  /** Dark Humility tier letter. */
  tier: Tier;
  /** Class this preset belongs to. */
  className: string;
  /** Skill names matching `character.character.skills[].name`. */
  skills: string[];
  /** DH sheet rows that fed this preset (merged variants list >1). */
  sources: string[];
};

export type BuildPresetsByClass = Record<string, BuildPreset[]>;

export const BUILD_PRESETS = kontraBuilds as BuildPresetsByClass;

/** Default minLevel used when a preset populates the skill filter. */
export const PRESET_MIN_LEVEL = 20;

/** True if the current skill-filter set exactly matches the preset's skills. */
export function isPresetActive(
  currentSkillNames: string[],
  preset: BuildPreset,
): boolean {
  if (currentSkillNames.length !== preset.skills.length) return false;
  const present = new Set(currentSkillNames);
  return preset.skills.every((n) => present.has(n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/buildPresets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildPresets.ts src/lib/buildPresets.test.ts
git commit -m "feat(kontra): buildPresets reads kontra-builds.json with tiers"
```

---

### Task 8: Tier badge on the preset buttons

**Files:**
- Create: `src/lib/kontra/tierStyle.ts`
- Modify: `src/components/FilterForm.tsx` (the "Build presets" block, ~line 222-258)

- [ ] **Step 1: Create the tier-colour helper**

```typescript
import type { Tier } from "./types";

/** Background + text colour for a tier square, by tier band. */
export function tierSquareClass(tier: Tier): string {
  const band = tier[0];
  switch (band) {
    case "S": return "bg-gradient-to-b from-[#dfb55a] to-[#a07a30] text-[#0a0604]";
    case "A": return "bg-gradient-to-b from-[#3f8f4a] to-[#2a6332] text-[#eafce9]";
    case "B": return "bg-gradient-to-b from-[#3a6ea5] to-[#274d75] text-[#e9f1fc]";
    case "C": return "bg-gradient-to-b from-[#b5852f] to-[#856020] text-[#fdf3df]";
    case "D": return "bg-gradient-to-b from-[#9a6b2a] to-[#6e4c1d] text-[#fdf3df]";
    default:  return "bg-gradient-to-b from-[#5a5a5a] to-[#3a3a3a] text-[#dddddd]"; // F
  }
}
```

- [ ] **Step 2: Replace the preset-button JSX**

In `src/components/FilterForm.tsx`, the preset `.map(...)` returns a single
`<button>` containing `{preset.name}`. Replace that button with a two-part
layout — a tier square fused to the left edge, name beside it, one button:

```tsx
return (
  <button
    key={preset.id}
    type="button"
    title={`${preset.name} — Tier ${preset.tier}`}
    className={
      "flex items-stretch overflow-hidden rounded-sm text-xs transition " +
      (active
        ? "border border-[#5e4a1f] shadow-[inset_0_1px_0_rgba(255,212,122,0.5),0_0_10px_rgba(201,160,75,0.3)]"
        : "border border-[#7a5e29] hover:border-[#c9a04b]")
    }
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
    <span
      className={
        "flex items-center justify-center px-1.5 font-bold tracking-tight " +
        tierSquareClass(preset.tier)
      }
    >
      {preset.tier}
    </span>
    <span
      className={
        "px-2.5 py-1 font-medium tracking-wider " +
        (active
          ? "text-[#0a0604] bg-gradient-to-b from-[#dfb55a] to-[#a07a30]"
          : "text-[#f5e3b5] bg-gradient-to-b from-[#5a3f24] to-[#382514] hover:from-[#6e4f30] hover:to-[#4a3220] hover:text-[#ffd47a]")
      }
    >
      {preset.name}
    </span>
  </button>
);
```

Add the import at the top of the file:
`import { tierSquareClass } from "@/lib/kontra/tierStyle";`
(match the existing import style in the file — relative vs `@/` alias).

- [ ] **Step 3: Verify build + types**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 4: Visual check**

Run: `npm run dev`, open `http://localhost:3000`, select a class. Confirm
preset buttons show a coloured tier square fused to the name, sorted best
tier first, and clicking still drives the skill filter.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kontra/tierStyle.ts src/components/FilterForm.tsx
git commit -m "feat(kontra): tier-letter square on preset buttons"
```

---

### Task 9: Nightly refresh workflow

**Files:**
- Modify: `.github/workflows/refresh-price-snapshot.yml`

The existing workflow runs nightly snapshot scripts and commits changes. Add
the kontra script to it rather than creating a second workflow.

- [ ] **Step 1: Add the script step and the output path**

In `.github/workflows/refresh-price-snapshot.yml`, after the existing
`npx tsx scripts/build-runeword-runes.ts` step, add:

```yaml
      - run: npx tsx scripts/build-kontra-snapshot.ts
```

And add `data/kontra-builds.json` to the `git add` line in the
"Commit if changed" step:

```yaml
          git add public/price-snapshot.json data/unique-ids.json public/runeword-runes.json data/kontra-builds.json
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/refresh-price-snapshot.yml
git commit -m "ci(kontra): refresh kontra-builds.json in the nightly job"
```

---

### Task 10: Retire `builds.json` and final verification

**Files:**
- Move: `data/builds.json` → `plan/archive/builds.json`
- Delete: `src/lib/buildPresets.test.ts` references to the old shape (already handled in Task 7)
- Modify: `CLAUDE.md` (Commands + Data sources sections)

- [ ] **Step 1: Confirm `builds.json` has no remaining importers**

Run: `grep -rn "builds.json" src scripts`
Expected: only `buildPresets.ts` — and Task 7 already repointed it. If
anything else references it, repoint or remove that usage first.

- [ ] **Step 2: Archive the old file**

Run: `git mv data/builds.json plan/archive/builds.json`

- [ ] **Step 3: Update `CLAUDE.md`**

In the Commands section add:
`- \`npx tsx scripts/build-kontra-snapshot.ts\` — rebuild \`data/kontra-builds.json\` from the Dark Humility tier-list Google Sheet`

In the Data sources section add a line noting the DH sheet
(`docs.google.com/.../1ipTsARndewEJaREWfcDeuCelKWpCEcFy9nrigp220_Y`) and that
`data/kontra-build-skills.json` is the curated skill mapping.

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: all tests pass (count grew by the new kontra suites).

Run: `npm run typecheck`
Expected: clean.

Run: `npm run build`
Expected: static export succeeds.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md data/builds.json plan/archive/builds.json
git commit -m "chore(kontra): retire builds.json, document kontra pipeline"
```

---

## Done-when

- Preset buttons on every class are sourced from the DH tier list, each with a
  coloured tier square fused to its left edge, sorted best tier first.
- `npx tsx scripts/build-kontra-snapshot.ts` regenerates `data/kontra-builds.json`
  with no unintended unmapped builds.
- The nightly workflow refreshes the snapshot.
- `npm test`, `npm run typecheck`, `npm run build` all green.
- `data/builds.json` archived; `CLAUDE.md` updated.

## Out of scope — Project B

The secured `/curate` editor for `data/kontra-build-skills.json` is a separate
plan, brainstormed and specced after this ships.
