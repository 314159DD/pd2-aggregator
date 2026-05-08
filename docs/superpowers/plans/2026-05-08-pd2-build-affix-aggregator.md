# PD2 Build Affix Aggregator Implementation Plan

> **REVISION (2026-05-08, mid-execution):** API recon during Phase 1 revealed that `/characters` paginates 50/page (full data = 1.4 GB) and that `className`/`requiredSkills` filters are silently ignored on that endpoint. The server, however, exposes pre-aggregated `/characters/stats/*` endpoints that DO accept full filters. The architecture pivots from "download everything, aggregate locally" to a hybrid: server aggregates for items/skills/level/merc, plus a small sampled raw fetch for affix mods + charms only. **Phases 4, 6, 7 below are partially superseded.** The plan revisions are appended at the end of this file under "Revised Phases" — execute those, not the original Phase 4/6/7 tasks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 15 static-export app that fetches the public pd2.tools `/characters` dump, filters it by class + skills + gameMode, aggregates the matched cohort to surface top equipped items by slot, top affix mods on rare/crafted gear, charm patterns, build sheet, and a "diff my character" mode — all client-side with IndexedDB caching, no backend.

**Architecture:** Static-export Next.js app on Vercel free tier. One module touches I/O (`lib/data-loader.ts` — IndexedDB + network + snapshot fallback). All filtering and aggregation are pure functions called from a Web Worker. Reference data (mod dictionary, item bases) is JSON checked into the repo and built by one-shot scripts.

**Tech Stack:** Next.js 15 (App Router, output: 'export'), TypeScript, Tailwind, shadcn/ui, vitest, idb-keyval (IndexedDB wrapper). Node 20+.

**Spec:** `docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`

**Working dir:** `C:\Coding\III____Full_Circle\PD2`

---

## Phase 0 — Bootstrap

### Task 0.1: Initialize git + scaffold Next.js

**Files:**
- Create: `.gitignore` (via Next.js scaffold)
- Create: `package.json` (via Next.js scaffold)
- Create: `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx` (all via scaffold)

- [ ] **Step 1: Initialize git repo**

```powershell
cd C:\Coding\III____Full_Circle\PD2
git init
git branch -M main
```

- [ ] **Step 2: Scaffold Next.js with all the right answers**

```powershell
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm
```

When prompted to overwrite the existing PD2 directory contents, answer Yes.

- [ ] **Step 3: Configure static export**

Edit `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 4: Verify scaffold builds**

Run: `npm run build`
Expected: succeeds, produces `out/` directory.

- [ ] **Step 5: First commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js 15 static export"
```

---

### Task 0.2: Add vitest + idb-keyval, configure paths

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add scripts)

- [ ] **Step 1: Install dev/runtime deps**

```powershell
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
npm install idb-keyval
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Add test script**

In `package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Smoke test runs (no tests yet)**

Run: `npm test`
Expected: vitest reports "No test files found". That's fine.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore: add vitest + idb-keyval"
```

---

### Task 0.3: Add CLAUDE.md and project README

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1: Write CLAUDE.md**

Create `CLAUDE.md`:

```markdown
# PD2 Build Affix Aggregator

Personal-use Next.js 15 static-export app that aggregates Project Diablo 2 ladder builds from the pd2.tools public API and produces filterable build guides.

## Stack
- Next.js 15 App Router, static export (`output: 'export'`)
- TypeScript, Tailwind, shadcn/ui
- vitest for unit tests
- idb-keyval for IndexedDB cache

## Commands
- `npm run dev` — local dev server
- `npm run build` — production static export to `out/`
- `npm test` — run unit tests
- `npm run typecheck` — type check only
- `npx tsx scripts/refresh-snapshot.ts` — refresh `data/snapshot.json`
- `npx tsx scripts/build-mod-dictionary.ts` — rebuild `data/mod-dictionary.json`

## Module boundaries
- `src/lib/data-loader.ts` is the ONLY module that does network or IndexedDB I/O.
- `src/lib/filter.ts`, `src/lib/aggregate.ts`, `src/lib/diff.ts` are pure functions. Easy to unit test.
- The web worker (`src/workers/aggregate.worker.ts`) is the only place async aggregation runs.

## Data sources
- Live: `https://api.pd2.tools/api/v1/characters` (~3.4 MB JSON, CORS *)
- Snapshot fallback: `data/snapshot.json` (committed; refreshed manually)
- Mod dictionary: `data/mod-dictionary.json` (built by `scripts/build-mod-dictionary.ts`)

## Design doc
`docs/specs/2026-05-08-pd2-build-affix-aggregator-design.md`
```

- [ ] **Step 2: Write minimal README**

Create `README.md`:

```markdown
# PD2 Build Affix Aggregator

Aggregates Project Diablo 2 ladder builds from pd2.tools to surface what gear and affixes top players actually use.

See `CLAUDE.md` for development guide and `docs/specs/` for the design doc.
```

- [ ] **Step 3: Commit**

```powershell
git add CLAUDE.md README.md
git commit -m "docs: add CLAUDE.md and README"
```

---

## Phase 1 — Reference data

### Task 1.1: License inspection of coleestrin/pd2-tools

**Files:**
- Create: `docs/decisions/2026-05-08-pd2-tools-license.md`

- [ ] **Step 1: Fetch the LICENSE file**

```powershell
curl -s https://raw.githubusercontent.com/coleestrin/pd2-tools/main/LICENSE -o LICENSE-pd2-tools.txt
type LICENSE-pd2-tools.txt
```

If 404, try `master` branch or check `https://github.com/coleestrin/pd2-tools` to find the default branch and license file name.

- [ ] **Step 2: Write the decision doc**

Create `docs/decisions/2026-05-08-pd2-tools-license.md`:

```markdown
# Decision: pd2-tools license posture

**Date:** 2026-05-08

## Result

License found: <MIT | Apache-2.0 | GPL-3.0 | other | none>

## Implication

- **MIT / Apache:** Copy mod-label maps and item-base data verbatim into `data/mod-dictionary.json` with attribution comment in source files.
- **GPL:** Treat as reference only. Re-derive all label maps from PD2 wiki (`wiki.projectdiablo2.com`).
- **No license:** Do not copy. Treat as reference only.

## Action

`scripts/build-mod-dictionary.ts` is implemented to <copy directly | scrape wiki | hybrid>.
```

Fill in the angle brackets based on what you found.

- [ ] **Step 3: Delete the temporary file**

```powershell
del LICENSE-pd2-tools.txt
```

- [ ] **Step 4: Commit**

```powershell
git add docs/decisions/
git commit -m "docs: record pd2-tools license decision"
```

---

### Task 1.2: Snapshot refresh script

**Files:**
- Create: `scripts/refresh-snapshot.ts`
- Create: `data/.gitkeep`

- [ ] **Step 1: Install tsx for running TS scripts**

```powershell
npm install --save-dev tsx
```

- [ ] **Step 2: Write the refresh script**

Create `scripts/refresh-snapshot.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const URL = "https://api.pd2.tools/api/v1/characters";
const OUT = join(process.cwd(), "data", "snapshot.json");

async function main() {
  console.log(`Fetching ${URL} ...`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(OUT, text, "utf8");
  const json = JSON.parse(text);
  console.log(`Wrote ${OUT}`);
  console.log(`  total: ${json.total}`);
  console.log(`  characters in payload: ${json.characters.length}`);
  console.log(`  size: ${(text.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run it**

```powershell
npx tsx scripts/refresh-snapshot.ts
```

Expected output: prints `total: 21000+`, `size: ~3.4 MB`. Creates `data/snapshot.json`.

- [ ] **Step 4: Commit the snapshot**

```powershell
git add scripts/refresh-snapshot.ts data/snapshot.json
git commit -m "feat(scripts): add snapshot refresh + initial snapshot"
```

---

### Task 1.3: Sample one character record and derive types

**Files:**
- Create: `src/lib/types.ts`
- Create: `scripts/inspect-snapshot.ts` (one-shot, can be deleted later)

- [ ] **Step 1: Write inspect script**

Create `scripts/inspect-snapshot.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PATH = join(process.cwd(), "data", "snapshot.json");

function shape(value: unknown, depth = 0, maxDepth = 4): string {
  if (depth > maxDepth) return "...";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `Array<${shape(value[0], depth + 1, maxDepth)}>(${value.length})`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    return `{${keys
      .slice(0, 30)
      .map((k) => `${k}: ${shape(obj[k], depth + 1, maxDepth)}`)
      .join("; ")}}`;
  }
  return typeof value;
}

async function main() {
  const json = JSON.parse(await readFile(PATH, "utf8"));
  console.log("TOP-LEVEL:", shape(json, 0, 1));
  console.log("\nONE CHARACTER:");
  console.log(shape(json.characters[0], 0, 4));
  console.log("\nONE ITEM:");
  console.log(shape(json.characters[0].items[0], 0, 5));
  console.log("\nDISTINCT ITEM CATEGORIES (first 30 chars):");
  const cats = new Set<string>();
  for (const c of json.characters.slice(0, 30)) {
    for (const it of c.items) cats.add(`${it.base?.category}/${it.base?.type}`);
  }
  for (const c of [...cats].sort()) console.log(`  ${c}`);
}

main().catch(console.error);
```

- [ ] **Step 2: Run it and capture output**

```powershell
npx tsx scripts/inspect-snapshot.ts > inspect-output.txt
type inspect-output.txt
```

Read the output carefully. Note especially:
- Top-level keys (`total`, `characters`).
- Character keys (`accountName`, `character`, `items`, `mercenary`, `realSkills`, `file`, `lastUpdated`).
- Item keys: `base` (with `name`, `type`, `category`, `codes`, `type_code`), and the **actual mod/property field name** (likely `mods`, `properties`, `magicAttributes`, or similar).
- Whether the character object has a `stats` field (Str/Dex/Vit/Energy).

- [ ] **Step 3: Write `src/lib/types.ts` reflecting what you saw**

Create `src/lib/types.ts`:

```ts
// Types derived from the live api.pd2.tools/api/v1/characters response.
// Sample command: `npx tsx scripts/inspect-snapshot.ts`

export type ItemCategory =
  | "armor"
  | "weapon"
  | "misc"
  | "jewelry"
  | string; // permissive: unknown categories surface as strings, not errors

export type ItemBase = {
  id: string;
  name: string;
  type: string;
  type_code: string;
  category: ItemCategory;
  size: { width: number; height: number };
  codes: { normal: string; exceptional: string; elite: string };
  stackable: boolean;
  requirements: Record<string, number>;
};

// Property shape: confirmed from inspect-snapshot output.
// Adjust the field names below to match what you saw — DO NOT GUESS.
export type ItemMod = {
  id: string;          // e.g. "lifesteal"
  value: number | number[];  // some mods have ranges
  // add other fields you observe (label?, name?, format?)
};

export type ItemQuality =
  | "normal"
  | "magic"
  | "rare"
  | "set"
  | "unique"
  | "crafted"
  | "runeword"
  | "low_quality"
  | "superior"
  | string;

export type Item = {
  id: number;
  base: ItemBase;
  hash: string;
  quality: ItemQuality;          // CONFIRM field name from inspect output
  name?: string;                  // unique/set/runeword display name
  mods: ItemMod[];                // CONFIRM field name from inspect output
  ethereal?: boolean;
  // location/slot field — CONFIRM exact name
  location?: string;
  slot?: string;
  equipped?: boolean;
};

export type Skill = {
  id: number;
  name: string;
  level: number;
};

export type CharacterClass = {
  id: number;
  name: string;
};

export type CharacterMeta = {
  name: string;
  level: number;
  class: CharacterClass;
  life: number;
  mana: number;
  gold: { stash: number; total: number; character: number };
  points: { stat: number; skill: number };
  skills: Skill[];
  // ADD stats field here once confirmed from inspect output:
  // stats?: { strength: number; dexterity: number; vitality: number; energy: number };
};

export type Mercenary = {
  // CONFIRM all fields from inspect output before relying on them.
  type?: string;
  name?: string;
  level?: number;
  items?: Item[];
};

export type Character = {
  accountName: string;
  character: CharacterMeta;
  realSkills: Array<{ name: string; level: number }>;
  items: Item[];
  mercenary: Mercenary;
  file: {
    header: number;
    version: number;
    checksum: number;
    filesize: number;
    updated_at: number;
  };
  lastUpdated: number;
};

export type CharactersResponse = {
  total: number;
  characters: Character[];
};

// Game mode is NOT in the dump directly — must be derived. Confirm during
// inspect-snapshot review whether `character.flags.hardcore` exists or similar.
export type GameMode = "hardcore" | "softcore";

export type Slot =
  | "helm"
  | "armor"
  | "weapon"
  | "offhand"
  | "gloves"
  | "belt"
  | "boots"
  | "amulet"
  | "ring";

export type Filter = {
  gameMode: GameMode;
  className: string;
  skills: Array<{ name: string; minLevel: number }>;
  minCharLevel: number;
  topN: number;
};
```

**IMPORTANT:** before continuing, edit this file to match the *actual* field names from `inspect-output.txt`. The shape above is a best guess; the inspect output is authoritative. Mark any uncertain field with `// CONFIRM` and resolve before Phase 3.

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Delete inspect-output.txt and commit**

```powershell
del inspect-output.txt
git add scripts/inspect-snapshot.ts src/lib/types.ts
git commit -m "feat(types): derive Character types from live snapshot"
```

Keep `inspect-snapshot.ts` — it's useful when the API schema drifts.

---

### Task 1.4: Build mod dictionary

**Files:**
- Create: `scripts/build-mod-dictionary.ts`
- Create: `data/mod-dictionary.json`
- Create: `data/item-bases.json`

The exact source strategy depends on Task 1.1's license decision. Pick one branch below.

#### Branch A — license permits copying (MIT / Apache)

- [ ] **Step 1A: Clone pd2-tools source**

```powershell
git clone --depth 1 https://github.com/coleestrin/pd2-tools.git .tmp-pd2-tools
```

- [ ] **Step 2A: Locate the label/format maps**

Inspect `.tmp-pd2-tools/src` for files like `mods.ts`, `properties.ts`, `affixes.ts`, `items.ts`, `bases.ts`. Use:

```powershell
Get-ChildItem -Path .tmp-pd2-tools/src -Recurse -Include *.ts,*.json | Select-String -Pattern "Faster Cast Rate|lifesteal|fcr" | Select-Object -First 20
```

Note the file paths.

- [ ] **Step 3A: Write build script that imports their maps**

Create `scripts/build-mod-dictionary.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Replace the next two imports with the actual paths you found in pd2-tools.
// Example:
//   import modMap from "../.tmp-pd2-tools/src/data/mods.json";
//   import itemBases from "../.tmp-pd2-tools/src/data/items.json";

import modMap from "../.tmp-pd2-tools/src/PUT-REAL-PATH-HERE.json" assert { type: "json" };
import itemBases from "../.tmp-pd2-tools/src/PUT-REAL-PATH-HERE.json" assert { type: "json" };

// Normalize whatever shape pd2-tools uses into our shape.
type DictEntry = {
  label: string;
  format: string;
  category: "stat" | "skill" | "resist" | "damage" | "utility" | "other";
};

function normalize(raw: unknown): Record<string, DictEntry> {
  // FILL IN once you see the source shape.
  return {} as Record<string, DictEntry>;
}

async function main() {
  const dict = normalize(modMap);
  const bases = itemBases; // pass through if already in usable shape

  await writeFile(
    join(process.cwd(), "data", "mod-dictionary.json"),
    JSON.stringify(dict, null, 2),
    "utf8",
  );
  await writeFile(
    join(process.cwd(), "data", "item-bases.json"),
    JSON.stringify(bases, null, 2),
    "utf8",
  );

  // Coverage report against snapshot.
  const snap = JSON.parse(
    await readFile(join(process.cwd(), "data", "snapshot.json"), "utf8"),
  );
  const seenMods = new Set<string>();
  for (const c of snap.characters) {
    for (const it of c.items ?? []) {
      for (const m of it.mods ?? []) seenMods.add(m.id);
    }
  }
  const missing = [...seenMods].filter((id) => !dict[id]);
  console.log(`Mod dict entries: ${Object.keys(dict).length}`);
  console.log(`Distinct mods in snapshot: ${seenMods.size}`);
  console.log(`Missing from dict: ${missing.length}`);
  if (missing.length > 0) {
    console.log("First 30 missing IDs:");
    for (const m of missing.slice(0, 30)) console.log(`  ${m}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

#### Branch B — license forbids copying (GPL / no license)

- [ ] **Step 1B: Skip the clone. Write a wiki-scraping build script instead.**

Create `scripts/build-mod-dictionary.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const WIKI_PAGES = [
  "https://wiki.projectdiablo2.com/wiki/Magical_Affixes",
  "https://wiki.projectdiablo2.com/wiki/Crafted_Items",
  // Add more pages as gaps appear.
];

type DictEntry = {
  label: string;
  format: string;
  category: "stat" | "skill" | "resist" | "damage" | "utility" | "other";
};

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function parseAffixTables(html: string): Record<string, DictEntry> {
  // FILL IN: parse the affix tables from the HTML. cheerio or a regex pass.
  // Each row produces one DictEntry keyed by mod_id.
  return {};
}

async function main() {
  const dict: Record<string, DictEntry> = {};
  for (const url of WIKI_PAGES) {
    const html = await fetchPage(url);
    Object.assign(dict, parseAffixTables(html));
  }

  await writeFile(
    join(process.cwd(), "data", "mod-dictionary.json"),
    JSON.stringify(dict, null, 2),
    "utf8",
  );

  // Coverage report (same as Branch A)
  const snap = JSON.parse(
    await readFile(join(process.cwd(), "data", "snapshot.json"), "utf8"),
  );
  const seenMods = new Set<string>();
  for (const c of snap.characters) {
    for (const it of c.items ?? []) {
      for (const m of it.mods ?? []) seenMods.add(m.id);
    }
  }
  const missing = [...seenMods].filter((id) => !dict[id]);
  console.log(`Mod dict entries: ${Object.keys(dict).length}`);
  console.log(`Distinct mods in snapshot: ${seenMods.size}`);
  console.log(`Missing from dict: ${missing.length}`);
  if (missing.length > 0) {
    console.log("First 30 missing IDs:");
    for (const m of missing.slice(0, 30)) console.log(`  ${m}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

#### Common (both branches)

- [ ] **Step 4: Run the script**

```powershell
npx tsx scripts/build-mod-dictionary.ts
```

Expected: prints coverage report. Aim for >95% coverage of mods seen in the snapshot. Iterate (add wiki pages, write overrides) until acceptable.

- [ ] **Step 5: Add overrides file for last-resort manual entries**

Create `data/mod-dictionary.overrides.json`:

```json
{}
```

The build script should merge this on top of generated entries (add to script if not already there).

- [ ] **Step 6: Cleanup if Branch A**

```powershell
Remove-Item -Recurse -Force .tmp-pd2-tools -ErrorAction SilentlyContinue
```

Add `.tmp-pd2-tools/` to `.gitignore`.

- [ ] **Step 7: Commit**

```powershell
git add scripts/build-mod-dictionary.ts data/mod-dictionary.json data/item-bases.json data/mod-dictionary.overrides.json .gitignore
git commit -m "feat(data): build mod dictionary + item bases"
```

---

## Phase 2 — Test fixtures

### Task 2.1: Build a small character fixture

**Files:**
- Create: `tests/fixtures/characters.ts`
- Create: `tests/fixtures/README.md`

- [ ] **Step 1: Pick a real character from the snapshot to copy**

```powershell
node -e "const j=require('./data/snapshot.json'); const c=j.characters.find(c=>c.character.class.name==='Paladin' && c.character.level>=85); console.log(JSON.stringify(c, null, 2))" > tests/fixtures/sample-paladin.json
```

(If the file is huge, trim to just one character.)

- [ ] **Step 2: Write fixture file**

Create `tests/fixtures/characters.ts`:

```ts
import type { Character } from "@/lib/types";

// 8 hand-crafted characters covering every code path in filter() and aggregate().
// Each one is documented with what it tests.

// 1) Match: HC Paladin level 90, has Holy Bolt 20 + FoH 20, wears Hoto + CoA + 2 rare rings.
const HC_PALADIN_HOTOFOH: Character = {
  // FILL IN — base on the real sample-paladin.json shape.
  // Set character.class.name = "Paladin", character.level = 90,
  // character.skills include {name:"Holy Bolt", level:20}, {name:"Fist of the Heavens", level:20}.
  // items include: a unique helm "Crown of Ages", a unique weapon "Heart of the Oak",
  // and two rare rings each with 3 mods (different mods on each ring).
} as unknown as Character;

// 2) Match: HC Paladin level 85 (just above minLevel filter), barely qualifies.
const HC_PALADIN_LV85: Character = { /* ... */ } as unknown as Character;

// 3) Reject: SC Paladin (gameMode mismatch).
const SC_PALADIN: Character = { /* ... */ } as unknown as Character;

// 4) Reject: HC Sorceress (class mismatch).
const HC_SORC: Character = { /* ... */ } as unknown as Character;

// 5) Reject: HC Paladin but Holy Bolt only level 10 (below minLevel 20).
const HC_PALADIN_LOWHB: Character = { /* ... */ } as unknown as Character;

// 6) Match: HC Paladin level 99 with rare crafted gloves (tests crafted aggregation).
const HC_PALADIN_CRAFTED: Character = { /* ... */ } as unknown as Character;

// 7) Match: HC Paladin with Annihilus + Hellfire Torch + Gheed's (tests special-charm detection).
const HC_PALADIN_FULLCHARMS: Character = { /* ... */ } as unknown as Character;

// 8) Match: HC Paladin with mercenary holding Insight + Andariel's Visage (merc aggregation).
const HC_PALADIN_MERC: Character = { /* ... */ } as unknown as Character;

export const FIXTURE_CHARS: Character[] = [
  HC_PALADIN_HOTOFOH,
  HC_PALADIN_LV85,
  SC_PALADIN,
  HC_SORC,
  HC_PALADIN_LOWHB,
  HC_PALADIN_CRAFTED,
  HC_PALADIN_FULLCHARMS,
  HC_PALADIN_MERC,
];
```

**IMPORTANT:** Fill in each `/* ... */` literal. Reference `tests/fixtures/sample-paladin.json` for valid shapes. Keep each fixture minimal — only the fields the tests actually read. Use `as unknown as Character` to bypass full-shape requirements.

- [ ] **Step 3: Document the fixture intent**

Create `tests/fixtures/README.md`:

```markdown
# Test fixtures

`characters.ts` defines 8 characters that together cover every branch in `filter()` and `aggregate()`. Each comment block explains what filter case or aggregation case the character exercises.

When adding a new test, prefer extending an existing fixture rather than adding a new one — fewer characters keeps the suite legible.

`sample-paladin.json` is one real character pulled from the snapshot, kept as a shape reference. Not directly used by tests.
```

- [ ] **Step 4: Commit**

```powershell
git add tests/fixtures/
git commit -m "test: add character fixtures covering filter + aggregation cases"
```

---

## Phase 3 — Filter logic

### Task 3.1: filter() — failing tests first

**Files:**
- Create: `src/lib/filter.ts` (empty stub)
- Create: `src/lib/filter.test.ts`

- [ ] **Step 1: Create empty stub**

Create `src/lib/filter.ts`:

```ts
import type { Character, Filter } from "./types";

export function filter(_chars: Character[], _f: Filter): Character[] {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write failing tests**

Create `src/lib/filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filter } from "./filter";
import { FIXTURE_CHARS } from "../../tests/fixtures/characters";
import type { Filter } from "./types";

const PALA_HOLYBOLT_FILTER: Filter = {
  gameMode: "hardcore",
  className: "Paladin",
  skills: [{ name: "Holy Bolt", minLevel: 20 }],
  minCharLevel: 85,
  topN: 100,
};

describe("filter", () => {
  it("excludes wrong gameMode", () => {
    const result = filter(FIXTURE_CHARS, PALA_HOLYBOLT_FILTER);
    expect(result.every((c) => /* derive HC field */ true)).toBe(true);
    expect(result.find((c) => c.character.name === "SC_PALADIN_NAME")).toBeUndefined();
  });

  it("excludes wrong class", () => {
    const result = filter(FIXTURE_CHARS, PALA_HOLYBOLT_FILTER);
    expect(result.every((c) => c.character.class.name === "Paladin")).toBe(true);
  });

  it("excludes characters below minLevel for the requested skill", () => {
    const result = filter(FIXTURE_CHARS, PALA_HOLYBOLT_FILTER);
    expect(
      result.every((c) =>
        c.character.skills.some(
          (s) => s.name === "Holy Bolt" && s.level >= 20,
        ),
      ),
    ).toBe(true);
  });

  it("excludes characters below minCharLevel", () => {
    const tightFilter = { ...PALA_HOLYBOLT_FILTER, minCharLevel: 95 };
    const result = filter(FIXTURE_CHARS, tightFilter);
    expect(result.every((c) => c.character.level >= 95)).toBe(true);
  });

  it("requires ALL listed skills, not ANY", () => {
    const multi: Filter = {
      ...PALA_HOLYBOLT_FILTER,
      skills: [
        { name: "Holy Bolt", minLevel: 20 },
        { name: "Fist of the Heavens", minLevel: 20 },
      ],
    };
    const result = filter(FIXTURE_CHARS, multi);
    expect(
      result.every((c) =>
        multi.skills.every((req) =>
          c.character.skills.some(
            (s) => s.name === req.name && s.level >= req.minLevel,
          ),
        ),
      ),
    ).toBe(true);
  });

  it("ranks results by character level descending and takes topN", () => {
    const tightTopN = { ...PALA_HOLYBOLT_FILTER, topN: 2 };
    const result = filter(FIXTURE_CHARS, tightTopN);
    expect(result.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].character.level).toBeGreaterThanOrEqual(
        result[i].character.level,
      );
    }
  });
});
```

(Replace `/* derive HC field */` with the actual hardcore-detection expression once you confirm the field name during fixture authoring. If the dump exposes hardcore via `file.flags` or a top-level field, use that.)

- [ ] **Step 3: Run tests, expect failures**

Run: `npm test`
Expected: 6 failing tests with "not implemented" or "is undefined" errors.

- [ ] **Step 4: Commit failing tests**

```powershell
git add src/lib/filter.ts src/lib/filter.test.ts
git commit -m "test(filter): add failing filter tests"
```

---

### Task 3.2: filter() — implementation

**Files:**
- Modify: `src/lib/filter.ts`

- [ ] **Step 1: Implement filter()**

Replace `src/lib/filter.ts` with:

```ts
import type { Character, Filter } from "./types";

function isHardcore(c: Character): boolean {
  // CONFIRM: Replace this with the actual field. Likely candidates seen in
  // inspect-snapshot output: `c.character.hardcore`, `c.character.flags?.hardcore`,
  // or a bit in `c.file.header`. Pick the right one and document.
  // Placeholder default if no field exists: assume hardcore.
  return ((c.character as unknown) as { hardcore?: boolean }).hardcore ?? true;
}

function meetsSkillRequirement(
  c: Character,
  req: { name: string; minLevel: number },
): boolean {
  return c.character.skills.some(
    (s) => s.name === req.name && s.level >= req.minLevel,
  );
}

export function filter(chars: Character[], f: Filter): Character[] {
  const wanted: "hardcore" | "softcore" = f.gameMode;

  const matched = chars.filter((c) => {
    if (c.character.class.name !== f.className) return false;
    if (c.character.level < f.minCharLevel) return false;
    if ((isHardcore(c) ? "hardcore" : "softcore") !== wanted) return false;
    return f.skills.every((req) => meetsSkillRequirement(c, req));
  });

  matched.sort((a, b) => b.character.level - a.character.level);

  return matched.slice(0, f.topN);
}
```

- [ ] **Step 2: Run tests**

Run: `npm test src/lib/filter.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/filter.ts
git commit -m "feat(filter): implement class/skill/level/gameMode filter"
```

---

## Phase 4 — Aggregation (one section per task)

### Task 4.1: Slot detection helper + tests

**Files:**
- Create: `src/lib/slot.ts`
- Create: `src/lib/slot.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/slot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { itemSlot } from "./slot";
import type { Item } from "./types";

function mk(category: string, type: string, location?: string): Item {
  return {
    base: { category, type, type_code: type },
    location,
  } as unknown as Item;
}

describe("itemSlot", () => {
  it("returns 'helm' for helm-category items in headgear slot", () => {
    expect(itemSlot(mk("armor", "Helm", "head"))).toBe("helm");
  });
  it("returns 'armor' for body armor", () => {
    expect(itemSlot(mk("armor", "Armor", "torso"))).toBe("armor");
  });
  it("returns 'weapon' for primary weapon", () => {
    expect(itemSlot(mk("weapon", "Sword", "right_arm"))).toBe("weapon");
  });
  it("merges ring1 and ring2 into 'ring'", () => {
    expect(itemSlot(mk("jewelry", "Ring", "left_finger"))).toBe("ring");
    expect(itemSlot(mk("jewelry", "Ring", "right_finger"))).toBe("ring");
  });
  it("returns null for stash / inventory items not in an equipped slot", () => {
    expect(itemSlot(mk("misc", "Small Charm", "inventory"))).toBeNull();
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/slot.ts`:

```ts
import type { Item, Slot } from "./types";

// CONFIRM: location string values from inspect-snapshot output.
// Adjust the SLOT_BY_LOCATION map to match the actual values.
const SLOT_BY_LOCATION: Record<string, Slot | null> = {
  head: "helm",
  torso: "armor",
  right_arm: "weapon",
  left_arm: "offhand",
  gloves: "gloves",
  belt: "belt",
  feet: "boots",
  neck: "amulet",
  left_finger: "ring",
  right_finger: "ring",
  inventory: null,
  stash: null,
  cube: null,
};

export function itemSlot(item: Item): Slot | null {
  const loc = (item.location ?? item.slot ?? "").toString();
  if (loc in SLOT_BY_LOCATION) return SLOT_BY_LOCATION[loc];
  return null;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test src/lib/slot.test.ts`
Expected: all 5 pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/slot.ts src/lib/slot.test.ts
git commit -m "feat(slot): item slot detection"
```

---

### Task 4.2: aggregateTopItemsBySlot — TDD

**Files:**
- Create: `src/lib/aggregate/topItems.ts`
- Create: `src/lib/aggregate/topItems.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/aggregate/topItems.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateTopItemsBySlot } from "./topItems";
import type { Character, Item } from "../types";

function mkChar(items: Partial<Item>[]): Character {
  return { items: items as Item[] } as unknown as Character;
}
function mkItem(o: { category: string; type: string; quality: string; name?: string; location: string }): Partial<Item> {
  return {
    base: { category: o.category, type: o.type, type_code: o.type } as Item["base"],
    quality: o.quality as Item["quality"],
    name: o.name,
    location: o.location,
  };
}

describe("aggregateTopItemsBySlot", () => {
  it("counts uniques worn per slot across multiple chars", () => {
    const chars = [
      mkChar([
        mkItem({ category: "weapon", type: "Mace", quality: "unique", name: "Heart of the Oak", location: "right_arm" }),
      ]),
      mkChar([
        mkItem({ category: "weapon", type: "Mace", quality: "unique", name: "Heart of the Oak", location: "right_arm" }),
      ]),
      mkChar([
        mkItem({ category: "weapon", type: "Sword", quality: "unique", name: "Grief", location: "right_arm" }),
      ]),
    ];
    const result = aggregateTopItemsBySlot(chars);
    expect(result.weapon[0]).toMatchObject({
      itemName: "Heart of the Oak",
      count: 2,
      pct: expect.closeTo(66.6, 0),
    });
    expect(result.weapon[1].itemName).toBe("Grief");
  });

  it("ignores rare/magic/crafted items in this aggregator", () => {
    const chars = [
      mkChar([
        mkItem({ category: "jewelry", type: "Ring", quality: "rare", location: "left_finger" }),
      ]),
    ];
    const result = aggregateTopItemsBySlot(chars);
    expect(result.ring).toEqual([]);
  });

  it("returns empty arrays for slots with no items", () => {
    const result = aggregateTopItemsBySlot([mkChar([])]);
    expect(result.helm).toEqual([]);
    expect(result.armor).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/aggregate/topItems.ts`:

```ts
import type { Character, Slot } from "../types";
import { itemSlot } from "../slot";

const FIXED_QUALITIES = new Set(["unique", "set", "runeword"]);
const SLOTS: Slot[] = ["helm", "armor", "weapon", "offhand", "gloves", "belt", "boots", "amulet", "ring"];

export type TopItem = {
  itemName: string;
  baseName: string;
  type: "unique" | "set" | "runeword";
  count: number;
  pct: number;
};

export type TopItemsBySlot = Record<Slot, TopItem[]>;

export function aggregateTopItemsBySlot(chars: Character[]): TopItemsBySlot {
  const counts: Record<Slot, Map<string, { count: number; baseName: string; type: TopItem["type"] }>> =
    Object.fromEntries(SLOTS.map((s) => [s, new Map()])) as TopItemsBySlot extends infer T ? T : never;

  const slotTotals: Record<Slot, number> = Object.fromEntries(
    SLOTS.map((s) => [s, 0]),
  ) as Record<Slot, number>;

  for (const c of chars) {
    for (const it of c.items ?? []) {
      const slot = itemSlot(it);
      if (!slot) continue;
      slotTotals[slot]++;
      if (!FIXED_QUALITIES.has(it.quality)) continue;
      const name = it.name ?? `Unknown ${it.base?.type}`;
      const key = name;
      const cur = counts[slot].get(key) ?? {
        count: 0,
        baseName: it.base?.type ?? "",
        type: it.quality as TopItem["type"],
      };
      cur.count++;
      counts[slot].set(key, cur);
    }
  }

  const out = {} as TopItemsBySlot;
  for (const s of SLOTS) {
    const total = slotTotals[s] || 1;
    const arr: TopItem[] = [];
    for (const [name, v] of counts[s]) {
      arr.push({ itemName: name, baseName: v.baseName, type: v.type, count: v.count, pct: (v.count / total) * 100 });
    }
    arr.sort((a, b) => b.count - a.count);
    out[s] = arr.slice(0, 8);
  }
  return out;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test src/lib/aggregate/topItems.test.ts`
Expected: 3 pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/aggregate/topItems.ts src/lib/aggregate/topItems.test.ts
git commit -m "feat(aggregate): top equipped items by slot"
```

---

### Task 4.3: aggregateAffixModsBySlot — TDD

**Files:**
- Create: `src/lib/aggregate/affixMods.ts`
- Create: `src/lib/aggregate/affixMods.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/aggregate/affixMods.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateAffixModsBySlot } from "./affixMods";
import type { Character, Item } from "../types";

function ring(mods: Array<{ id: string; value: number }>): Partial<Item> {
  return {
    base: { category: "jewelry", type: "Ring", type_code: "ring" } as Item["base"],
    quality: "rare",
    location: "left_finger",
    mods: mods as Item["mods"],
  };
}

const dict = {
  fcr: { label: "Faster Cast Rate", format: "{value}% Faster Cast Rate", category: "stat" as const },
  life: { label: "Life", format: "+{value} to Life", category: "stat" as const },
  ar: { label: "All Resistances", format: "All Resistances +{value}", category: "resist" as const },
};

describe("aggregateAffixModsBySlot", () => {
  it("counts mods per slot for rare items only, with median+p75", () => {
    const chars: Character[] = [
      { items: [ring([{ id: "fcr", value: 10 }, { id: "life", value: 30 }])] },
      { items: [ring([{ id: "fcr", value: 10 }, { id: "life", value: 60 }])] },
      { items: [ring([{ id: "fcr", value: 10 }])] },
    ] as unknown as Character[];

    const result = aggregateAffixModsBySlot(chars, dict);
    const ringMods = result.ring;
    const fcr = ringMods.find((m) => m.modId === "fcr")!;
    const life = ringMods.find((m) => m.modId === "life")!;

    expect(fcr.count).toBe(3);
    expect(fcr.pct).toBeCloseTo(100, 0);
    expect(life.count).toBe(2);
    expect(life.medianValue).toBe(45);
  });

  it("skips uniques, sets, runewords, magic, normal", () => {
    const uniqueRing: Partial<Item> = {
      base: { category: "jewelry", type: "Ring", type_code: "ring" } as Item["base"],
      quality: "unique",
      location: "left_finger",
      mods: [{ id: "fcr", value: 10 } as Item["mods"][number]],
    };
    const result = aggregateAffixModsBySlot(
      [{ items: [uniqueRing] }] as unknown as Character[],
      dict,
    );
    expect(result.ring).toEqual([]);
  });

  it("uses dictionary label when present, falls back to modId otherwise", () => {
    const r = ring([{ id: "unknown_mod", value: 5 }]);
    const result = aggregateAffixModsBySlot([{ items: [r] }] as unknown as Character[], dict);
    const m = result.ring.find((m) => m.modId === "unknown_mod")!;
    expect(m.label).toBe("unknown_mod");
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/aggregate/affixMods.ts`:

```ts
import type { Character, Item, Slot } from "../types";
import { itemSlot } from "../slot";

const ROLLABLE_QUALITIES = new Set(["magic", "rare", "crafted"]);
const SLOTS: Slot[] = ["helm", "armor", "weapon", "offhand", "gloves", "belt", "boots", "amulet", "ring"];

type DictEntry = { label: string; format: string; category: string };
export type ModDictionary = Record<string, DictEntry>;

export type AffixMod = {
  modId: string;
  label: string;
  count: number;
  pct: number;
  medianValue: number;
  p75Value: number;
};

export type AffixModsBySlot = Record<Slot, AffixMod[]>;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function modValueAsNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
    // Treat ranges as their mean for median/p75 purposes.
    const nums = v.filter((x): x is number => typeof x === "number");
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
  return null;
}

export function aggregateAffixModsBySlot(
  chars: Character[],
  dict: ModDictionary,
): AffixModsBySlot {
  const slotItemCount: Record<Slot, number> = Object.fromEntries(
    SLOTS.map((s) => [s, 0]),
  ) as Record<Slot, number>;
  const buckets: Record<Slot, Map<string, number[]>> = Object.fromEntries(
    SLOTS.map((s) => [s, new Map()]),
  ) as Record<Slot, Map<string, number[]>>;

  for (const c of chars) {
    for (const it of c.items ?? []) {
      const slot = itemSlot(it);
      if (!slot) continue;
      if (!ROLLABLE_QUALITIES.has(it.quality)) continue;
      slotItemCount[slot]++;
      for (const mod of (it.mods ?? []) as Item["mods"]) {
        const arr = buckets[slot].get(mod.id) ?? [];
        const num = modValueAsNumber(mod.value);
        if (num !== null) arr.push(num);
        buckets[slot].set(mod.id, arr);
      }
    }
  }

  const out = {} as AffixModsBySlot;
  for (const s of SLOTS) {
    const total = slotItemCount[s] || 1;
    const mods: AffixMod[] = [];
    for (const [modId, values] of buckets[s]) {
      const sorted = [...values].sort((a, b) => a - b);
      const median = quantile(sorted, 0.5);
      const p75 = quantile(sorted, 0.75);
      mods.push({
        modId,
        label: dict[modId]?.label ?? modId,
        count: values.length,
        pct: (values.length / total) * 100,
        medianValue: median,
        p75Value: p75,
      });
    }
    mods.sort((a, b) => b.count - a.count);
    out[s] = mods;
  }
  return out;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test src/lib/aggregate/affixMods.test.ts`
Expected: 3 pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/aggregate/affixMods.ts src/lib/aggregate/affixMods.test.ts
git commit -m "feat(aggregate): affix mod frequency by slot"
```

---

### Task 4.4: aggregateCharms — TDD

**Files:**
- Create: `src/lib/aggregate/charms.ts`
- Create: `src/lib/aggregate/charms.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/aggregate/charms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateCharms } from "./charms";
import type { Character, Item } from "../types";

function gc(mods: Array<{ id: string; value: number }>): Partial<Item> {
  return {
    base: { type_code: "cm2", category: "misc", type: "Grand Charm" } as Item["base"],
    quality: "magic",
    location: "inventory",
    mods: mods as Item["mods"],
  };
}
function unique(name: string): Partial<Item> {
  return {
    base: { type_code: "cm1", category: "misc", type: "Small Charm" } as Item["base"],
    quality: "unique",
    name,
    location: "inventory",
  };
}
const dict = {
  paladin_skills: { label: "+1 Paladin Skills", format: "+1 Paladin Skills", category: "skill" as const },
  life: { label: "Life", format: "+{value} Life", category: "stat" as const },
};

describe("aggregateCharms", () => {
  it("counts top GC mods", () => {
    const chars: Character[] = [
      { items: [gc([{ id: "paladin_skills", value: 1 }, { id: "life", value: 45 }])] },
      { items: [gc([{ id: "paladin_skills", value: 1 }])] },
    ] as unknown as Character[];
    const r = aggregateCharms(chars, dict);
    expect(r.topGcMods[0].label).toBe("+1 Paladin Skills");
    expect(r.topGcMods[0].count).toBe(2);
  });

  it("detects annihilus / torch / gheed by unique name", () => {
    const chars: Character[] = [
      { items: [unique("Annihilus"), unique("Hellfire Torch")] },
      { items: [unique("Gheed's Fortune")] },
    ] as unknown as Character[];
    const r = aggregateCharms(chars, dict);
    expect(r.annihilus.count).toBe(1);
    expect(r.torch.count).toBe(1);
    expect(r.gheeds.count).toBe(1);
  });

  it("computes avg total charms per character", () => {
    const chars: Character[] = [
      { items: [gc([{ id: "life", value: 1 }]), gc([{ id: "life", value: 1 }])] },
      { items: [gc([{ id: "life", value: 1 }])] },
    ] as unknown as Character[];
    const r = aggregateCharms(chars, dict);
    expect(r.avgCount).toBeCloseTo(1.5);
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/aggregate/charms.ts`:

```ts
import type { Character, Item } from "../types";
import type { ModDictionary } from "./affixMods";

export type CharmModEntry = { label: string; modId: string; count: number; pct: number };
export type CharmsAggregate = {
  avgCount: number;
  annihilus: { count: number; pct: number };
  torch: { count: number; pct: number };
  gheeds: { count: number; pct: number };
  topGcMods: CharmModEntry[];
  topScMods: CharmModEntry[];
};

const GC_CODES = new Set(["cm2"]);
const SC_CODES = new Set(["cm1"]);
const GRAND_CHARM_NAMES = new Set(["Hellfire Torch", "Annihilus", "Gheed's Fortune"]);

export function aggregateCharms(chars: Character[], dict: ModDictionary): CharmsAggregate {
  const n = chars.length || 1;
  let totalCharms = 0;
  let anniCount = 0, torchCount = 0, gheedsCount = 0;
  const gcMods = new Map<string, number>();
  const scMods = new Map<string, number>();

  for (const c of chars) {
    for (const it of c.items ?? []) {
      const code = it.base?.type_code ?? "";
      const isGc = GC_CODES.has(code);
      const isSc = SC_CODES.has(code);
      if (!isGc && !isSc) continue;
      totalCharms++;
      if (it.name === "Annihilus") anniCount++;
      else if (it.name === "Hellfire Torch") torchCount++;
      else if (it.name === "Gheed's Fortune") gheedsCount++;
      const target = isGc ? gcMods : scMods;
      for (const mod of (it.mods ?? []) as Item["mods"]) {
        target.set(mod.id, (target.get(mod.id) ?? 0) + 1);
      }
    }
  }

  const toEntries = (m: Map<string, number>): CharmModEntry[] =>
    [...m.entries()]
      .map(([modId, count]) => ({
        modId,
        label: dict[modId]?.label ?? modId,
        count,
        pct: (count / n) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

  return {
    avgCount: totalCharms / n,
    annihilus: { count: anniCount, pct: (anniCount / n) * 100 },
    torch: { count: torchCount, pct: (torchCount / n) * 100 },
    gheeds: { count: gheedsCount, pct: (gheedsCount / n) * 100 },
    topGcMods: toEntries(gcMods),
    topScMods: toEntries(scMods),
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test src/lib/aggregate/charms.test.ts`
Expected: 3 pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/aggregate/charms.ts src/lib/aggregate/charms.test.ts
git commit -m "feat(aggregate): charm patterns"
```

---

### Task 4.5: aggregateBuildSheet — TDD

**Files:**
- Create: `src/lib/aggregate/buildSheet.ts`
- Create: `src/lib/aggregate/buildSheet.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/aggregate/buildSheet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateBuildSheet } from "./buildSheet";
import type { Character } from "../types";

function mkChar(level: number, skills: Array<{ name: string; level: number }>): Character {
  return {
    character: { level, skills, class: { name: "Paladin", id: 3 } },
    items: [],
    mercenary: {},
  } as unknown as Character;
}

describe("aggregateBuildSheet", () => {
  it("computes avg + median per skill, top 6 by avg", () => {
    const chars = [
      mkChar(99, [{ name: "Holy Bolt", level: 20 }, { name: "Fist of the Heavens", level: 28 }]),
      mkChar(97, [{ name: "Holy Bolt", level: 20 }, { name: "Fist of the Heavens", level: 30 }]),
    ];
    const r = aggregateBuildSheet(chars);
    const foh = r.skillPoints.find((s) => s.skillName === "Fist of the Heavens")!;
    expect(foh.avgPoints).toBeCloseTo(29);
  });

  it("computes level histogram", () => {
    const chars = [mkChar(95, []), mkChar(95, []), mkChar(99, [])];
    const r = aggregateBuildSheet(chars);
    expect(r.levelDistribution.find((b) => b.level === 95)?.count).toBe(2);
    expect(r.levelDistribution.find((b) => b.level === 99)?.count).toBe(1);
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/aggregate/buildSheet.ts`:

```ts
import type { Character } from "../types";

export type BuildSheet = {
  skillPoints: Array<{ skillName: string; avgPoints: number; medianPoints: number }>;
  stats: { str: number; dex: number; vit: number; energy: number };
  levelDistribution: Array<{ level: number; count: number }>;
  mercenary: {
    topType: string;
    typeCounts: Record<string, number>;
    topItems: Record<string, Array<{ baseName: string; itemName: string; count: number; pct: number }>>;
  };
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function aggregateBuildSheet(chars: Character[]): BuildSheet {
  // Skill aggregation
  const perSkill = new Map<string, number[]>();
  for (const c of chars) {
    for (const sk of c.character.skills ?? []) {
      if (sk.level <= 0) continue;
      const arr = perSkill.get(sk.name) ?? [];
      arr.push(sk.level);
      perSkill.set(sk.name, arr);
    }
  }
  const skillPoints = [...perSkill.entries()]
    .map(([name, vals]) => ({
      skillName: name,
      avgPoints: vals.reduce((a, b) => a + b, 0) / vals.length,
      medianPoints: median(vals),
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints)
    .slice(0, 6);

  // Stats — CONFIRM the actual field path. If absent, return zeros.
  const stats = { str: 0, dex: 0, vit: 0, energy: 0 };
  // TODO at implementation time: read from c.character.stats once confirmed
  // and average across chars. Until then, keep zeros — UI will hide the row.

  // Level histogram
  const levels = new Map<number, number>();
  for (const c of chars) levels.set(c.character.level, (levels.get(c.character.level) ?? 0) + 1);
  const levelDistribution = [...levels.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => a.level - b.level);

  // Merc — type frequency only for now; items handled in the worker glue layer.
  const typeCounts: Record<string, number> = {};
  for (const c of chars) {
    const t = (c.mercenary as { type?: string })?.type;
    if (t) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return {
    skillPoints,
    stats,
    levelDistribution,
    mercenary: { topType, typeCounts, topItems: {} },
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test src/lib/aggregate/buildSheet.test.ts`
Expected: 2 pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/aggregate/buildSheet.ts src/lib/aggregate/buildSheet.test.ts
git commit -m "feat(aggregate): build sheet (skills + level dist + merc type)"
```

---

### Task 4.6: aggregate() facade

**Files:**
- Create: `src/lib/aggregate.ts`

- [ ] **Step 1: Write the facade**

Create `src/lib/aggregate.ts`:

```ts
import type { Character } from "./types";
import { aggregateTopItemsBySlot, type TopItemsBySlot } from "./aggregate/topItems";
import { aggregateAffixModsBySlot, type AffixModsBySlot, type ModDictionary } from "./aggregate/affixMods";
import { aggregateCharms, type CharmsAggregate } from "./aggregate/charms";
import { aggregateBuildSheet, type BuildSheet } from "./aggregate/buildSheet";

export type GuideSections = {
  poolSize: number;
  topItemsBySlot: TopItemsBySlot;
  affixModsBySlot: AffixModsBySlot;
  charms: CharmsAggregate;
  build: BuildSheet;
};

export function aggregate(chars: Character[], dict: ModDictionary): GuideSections {
  return {
    poolSize: chars.length,
    topItemsBySlot: aggregateTopItemsBySlot(chars),
    affixModsBySlot: aggregateAffixModsBySlot(chars, dict),
    charms: aggregateCharms(chars, dict),
    build: aggregateBuildSheet(chars),
  };
}
```

- [ ] **Step 2: Sanity test against the real snapshot**

Create `src/lib/aggregate.smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { aggregate } from "./aggregate";
import { filter } from "./filter";

describe("aggregate (smoke)", () => {
  it("runs against the real snapshot without throwing", async () => {
    const snap = JSON.parse(await readFile("data/snapshot.json", "utf8"));
    const dict = JSON.parse(await readFile("data/mod-dictionary.json", "utf8"));
    const matched = filter(snap.characters, {
      gameMode: "hardcore",
      className: "Paladin",
      skills: [],
      minCharLevel: 80,
      topN: 100,
    });
    const result = aggregate(matched, dict);
    expect(result.poolSize).toBe(matched.length);
    expect(result.topItemsBySlot.weapon).toBeDefined();
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: all tests pass including the new smoke test.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/aggregate.ts src/lib/aggregate.smoke.test.ts
git commit -m "feat(aggregate): facade + smoke test against real snapshot"
```

---

## Phase 5 — Diff logic

### Task 5.1: diff() — TDD

**Files:**
- Create: `src/lib/diff.ts`
- Create: `src/lib/diff.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffCharacter } from "./diff";
import type { Character } from "./types";
import type { GuideSections } from "./aggregate";

const myChar: Character = {
  character: { level: 92, name: "Mine", class: { name: "Paladin", id: 3 }, skills: [{ name: "Holy Bolt", level: 20 }] },
  items: [
    { base: { category: "weapon", type: "Mace", type_code: "rfb" }, quality: "rare", location: "right_arm", mods: [{ id: "fcr", value: 10 }] },
  ],
  mercenary: {},
} as unknown as Character;

const sections: GuideSections = {
  poolSize: 100,
  topItemsBySlot: {
    weapon: [{ itemName: "Heart of the Oak", baseName: "Mace", type: "runeword", count: 78, pct: 78 }],
    helm: [], armor: [], offhand: [], gloves: [], belt: [], boots: [], amulet: [], ring: [],
  },
  affixModsBySlot: {
    weapon: [{ modId: "fcr", label: "FCR", count: 80, pct: 80, medianValue: 30, p75Value: 40 }],
    helm: [], armor: [], offhand: [], gloves: [], belt: [], boots: [], amulet: [], ring: [],
  },
  charms: { avgCount: 0, annihilus: { count: 0, pct: 0 }, torch: { count: 0, pct: 0 }, gheeds: { count: 0, pct: 0 }, topGcMods: [], topScMods: [] },
  build: { skillPoints: [], stats: { str: 0, dex: 0, vit: 0, energy: 0 }, levelDistribution: [], mercenary: { topType: "", typeCounts: {}, topItems: {} } },
};

describe("diffCharacter", () => {
  it("flags slots where user's item differs from pool top", () => {
    const r = diffCharacter(myChar, sections);
    const w = r.slots.weapon!;
    expect(w.poolTopName).toBe("Heart of the Oak");
    expect(w.userItemName).toMatch(/Rare Mace|Unknown/);
    expect(w.userMatchesPoolTop).toBe(false);
  });

  it("highlights pool top mods missing from user's rare gear", () => {
    const r = diffCharacter(myChar, sections);
    const w = r.slots.weapon!;
    expect(w.modsUserHas).toEqual(["fcr"]);
    expect(w.poolTopMods.find((m) => m.modId === "fcr")?.userHas).toBe(true);
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/diff.ts`:

```ts
import type { Character, Slot } from "./types";
import type { GuideSections } from "./aggregate";
import { itemSlot } from "./slot";

const SLOTS: Slot[] = ["helm", "armor", "weapon", "offhand", "gloves", "belt", "boots", "amulet", "ring"];

export type SlotDiff = {
  poolTopName: string | null;
  userItemName: string | null;
  userMatchesPoolTop: boolean;
  modsUserHas: string[];
  poolTopMods: Array<{ modId: string; label: string; pct: number; userHas: boolean }>;
};

export type CharacterDiff = {
  slots: Partial<Record<Slot, SlotDiff>>;
};

export function diffCharacter(c: Character, sections: GuideSections): CharacterDiff {
  const slots: Partial<Record<Slot, SlotDiff>> = {};
  for (const slot of SLOTS) {
    const item = (c.items ?? []).find((it) => itemSlot(it) === slot);
    const poolTop = sections.topItemsBySlot[slot]?.[0];
    const poolMods = sections.affixModsBySlot[slot]?.slice(0, 5) ?? [];
    const userMods = (item?.mods ?? []).map((m) => m.id);
    const userName = item ? (item.name ?? `Rare ${item.base?.type ?? "Item"}`) : null;
    slots[slot] = {
      poolTopName: poolTop?.itemName ?? null,
      userItemName: userName,
      userMatchesPoolTop: !!poolTop && !!userName && userName === poolTop.itemName,
      modsUserHas: userMods,
      poolTopMods: poolMods.map((m) => ({
        modId: m.modId,
        label: m.label,
        pct: m.pct,
        userHas: userMods.includes(m.modId),
      })),
    };
  }
  return { slots };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test src/lib/diff.test.ts`
Expected: 2 pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/diff.ts src/lib/diff.test.ts
git commit -m "feat(diff): per-slot character vs pool diff"
```

---

## Phase 6 — Data loader

### Task 6.1: data-loader

**Files:**
- Create: `src/lib/data-loader.ts`

- [ ] **Step 1: Implementation**

Create `src/lib/data-loader.ts`:

```ts
import { get, set } from "idb-keyval";
import type { Character, CharactersResponse } from "./types";

const CACHE_KEY = "pd2-characters-dump";
const TTL_MS = 24 * 60 * 60 * 1000;
const API_URL = "https://api.pd2.tools/api/v1/characters";
const SNAPSHOT_PATH = "/snapshot.json"; // shipped via public/

type Cached = { fetchedAt: number; data: Character[] };

export type LoadResult = {
  characters: Character[];
  source: "live" | "cache" | "snapshot";
  fetchedAt: number;
};

async function readCache(): Promise<Cached | null> {
  try {
    const v = (await get(CACHE_KEY)) as Cached | undefined;
    return v ?? null;
  } catch {
    return null;
  }
}

async function writeCache(c: Cached): Promise<void> {
  try { await set(CACHE_KEY, c); } catch { /* ignore quota errors */ }
}

async function fetchLive(): Promise<Character[]> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as CharactersResponse;
  return json.characters;
}

async function fetchSnapshot(): Promise<Character[]> {
  const res = await fetch(SNAPSHOT_PATH);
  if (!res.ok) throw new Error(`snapshot fetch HTTP ${res.status}`);
  const json = (await res.json()) as CharactersResponse;
  return json.characters;
}

export async function loadCharacters(): Promise<LoadResult> {
  const cached = await readCache();
  const now = Date.now();
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return { characters: cached.data, source: "cache", fetchedAt: cached.fetchedAt };
  }
  try {
    const data = await fetchLive();
    await writeCache({ fetchedAt: now, data });
    return { characters: data, source: "live", fetchedAt: now };
  } catch {
    if (cached) {
      return { characters: cached.data, source: "cache", fetchedAt: cached.fetchedAt };
    }
    const snap = await fetchSnapshot();
    return { characters: snap, source: "snapshot", fetchedAt: now };
  }
}
```

- [ ] **Step 2: Move snapshot into public/ so the static export ships it**

```powershell
New-Item -ItemType Directory -Path public -Force | Out-Null
Copy-Item data\snapshot.json public\snapshot.json -Force
```

Add to `package.json` scripts:

```json
"prebuild": "node -e \"require('fs').copyFileSync('data/snapshot.json','public/snapshot.json')\""
```

So future builds always pick up the latest snapshot.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/data-loader.ts public/snapshot.json package.json
git commit -m "feat(data-loader): IndexedDB cache + live + snapshot fallback"
```

---

## Phase 7 — Web Worker

### Task 7.1: aggregation worker

**Files:**
- Create: `src/workers/aggregate.worker.ts`
- Create: `src/lib/runWorker.ts`

- [ ] **Step 1: Write the worker**

Create `src/workers/aggregate.worker.ts`:

```ts
import { filter } from "@/lib/filter";
import { aggregate, type GuideSections } from "@/lib/aggregate";
import { diffCharacter, type CharacterDiff } from "@/lib/diff";
import type { Character, Filter } from "@/lib/types";
import type { ModDictionary } from "@/lib/aggregate/affixMods";

export type WorkerInput = {
  characters: Character[];
  dict: ModDictionary;
  filter: Filter;
  diffTarget?: { name: string };
};

export type WorkerOutput = {
  matchedCount: number;
  guide: GuideSections;
  diff: CharacterDiff | null;
  diffNotFound: boolean;
};

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { characters, dict, filter: f, diffTarget } = e.data;
  const matched = filter(characters, f);
  const guide = aggregate(matched, dict);

  let diff: CharacterDiff | null = null;
  let diffNotFound = false;
  if (diffTarget) {
    const needle = diffTarget.name.toLowerCase();
    const found = characters.find(
      (c) =>
        c.character.name.toLowerCase() === needle ||
        c.accountName.toLowerCase() === needle,
    );
    if (found) diff = diffCharacter(found, guide);
    else diffNotFound = true;
  }

  const out: WorkerOutput = {
    matchedCount: matched.length,
    guide,
    diff,
    diffNotFound,
  };
  (self as unknown as Worker).postMessage(out);
};
```

- [ ] **Step 2: Write the runWorker helper**

Create `src/lib/runWorker.ts`:

```ts
import type { WorkerInput, WorkerOutput } from "@/workers/aggregate.worker";

export function runAggregate(input: WorkerInput): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("../workers/aggregate.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerOutput>) => {
      resolve(e.data);
      w.terminate();
    };
    w.onerror = (e) => {
      reject(e);
      w.terminate();
    };
    w.postMessage(input);
  });
}
```

- [ ] **Step 3: Verify build still succeeds (Next.js needs to bundle the worker)**

Run: `npm run build`
Expected: build succeeds. If it fails on the worker import, follow the error: typically Next 15 needs `serverExternalPackages` adjustments or you may need to switch to the `?worker` import suffix used by Vite. Search Next 15 docs for "Web Worker static export".

If static export blocks workers, fall back to running the worker in-line on the main thread:

```ts
// Alternate runWorker for static export:
import { filter } from "@/lib/filter";
import { aggregate } from "@/lib/aggregate";
import { diffCharacter } from "@/lib/diff";
// ... call directly, return synchronously wrapped in Promise.resolve()
```

Document the fallback in `CLAUDE.md` if used.

- [ ] **Step 4: Commit**

```powershell
git add src/workers/ src/lib/runWorker.ts
git commit -m "feat(worker): aggregation web worker + helper"
```

---

## Phase 8 — UI

### Task 8.1: Install shadcn/ui

**Files:**
- Modify: package.json, components.json, src/components/ui/* (via shadcn init)

- [ ] **Step 1: Init shadcn**

```powershell
npx shadcn@latest init
```

Pick: Default style, Slate base color, src/app/globals.css, yes to RSC, src/components alias.

- [ ] **Step 2: Add the components we'll use**

```powershell
npx shadcn@latest add button card input select slider table tabs badge skeleton tooltip
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "chore(ui): install shadcn + base components"
```

---

### Task 8.2: FilterForm component

**Files:**
- Create: `src/components/FilterForm.tsx`
- Create: `src/lib/url-state.ts`

- [ ] **Step 1: URL state helper**

Create `src/lib/url-state.ts`:

```ts
import type { Filter, GameMode } from "./types";

export function filterToParams(f: Filter, mode: "guide" | "diff", diffName?: string): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", mode);
  p.set("gameMode", f.gameMode);
  p.set("class", f.className);
  p.set("skills", JSON.stringify(f.skills));
  p.set("minLevel", String(f.minCharLevel));
  p.set("topN", String(f.topN));
  if (diffName) p.set("char", diffName);
  return p;
}

export function paramsToFilter(p: URLSearchParams): { filter: Filter; mode: "guide" | "diff"; diffName: string } {
  const skillsRaw = p.get("skills");
  let skills: Filter["skills"] = [];
  try { if (skillsRaw) skills = JSON.parse(skillsRaw); } catch { /* fall through */ }
  const filter: Filter = {
    gameMode: ((p.get("gameMode") as GameMode) ?? "hardcore"),
    className: p.get("class") ?? "Paladin",
    skills,
    minCharLevel: Number(p.get("minLevel") ?? 80),
    topN: Number(p.get("topN") ?? 100),
  };
  return { filter, mode: ((p.get("mode") as "guide" | "diff") ?? "guide"), diffName: p.get("char") ?? "" };
}
```

- [ ] **Step 2: FilterForm**

Create `src/components/FilterForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { Filter, GameMode } from "@/lib/types";

const CLASSES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress"];

type Props = {
  initial: Filter;
  initialMode: "guide" | "diff";
  initialDiffName: string;
  onSubmit: (f: Filter, mode: "guide" | "diff", diffName: string) => void;
};

export function FilterForm({ initial, initialMode, initialDiffName, onSubmit }: Props) {
  const [mode, setMode] = useState(initialMode);
  const [gameMode, setGameMode] = useState<GameMode>(initial.gameMode);
  const [className, setClassName] = useState(initial.className);
  const [skillsText, setSkillsText] = useState(JSON.stringify(initial.skills));
  const [minLevel, setMinLevel] = useState(initial.minCharLevel);
  const [topN, setTopN] = useState(initial.topN);
  const [diffName, setDiffName] = useState(initialDiffName);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex gap-4">
        <label><input type="radio" checked={mode === "guide"} onChange={() => setMode("guide")} /> Build a guide</label>
        <label><input type="radio" checked={mode === "diff"} onChange={() => setMode("diff")} /> Diff my character</label>
      </div>

      {mode === "diff" && (
        <Input
          placeholder="Character name or account name"
          value={diffName}
          onChange={(e) => setDiffName(e.target.value)}
        />
      )}

      <div className="flex gap-4">
        <label><input type="radio" checked={gameMode === "hardcore"} onChange={() => setGameMode("hardcore")} /> Hardcore</label>
        <label><input type="radio" checked={gameMode === "softcore"} onChange={() => setGameMode("softcore")} /> Softcore</label>
      </div>

      <select value={className} onChange={(e) => setClassName(e.target.value)} className="border rounded px-2 py-1">
        {CLASSES.map((c) => <option key={c}>{c}</option>)}
      </select>

      <div>
        <label className="block text-sm">Skills (JSON: [{`{`}"name":"Holy Bolt","minLevel":20{`}`}])</label>
        <Input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm">Min character level: {minLevel}</label>
        <Slider min={1} max={99} value={[minLevel]} onValueChange={(v) => setMinLevel(v[0])} />
      </div>

      <div>
        <label className="block text-sm">Top N: {topN}</label>
        <Slider min={10} max={500} step={10} value={[topN]} onValueChange={(v) => setTopN(v[0])} />
      </div>

      <Button
        onClick={() => {
          let skills: Filter["skills"];
          try { skills = JSON.parse(skillsText); } catch { skills = []; }
          onSubmit({ gameMode, className, skills, minCharLevel: minLevel, topN }, mode, diffName);
        }}
      >
        Generate Guide
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add src/components/FilterForm.tsx src/lib/url-state.ts
git commit -m "feat(ui): FilterForm + URL state"
```

---

### Task 8.3: ItemFrequencyTable + AffixFrequencyTable + CharmPanel + BuildSheet + DiffView

**Files:**
- Create: `src/components/ItemFrequencyTable.tsx`
- Create: `src/components/AffixFrequencyTable.tsx`
- Create: `src/components/CharmPanel.tsx`
- Create: `src/components/BuildSheet.tsx`
- Create: `src/components/DiffView.tsx`

These are display-only components. Each takes one slice of `GuideSections` and renders it.

- [ ] **Step 1: ItemFrequencyTable**

Create `src/components/ItemFrequencyTable.tsx`:

```tsx
import type { TopItemsBySlot } from "@/lib/aggregate/topItems";

export function ItemFrequencyTable({ data }: { data: TopItemsBySlot }) {
  const slots = Object.entries(data) as Array<[string, TopItemsBySlot[keyof TopItemsBySlot]]>;
  return (
    <div className="space-y-4">
      {slots.map(([slot, items]) => (
        <div key={slot}>
          <h3 className="font-semibold capitalize">{slot}</h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fixed-quality items in this slot.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr><th className="text-left">Item</th><th>Type</th><th className="text-right">Count</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.itemName}>
                    <td>{it.itemName}</td>
                    <td>{it.type}</td>
                    <td className="text-right">{it.count}</td>
                    <td className="text-right">{it.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: AffixFrequencyTable**

Create `src/components/AffixFrequencyTable.tsx`:

```tsx
import type { AffixModsBySlot } from "@/lib/aggregate/affixMods";

export function AffixFrequencyTable({ data }: { data: AffixModsBySlot }) {
  const slots = Object.entries(data) as Array<[string, AffixModsBySlot[keyof AffixModsBySlot]]>;
  return (
    <div className="space-y-4">
      {slots.map(([slot, mods]) => (
        <div key={slot}>
          <h3 className="font-semibold capitalize">{slot}</h3>
          {mods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rolled-affix items in this slot.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr><th className="text-left">Mod</th><th className="text-right">%</th><th className="text-right">Median</th><th className="text-right">P75</th></tr></thead>
              <tbody>
                {mods.slice(0, 15).map((m, i) => (
                  <tr key={m.modId} className={i < 5 ? "font-semibold text-emerald-700" : ""}>
                    <td>{m.label}</td>
                    <td className="text-right">{m.pct.toFixed(1)}%</td>
                    <td className="text-right">{m.medianValue.toFixed(0)}</td>
                    <td className="text-right">{m.p75Value.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: CharmPanel**

Create `src/components/CharmPanel.tsx`:

```tsx
import type { CharmsAggregate } from "@/lib/aggregate/charms";

export function CharmPanel({ data }: { data: CharmsAggregate }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Avg charms" value={data.avgCount.toFixed(1)} />
        <Stat label="Annihilus" value={`${data.annihilus.pct.toFixed(0)}%`} />
        <Stat label="Hellfire Torch" value={`${data.torch.pct.toFixed(0)}%`} />
        <Stat label="Gheed's" value={`${data.gheeds.pct.toFixed(0)}%`} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ModList title="Top GC mods" mods={data.topGcMods} />
        <ModList title="Top SC mods" mods={data.topScMods} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{value}</div></div>;
}

function ModList({ title, mods }: { title: string; mods: CharmsAggregate["topGcMods"] }) {
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {mods.map((m) => (
            <tr key={m.modId}><td>{m.label}</td><td className="text-right">{m.pct.toFixed(0)}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: BuildSheet**

Create `src/components/BuildSheet.tsx`:

```tsx
import type { BuildSheet as B } from "@/lib/aggregate/buildSheet";

export function BuildSheet({ data }: { data: B }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold">Skill points (avg)</h4>
        <table className="w-full text-sm">
          <tbody>
            {data.skillPoints.map((s) => (
              <tr key={s.skillName}><td>{s.skillName}</td><td className="text-right">{s.avgPoints.toFixed(1)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="font-semibold">Level distribution</h4>
        <div className="text-sm">
          {data.levelDistribution.map((b) => `L${b.level}: ${b.count}`).join("  ·  ")}
        </div>
      </div>
      <div>
        <h4 className="font-semibold">Mercenary</h4>
        <div className="text-sm">Top type: {data.mercenary.topType || "—"}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: DiffView**

Create `src/components/DiffView.tsx`:

```tsx
import type { CharacterDiff } from "@/lib/diff";

export function DiffView({ data }: { data: CharacterDiff }) {
  const slots = Object.entries(data.slots);
  return (
    <div className="space-y-4">
      {slots.map(([slot, d]) => d && (
        <div key={slot} className="rounded border p-3">
          <h4 className="font-semibold capitalize">{slot}</h4>
          <div className="text-sm">Pool top: <strong>{d.poolTopName ?? "—"}</strong></div>
          <div className="text-sm">You wear: <strong>{d.userItemName ?? "(empty)"}</strong></div>
          {!d.userMatchesPoolTop && d.poolTopMods.length > 0 && (
            <div className="mt-2 text-sm">
              Top affix mods in this slot:
              <ul>
                {d.poolTopMods.map((m) => (
                  <li key={m.modId} className={m.userHas ? "text-emerald-700" : "text-rose-700"}>
                    {m.userHas ? "✓" : "✗"} {m.label} ({m.pct.toFixed(0)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```powershell
git add src/components/
git commit -m "feat(ui): all section components"
```

---

### Task 8.4: Page wiring

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/DataFreshness.tsx`

- [ ] **Step 1: DataFreshness**

Create `src/components/DataFreshness.tsx`:

```tsx
export function DataFreshness({ source, fetchedAt }: { source: "live" | "cache" | "snapshot"; fetchedAt: number }) {
  const ageMs = Date.now() - fetchedAt;
  const ageMin = Math.floor(ageMs / 60000);
  const ageH = Math.floor(ageMin / 60);
  const human = ageH > 0 ? `${ageH}h ago` : `${ageMin}m ago`;
  return <div className="text-xs text-muted-foreground">Data: {source}, fetched {human}</div>;
}
```

- [ ] **Step 2: page.tsx**

Replace `src/app/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import modDictRaw from "../../data/mod-dictionary.json";
import { FilterForm } from "@/components/FilterForm";
import { ItemFrequencyTable } from "@/components/ItemFrequencyTable";
import { AffixFrequencyTable } from "@/components/AffixFrequencyTable";
import { CharmPanel } from "@/components/CharmPanel";
import { BuildSheet } from "@/components/BuildSheet";
import { DiffView } from "@/components/DiffView";
import { DataFreshness } from "@/components/DataFreshness";
import { loadCharacters, type LoadResult } from "@/lib/data-loader";
import { runAggregate } from "@/lib/runWorker";
import { paramsToFilter, filterToParams } from "@/lib/url-state";
import type { Filter } from "@/lib/types";
import type { GuideSections } from "@/lib/aggregate";
import type { CharacterDiff } from "@/lib/diff";
import type { ModDictionary } from "@/lib/aggregate/affixMods";

const dict = modDictRaw as ModDictionary;

const DEFAULT_FILTER: Filter = {
  gameMode: "hardcore",
  className: "Paladin",
  skills: [],
  minCharLevel: 80,
  topN: 100,
};

export default function Page() {
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [guide, setGuide] = useState<GuideSections | null>(null);
  const [diff, setDiff] = useState<CharacterDiff | null>(null);
  const [diffNotFound, setDiffNotFound] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => { loadCharacters().then(setLoadResult); }, []);

  async function run(f: Filter, mode: "guide" | "diff", diffName: string) {
    if (!loadResult) return;
    setRunning(true);
    const params = filterToParams(f, mode, diffName);
    history.replaceState(null, "", "?" + params.toString());
    const out = await runAggregate({
      characters: loadResult.characters,
      dict,
      filter: f,
      diffTarget: mode === "diff" && diffName ? { name: diffName } : undefined,
    });
    setMatchedCount(out.matchedCount);
    setGuide(out.guide);
    setDiff(out.diff);
    setDiffNotFound(out.diffNotFound);
    setRunning(false);
  }

  const initial = paramsToFilter(typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams());

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">PD2 Build Affix Aggregator</h1>
        {loadResult && <DataFreshness source={loadResult.source} fetchedAt={loadResult.fetchedAt} />}
      </header>

      <FilterForm
        initial={initial.filter ?? DEFAULT_FILTER}
        initialMode={initial.mode}
        initialDiffName={initial.diffName}
        onSubmit={run}
      />

      {!loadResult && <div>Loading characters…</div>}
      {running && <div>Aggregating…</div>}

      {guide && (
        <div className="text-sm">Matched: <strong>{matchedCount}</strong> characters</div>
      )}

      {guide && initial.mode === "guide" && (
        <>
          <Section title="Top equipped items by slot"><ItemFrequencyTable data={guide.topItemsBySlot} /></Section>
          <Section title="Most common affix mods"><AffixFrequencyTable data={guide.affixModsBySlot} /></Section>
          <Section title="Charm patterns"><CharmPanel data={guide.charms} /></Section>
          <Section title="Build sheet"><BuildSheet data={guide.build} /></Section>
        </>
      )}

      {initial.mode === "diff" && diffNotFound && (
        <div className="rounded border border-amber-500 p-3 text-sm">
          Your character isn't in the pd2.tools dataset yet. Push it via{" "}
          <a className="underline" href="https://github.com/coleestrin/pd2-character-downloader" target="_blank">pd2-character-downloader</a>.
        </div>
      )}

      {initial.mode === "diff" && diff && <Section title="Diff vs pool"><DiffView data={diff} /></Section>}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Verify dev server runs**

```powershell
npm run dev
```

Open `http://localhost:3000`. The filter form should appear. Click Generate Guide. Wait for results.

Manually check:
- Filter form renders.
- After clicking generate, the four sections populate with real data.
- Switching to "Diff my character" mode + entering a real character name produces a diff. Entering a fake name shows the not-found banner.
- URL params update on submit and survive a page reload.

- [ ] **Step 4: Commit**

```powershell
git add src/app/page.tsx src/components/DataFreshness.tsx
git commit -m "feat(ui): wire filter form + worker + sections + diff"
```

---

## Phase 9 — Deploy

### Task 9.1: Deploy to Vercel

**Files:** none

- [ ] **Step 1: Push the repo to GitHub**

```powershell
gh repo create pd2-aggregator --private --source=. --remote=origin --push
```

- [ ] **Step 2: Connect to Vercel**

In the Vercel dashboard: Add New → Project → import the GitHub repo. Framework preset = Next.js. Build command = default. Output directory = default.

- [ ] **Step 3: Verify the deployed URL**

Open the Vercel URL once the build finishes. Run the same manual checks as Task 8.4 step 3.

- [ ] **Step 4: Add deploy info to CLAUDE.md**

Update `CLAUDE.md` Status line with the deployed URL.

```powershell
git add CLAUDE.md
git commit -m "docs: add deploy URL"
git push
```

---

## REVISED PHASES (2026-05-08 mid-execution)

The phases below supersede the originals where overlap exists. Execute these in order. Tasks already completed (0.1, 0.2, 0.3, 1.1) are kept. Task 1.2 needs a redo. Phase 4, 6, 7 are mostly rewritten.

### Task R-1.2: Re-fetch snapshot with pagination

**Files:**
- Modify: `scripts/refresh-snapshot.ts`
- Modify: `data/snapshot.json` (regenerated)

The existing script grabs only 50 chars (page 1). We need a sampled snapshot of 5 pages of HC chars at minLevel ≥ 80, concatenated.

- [ ] **Step 1: Replace `scripts/refresh-snapshot.ts`** with:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://api.pd2.tools/api/v1/characters";
const PAGES = 5;
const FILTERS = "gameMode=hardcore&minLevel=80";
const OUT = join(process.cwd(), "data", "snapshot.json");

type ApiResp = { total: number; characters: unknown[] };

async function fetchPage(page: number): Promise<ApiResp> {
  const url = `${BASE}?${FILTERS}&page=${page}`;
  console.log(`Fetching page ${page} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return (await res.json()) as ApiResp;
}

async function main() {
  const all: unknown[] = [];
  let total = 0;
  for (let p = 1; p <= PAGES; p++) {
    const j = await fetchPage(p);
    total = j.total;
    all.push(...j.characters);
  }
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  const out = {
    fetchedAt: Date.now(),
    filters: FILTERS,
    pagesFetched: PAGES,
    sampleSize: all.length,
    populationTotal: total,
    characters: all,
  };
  const text = JSON.stringify(out);
  await writeFile(OUT, text, "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`  population total (HC ≥80): ${total}`);
  console.log(`  sampled: ${all.length}`);
  console.log(`  size: ${(text.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```powershell
npx tsx scripts/refresh-snapshot.ts
```

Expected: `population total (HC ≥80): 3000-3500`, `sampled: 250`, size ~17 MB.

- [ ] **Step 3: Commit**

```powershell
git add scripts/refresh-snapshot.ts data/snapshot.json
git commit -m "fix(scripts): paginate snapshot fetch (5 pages of HC ≥L80)"
```

---

### Task R-2: API client module

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/lib/api.test.ts` (smoke tests against live API)

- [ ] **Step 1: Write the client**

Create `src/lib/api.ts`:

```ts
const BASE = "https://api.pd2.tools/api/v1";

export type GameMode = "hardcore" | "softcore";

export type CommonFilter = {
  gameMode: GameMode;
  className?: string;
  minLevel?: number;
};

function qs(f: CommonFilter, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  p.set("gameMode", f.gameMode);
  if (f.className) p.set("className", f.className);
  if (f.minLevel !== undefined) p.set("minLevel", String(f.minLevel));
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}

export type ItemUsageRow = {
  item: string;
  itemType: "Unique" | "Set" | "Runeword" | "Rare" | "Magic" | "Crafted" | string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type SkillUsageRow = { name: string; numOccurrences: number; totalSample: number; pct: number };
export type MercTypeUsageRow = { name: string; numOccurrences: number; totalSample: number; pct: number };
export type MercItemUsageRow = ItemUsageRow;

export type LevelDistribution = {
  hardcore: Array<{ level: number; count: number }>;
  softcore: Array<{ level: number; count: number }>;
};

export type RawCharactersPage = {
  total: number;
  characters: unknown[]; // typed in src/lib/types.ts
};

export async function getItemUsage(f: CommonFilter): Promise<ItemUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/item-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`item-usage HTTP ${r.status}`);
  return r.json();
}

export async function getSkillUsage(f: CommonFilter): Promise<SkillUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/skill-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`skill-usage HTTP ${r.status}`);
  return r.json();
}

export async function getMercTypeUsage(f: CommonFilter): Promise<MercTypeUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/merc-type-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`merc-type-usage HTTP ${r.status}`);
  return r.json();
}

export async function getMercItemUsage(f: CommonFilter): Promise<MercItemUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/merc-item-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`merc-item-usage HTTP ${r.status}`);
  return r.json();
}

export async function getLevelDistribution(f: Pick<CommonFilter, "gameMode" | "className">): Promise<LevelDistribution> {
  const r = await fetch(`${BASE}/characters/stats/level-distribution?${qs({ gameMode: f.gameMode, className: f.className })}`);
  if (!r.ok) throw new Error(`level-distribution HTTP ${r.status}`);
  return r.json();
}

export async function getCharactersPage(
  f: Pick<CommonFilter, "gameMode" | "minLevel">,
  page: number,
): Promise<RawCharactersPage> {
  const r = await fetch(`${BASE}/characters?${qs({ gameMode: f.gameMode, minLevel: f.minLevel }, { page })}`);
  if (!r.ok) throw new Error(`characters page=${page} HTTP ${r.status}`);
  return r.json();
}

export async function getCharactersByAccount(accountName: string): Promise<unknown> {
  const r = await fetch(`${BASE}/characters/accounts/${encodeURIComponent(accountName)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`characters/accounts/${accountName} HTTP ${r.status}`);
  return r.json();
}
```

- [ ] **Step 2: Smoke tests**

Create `src/lib/api.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getLevelDistribution,
  getCharactersPage,
  getCharactersByAccount,
} from "./api";

const HC_PALA_L85 = { gameMode: "hardcore" as const, className: "Paladin", minLevel: 85 };

describe("api (smoke)", () => {
  it("getItemUsage returns rows with totalSample > 0", async () => {
    const rows = await getItemUsage(HC_PALA_L85);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].totalSample).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("item");
    expect(rows[0]).toHaveProperty("pct");
  }, 15000);

  it("getSkillUsage returns rows", async () => {
    const rows = await getSkillUsage(HC_PALA_L85);
    expect(rows.length).toBeGreaterThan(0);
  }, 15000);

  it("getMercTypeUsage returns rows", async () => {
    const rows = await getMercTypeUsage(HC_PALA_L85);
    expect(rows.length).toBeGreaterThan(0);
  }, 15000);

  it("getLevelDistribution returns hardcore + softcore arrays", async () => {
    const d = await getLevelDistribution({ gameMode: "hardcore", className: "Paladin" });
    expect(Array.isArray(d.hardcore)).toBe(true);
    expect(Array.isArray(d.softcore)).toBe(true);
  }, 15000);

  it("getCharactersPage page=1 returns 50 raw chars", async () => {
    const p = await getCharactersPage({ gameMode: "hardcore", minLevel: 80 }, 1);
    expect(p.total).toBeGreaterThan(0);
    expect(Array.isArray(p.characters)).toBe(true);
  }, 15000);

  it("getCharactersByAccount returns null for non-existent account", async () => {
    const r = await getCharactersByAccount("__definitely_not_a_real_account__zzzzzz");
    expect(r).toBeNull();
  }, 15000);
});
```

- [ ] **Step 3: Run**

```powershell
npm test -- src/lib/api.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat(api): typed client for pd2.tools v1 endpoints"
```

---

### Task R-3: Slot detection (replaces original Task 4.1)

Same as the original Task 4.1, but the slot detection now ALSO operates on the `itemType` field returned by `/characters/stats/item-usage` (which gives broad type strings like "Unique", "Set", "Runeword" but not slot info — slot is derived from the item NAME via a static lookup table, plus from the raw character `Item.location` field for the affix-mod aggregator).

**Files:**
- Create: `src/lib/slot.ts`
- Create: `src/lib/slot.test.ts`
- Create: `data/item-slots.json` (lookup table mapping unique/set/runeword item NAMES → slot)

- [ ] **Step 1: Build the item-name → slot lookup**

Use `coleestrin/pd2-tools` source (MIT-licensed per Task 1.1) OR scrape from `wiki.projectdiablo2.com` lists. Result: a JSON file like:

```json
{
  "Heart of the Oak": "weapon",
  "Crown of Ages": "helm",
  "Enigma": "armor",
  "Raven Frost": "ring",
  ...
}
```

Save to `data/item-slots.json`. This is referenced by both shape/topItems.ts and the affixMods aggregator.

- [ ] **Step 2: Write `src/lib/slot.ts`**

Two helpers, both pure:

```ts
import slotByName from "../../data/item-slots.json";
import type { Slot } from "./types";

export function slotFromItemName(itemName: string): Slot | null {
  const map = slotByName as Record<string, string>;
  const v = map[itemName];
  return (v ?? null) as Slot | null;
}

// For raw Item records (from /characters): infer slot from the location field.
// Adjust SLOT_BY_LOCATION map to match the actual `location` values seen in
// data/snapshot.json. Use scripts/inspect-snapshot.ts to enumerate them.
const SLOT_BY_LOCATION: Record<string, Slot | null> = {
  head: "helm",
  torso: "armor",
  right_arm: "weapon",
  left_arm: "offhand",
  gloves: "gloves",
  belt: "belt",
  feet: "boots",
  neck: "amulet",
  left_finger: "ring",
  right_finger: "ring",
  inventory: null,
  stash: null,
  cube: null,
};

export function slotFromRawItem(item: { location?: string; slot?: string }): Slot | null {
  const loc = (item.location ?? item.slot ?? "").toString();
  return SLOT_BY_LOCATION[loc] ?? null;
}
```

- [ ] **Step 3: Tests**

Create `src/lib/slot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slotFromItemName, slotFromRawItem } from "./slot";

describe("slotFromItemName", () => {
  it("maps Heart of the Oak to weapon", () => {
    expect(slotFromItemName("Heart of the Oak")).toBe("weapon");
  });
  it("maps Crown of Ages to helm", () => {
    expect(slotFromItemName("Crown of Ages")).toBe("helm");
  });
  it("returns null for unknown items", () => {
    expect(slotFromItemName("Totally Made Up Item Name")).toBeNull();
  });
});

describe("slotFromRawItem", () => {
  it("merges left_finger and right_finger into ring", () => {
    expect(slotFromRawItem({ location: "left_finger" })).toBe("ring");
    expect(slotFromRawItem({ location: "right_finger" })).toBe("ring");
  });
  it("returns null for inventory", () => {
    expect(slotFromRawItem({ location: "inventory" })).toBeNull();
  });
});
```

- [ ] **Step 4: Run, commit**

```powershell
npm test -- src/lib/slot.test.ts
git add src/lib/slot.ts src/lib/slot.test.ts data/item-slots.json
git commit -m "feat(slot): item-name and raw-item slot detection + lookup"
```

---

### Task R-4: shape/topItems — turn /item-usage response into UI rows

**Files:**
- Create: `src/lib/shape/topItems.ts`
- Create: `src/lib/shape/topItems.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/shape/topItems.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shapeTopItemsBySlot } from "./topItems";
import type { ItemUsageRow } from "../api";

describe("shapeTopItemsBySlot", () => {
  it("buckets rows into slots via item-name lookup, top 8 per slot", () => {
    const rows: ItemUsageRow[] = [
      { item: "Heart of the Oak", itemType: "Runeword", numOccurrences: 78, totalSample: 100, pct: 78 },
      { item: "Crown of Ages", itemType: "Unique", numOccurrences: 62, totalSample: 100, pct: 62 },
      { item: "Raven Frost", itemType: "Unique", numOccurrences: 91, totalSample: 100, pct: 91 },
    ];
    const out = shapeTopItemsBySlot(rows);
    expect(out.weapon[0]).toMatchObject({ itemName: "Heart of the Oak", pct: 78 });
    expect(out.helm[0]).toMatchObject({ itemName: "Crown of Ages", pct: 62 });
    expect(out.ring[0]).toMatchObject({ itemName: "Raven Frost", pct: 91 });
  });

  it("ignores items with no slot match", () => {
    const rows: ItemUsageRow[] = [
      { item: "Mystery Trinket", itemType: "Unique", numOccurrences: 5, totalSample: 100, pct: 5 },
    ];
    const out = shapeTopItemsBySlot(rows);
    for (const arr of Object.values(out)) expect(arr).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/shape/topItems.ts`:

```ts
import type { ItemUsageRow } from "../api";
import { slotFromItemName } from "../slot";
import type { Slot } from "../types";

const SLOTS: Slot[] = ["helm", "armor", "weapon", "offhand", "gloves", "belt", "boots", "amulet", "ring"];

export type ShapedItem = {
  itemName: string;
  itemType: string;
  count: number;
  pct: number;
};

export type TopItemsBySlot = Record<Slot, ShapedItem[]>;

export function shapeTopItemsBySlot(rows: ItemUsageRow[]): TopItemsBySlot {
  const out = Object.fromEntries(SLOTS.map((s) => [s, [] as ShapedItem[]])) as TopItemsBySlot;
  for (const row of rows) {
    const slot = slotFromItemName(row.item);
    if (!slot) continue;
    out[slot].push({ itemName: row.item, itemType: row.itemType, count: row.numOccurrences, pct: row.pct });
  }
  for (const s of SLOTS) {
    out[s].sort((a, b) => b.count - a.count);
    out[s] = out[s].slice(0, 8);
  }
  return out;
}
```

- [ ] **Step 3: Run, commit**

```powershell
npm test -- src/lib/shape/topItems.test.ts
git add src/lib/shape/topItems.ts src/lib/shape/topItems.test.ts
git commit -m "feat(shape): topItems by slot from /item-usage response"
```

---

### Task R-5: shape/buildSheet — combine /skill-usage + /level-distribution + /merc-* into one card

**Files:**
- Create: `src/lib/shape/buildSheet.ts`
- Create: `src/lib/shape/buildSheet.test.ts`

- [ ] **Step 1: Failing tests**

Create `src/lib/shape/buildSheet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shapeBuildSheet } from "./buildSheet";

describe("shapeBuildSheet", () => {
  it("assembles top 6 skills, level histogram for the active gameMode, top merc type", () => {
    const out = shapeBuildSheet({
      skills: [
        { name: "Holy Bolt", numOccurrences: 100, totalSample: 100, pct: 100 },
        { name: "Fist of the Heavens", numOccurrences: 95, totalSample: 100, pct: 95 },
      ],
      levelDist: {
        hardcore: [{ level: 99, count: 12 }, { level: 95, count: 30 }],
        softcore: [{ level: 99, count: 0 }],
      },
      mercTypes: [{ name: "Holy Freeze", numOccurrences: 70, totalSample: 100, pct: 70 }],
      mercItems: [],
      gameMode: "hardcore",
    });

    expect(out.skillFrequency[0].name).toBe("Holy Bolt");
    expect(out.levelDistribution.find((b) => b.level === 95)?.count).toBe(30);
    expect(out.mercenary.topType).toBe("Holy Freeze");
  });
});
```

- [ ] **Step 2: Implementation**

Create `src/lib/shape/buildSheet.ts`:

```ts
import type { SkillUsageRow, LevelDistribution, MercTypeUsageRow, MercItemUsageRow, GameMode } from "../api";
import { slotFromItemName } from "../slot";

export type BuildSheet = {
  skillFrequency: SkillUsageRow[];
  levelDistribution: Array<{ level: number; count: number }>;
  mercenary: {
    topType: string;
    typeFrequency: MercTypeUsageRow[];
    topItemsBySlot: Record<string, Array<{ itemName: string; pct: number }>>;
  };
};

export function shapeBuildSheet(input: {
  skills: SkillUsageRow[];
  levelDist: LevelDistribution;
  mercTypes: MercTypeUsageRow[];
  mercItems: MercItemUsageRow[];
  gameMode: GameMode;
}): BuildSheet {
  const skillFrequency = [...input.skills].sort((a, b) => b.pct - a.pct).slice(0, 12);
  const levelDistribution = input.levelDist[input.gameMode] ?? [];

  const mercItemsBySlot: Record<string, Array<{ itemName: string; pct: number }>> = {};
  for (const it of input.mercItems) {
    const slot = slotFromItemName(it.item) ?? "other";
    mercItemsBySlot[slot] ??= [];
    mercItemsBySlot[slot].push({ itemName: it.item, pct: it.pct });
  }
  for (const k of Object.keys(mercItemsBySlot)) {
    mercItemsBySlot[k].sort((a, b) => b.pct - a.pct);
    mercItemsBySlot[k] = mercItemsBySlot[k].slice(0, 5);
  }

  return {
    skillFrequency,
    levelDistribution,
    mercenary: {
      topType: input.mercTypes[0]?.name ?? "",
      typeFrequency: input.mercTypes,
      topItemsBySlot: mercItemsBySlot,
    },
  };
}
```

- [ ] **Step 3: Run, commit**

```powershell
npm test -- src/lib/shape/buildSheet.test.ts
git add src/lib/shape/buildSheet.ts src/lib/shape/buildSheet.test.ts
git commit -m "feat(shape): buildSheet from /skill-usage + /level-distribution + /merc-*"
```

---

### Task R-6 onward — Affix mods, charms, types, mod dictionary, fixtures, filter, diff, data-loader, worker, UI, deploy

Tasks R-6 through R-N follow the original plan with these substitutions:

| Original task                  | Status              | Replace with / changes                                                                                       |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Task 1.3 (sample + types)      | KEEP                | Run `inspect-snapshot.ts` on the new multi-page snapshot to derive the raw `Item.mods`/`location`/`quality` field names. |
| Task 1.4 (mod dictionary)      | KEEP                | Branch A (MIT, copy from pd2-tools) — already decided in Task 1.1.                                            |
| Task 2.1 (test fixtures)       | KEEP                | Pull a real character from new snapshot for shape reference. Hand-craft 6 chars (down from 8 — game mode now server-filtered, no need for SC fixture). |
| Task 3.1, 3.2 (filter)         | KEEP, simpler       | filter() now works on the sampled raw set only. Skill-level filter remains client-side. gameMode/minLevel are NOT in client-side filter (server already applied them). |
| Task 4.1 (slot)                | REPLACED            | Replaced by Task R-3.                                                                                        |
| Task 4.2 (top items aggregate) | DELETED             | Replaced by Task R-4 (shape).                                                                                |
| Task 4.3 (affix mods aggregate)| KEEP                | Operates on filtered sampled raw. Same logic, smaller pool size.                                              |
| Task 4.4 (charms aggregate)    | KEEP                | Operates on filtered sampled raw. Same logic.                                                                |
| Task 4.5 (build sheet aggregate)| DELETED            | Replaced by Task R-5 (shape).                                                                                |
| Task 4.6 (facade)              | REVISE              | Becomes: `getGuide(filter)` calls api + filters + aggregates + shapes, returns combined GuideSections.        |
| Task 5.1 (diff)                | REVISE              | First tries `getCharactersByAccount(name)`. Fallback: search sampled raw. UX message unchanged.               |
| Task 6.1 (data-loader)         | REVISE              | Caches per-endpoint per-filter-combo in IndexedDB. Sample-set has 24h TTL. Server aggregates have 1h TTL.    |
| Task 7.1 (worker)              | REVISE              | Worker only runs filter + affix mods + charms. Server aggregates fetched on main thread.                      |
| Phase 8 (UI)                   | KEEP                | Components mostly unchanged. Page wiring updates to call `getGuide(filter)` on submit, surfaces n= badges showing item-usage sample size separately from affix-mods sample size. |
| Phase 9 (deploy)               | KEEP                | Unchanged.                                                                                                   |

**Detailed task text for each of these will be written incrementally as we reach them, since the principles are now established.**

---

## Self-review

This section is for the plan author, not the executor.

**Spec coverage:**
- [x] Filter form (class + skills + gameMode + minLevel + topN) — Task 8.2
- [x] IndexedDB cache + 24h TTL + snapshot fallback — Task 6.1
- [x] Web Worker for filter+aggregate — Task 7.1
- [x] Top equipped items by slot — Task 4.2
- [x] Affix mods by slot with median + p75 — Task 4.3
- [x] Charm patterns + anni/torch/gheed detection — Task 4.4
- [x] Build sheet (skills + level dist + merc) — Task 4.5
- [x] Diff mode with found/not-found UX — Task 5.1 + 8.4
- [x] URL state sync — Task 8.2 (url-state) + 8.4 (page wiring)
- [x] Mod dictionary build script + coverage report — Task 1.4
- [x] License decision recorded — Task 1.1
- [x] Snapshot refresh script — Task 1.2

**Placeholder scan:** Three places with explicit `CONFIRM` markers — they are not "TBD"; they are "verify against the actual snapshot output during implementation":
1. `Item.mods` field name in `src/lib/types.ts`.
2. `isHardcore()` discriminator in `src/lib/filter.ts`.
3. `character.stats` path in `src/lib/aggregate/buildSheet.ts`.

These are correct as-is — the plan can't pin these without running `inspect-snapshot.ts` against live data, which is itself a task.

**Type consistency:** `Slot` defined in `types.ts` is reused in every aggregator. `ModDictionary` defined in `affixMods.ts` is imported by `charms.ts`, `runWorker.ts`, and `page.tsx`. `GuideSections` defined in `aggregate.ts` is imported by `diff.ts`, the worker, and the page.

**Scope:** focused on a single static-export web app. No decomposition needed.

---
