# Kontra tier-list integration — build presets with tier letters

**Date:** 2026-05-17
**Owner:** Steven Obst
**Status:** Approved (design)

## Context

Build presets today come from `data/builds.json` — ~50 hand-curated builds across 7 classes, each `{ name, skills }`, where most presets carry a single primary skill. `FilterForm` renders them as buttons under the class selector; clicking one populates the skill filter. The list was assembled by hand from pd2.tools data plus wiki reading. It has no notion of how *good* a build currently is.

The Dark Humility community maintains a Project Diablo 2 build tier list — rigorous MPM (maps-per-minute) testing across standardized T3 maps, scored and ranked S+ down to F-. It is published as a public Google Sheet. The viewer at `pd2.madebykontra.com` ([JakubKontra/pd2-dh-tierlist](https://github.com/JakubKontra/pd2-dh-tierlist)) is a static React bundle that reads that sheet live and renders tiers; it has no backend and no API of its own.

This project replaces the hand-rolled preset list with builds derived from the DH tier list, and surfaces each build's tier letter directly on its preset button.

## Goals

1. **Preset buttons sourced from the DH tier list** — all 7 classes, every tier-listed build.
2. **Tier letter on every preset button** — a small colour-coded square fused to the left edge of the button, build name beside it, one cohesive button. Presets sorted by tier (best first) within the selected class.
3. **Nightly refresh** — tier data tracks the DH sheet without manual work.
4. **A curated build→skills mapping** — the one piece the DH data cannot provide (see below), maintained as a committed data file.

## Non-goals

- **The curation editor is out of scope.** A secured, PIN-gated on-site editor for the build→skills mapping (the `/curate` subpage) is a separate follow-up — *Project B* — with its own design doc. This project ships with the mapping seeded and refined by hand.
- No per-build detail page, no map-by-map MPM display, no compare view. We take the tier letter only.
- No live client-side fetch of the sheet — snapshot only.
- No re-hosting or re-interpretation of DH's testing. We consume their published numbers as-is.

## Data source research notes

### The sheet

The DH tier list is a public Google Sheet, ID `1ipTsARndewEJaREWfcDeuCelKWpCEcFy9nrigp220_Y`, gid `0`. CSV export:

```
https://docs.google.com/spreadsheets/d/1ipTsARndewEJaREWfcDeuCelKWpCEcFy9nrigp220_Y/export?format=csv&gid=0
```

The export endpoint 307-redirects to a `googleusercontent.com` host; the fetch must follow the redirect.

### Row shape

~130 build rows. Per build: a name (`S10-13 Tested Build` column), three tested T3 maps each with raw MPM + density + a normalized `(MPM*200)/(D+100)` figure, then `Top 3 Map Avg. MPM`, `Top 3 T3 Map Avg. Std. MPM` (the normalized average — the figure tiers are computed from), and `Top 3 Map Avg. MPM Mean`.

Build names encode a handicap level — `(H Lvl 1)`, `(H Lvl 2)`, etc. — and sometimes gear or retest annotations (`(RT'd)`, `(Schaeffer's)`). Names carry trailing/inconsistent whitespace; the parser must trim.

### Tier-cutoff legend

The `Tier-Cutoffs` and `Tiers` columns are **not** a per-build tier — they are an 18-row legend embedded alongside the first 18 build rows: a cutoff MPM paired with a tier label, e.g. `S+ ≥ 673.58`, `S ≥ 649.21`, `S- ≥ 624.84`, `A+ ≥ 600.47`, `A ≥ 576.10`, … down through `F-`. A build's tier is derived by comparing its normalized MPM against this legend. This is what the kontra viewer does at runtime.

### What the sheet does NOT have

- **No skills field.** Builds are identified by name only.
- **No reliable class field.** The trailing class-score columns are inconsistent (some rows hold a class name, others numeric scores). Class is instead derived from the build's defining skill — every PD2 skill belongs to exactly one class, and the repo already has skill→class data in `data/skill-prereqs.json`.

### Why a curated mapping is required

The preset system filters pd2.tools characters by **skill**. The DH sheet gives names and performance, never skills. Two structural reasons an automatic name→skills derivation is unreliable:

1. **Co-occurrence reveals the synergy tree, not the build.** Filtering pd2.tools by one skill and reading co-occurring skill percentages (e.g. Paladin + Holy Bolt → Fist of Heavens 97%) surfaces the whole synergy cluster. Holy Bolt and Fist of Heavens are *separate* tier-list builds but return nearly identical cohorts, because most "Holy Bolt characters" are actually FoH builds taking Holy Bolt as a synergy. Co-occurrence cannot separate tree-siblings.
2. **Some builds are not skill-distinguishable at all.** `Physical Sacrifice (1-H)` vs `(2-H)`, or the three `Holy Shock/Freeze/Fire Charge` entries, differ only by gear/aura — identical skills.

The pd2.tools co-occurrence query is therefore a *research aid* for building the mapping fast, not a runtime pipeline. The output is a human-reviewed, committed file.

## Architecture

```
Build time (nightly GH Action — .github/workflows/refresh-kontra-snapshot.yml):
  scripts/build-kontra-snapshot.ts
    1. fetch DH sheet CSV (follow the googleusercontent redirect)
    2. parse build rows + the 18-row tier-cutoff legend
    3. compute each build's tier letter
    4. join each build with data/kontra-build-skills.json (the curated mapping)
    5. apply mergeInto — collapse gear-variant builds into one preset
    6. derive class from the mapped skill (via data/skill-prereqs.json)
    7. emit data/kontra-builds.json, grouped by class, sorted by tier
    8. report builds present in the sheet but absent from the mapping
       (and vice versa) to stderr / a non-fatal warning

Runtime (static export):
  buildPresets.ts imports data/kontra-builds.json
    -> FilterForm renders tier-badged preset buttons
```

### Files

| File | Kind | Purpose |
|------|------|---------|
| `scripts/build-kontra-snapshot.ts` | new | The pipeline above. |
| `.github/workflows/refresh-kontra-snapshot.yml` | new | Nightly run, mirrors `refresh-price-snapshot.yml`. |
| `data/kontra-build-skills.json` | new, committed | Curated build→skills mapping. Source of truth for skills. |
| `data/kontra-builds.json` | new, generated | Preset data consumed by the UI. Refreshed by the script. |
| `src/lib/kontra/tiering.ts` | new | Tier computation (see below). |
| `src/lib/kontra/parseSheet.ts` | new | CSV → build rows + cutoff legend. Pure, unit-tested. |
| `src/lib/buildPresets.ts` | edit | Import `kontra-builds.json`; extend `BuildPreset` type. |
| `src/components/FilterForm.tsx` | edit | Tier-badge square on each preset button; sort by tier. |
| `data/builds.json` | retire | Moved to `plan/archive/` (archive, don't delete). |

### Data shapes

`data/kontra-build-skills.json` — curated, keyed by the exact (whitespace-trimmed) sheet build name:

```json
{
  "Blessed Hammer (H Lvl 1)": { "skills": ["Blessed Hammer"] },
  "Physical Sacrifice (1-H) (Schaeffer's) (RT'd)": {
    "skills": ["Sacrifice"], "mergeInto": "Physical Sacrifice"
  },
  "Physical Sacrifice (2-H) (Leoric's) (RT'd)": {
    "skills": ["Sacrifice"], "mergeInto": "Physical Sacrifice"
  },
  "Confuse (+ Amp + Iron Maiden)": {
    "skills": ["Iron Maiden", "Amplify Damage", "Confuse"]
  }
}
```

`data/kontra-builds.json` — generated, consumed by the UI:

```json
{
  "Paladin": [
    {
      "id": "blessed-hammer",
      "name": "Blessed Hammer",
      "tier": "A",
      "skills": ["Blessed Hammer"],
      "sources": ["Blessed Hammer (H Lvl 1)"]
    },
    {
      "id": "physical-sacrifice",
      "name": "Physical Sacrifice",
      "tier": "S-",
      "skills": ["Sacrifice"],
      "sources": [
        "Physical Sacrifice (1-H) (Schaeffer's) (RT'd)",
        "Physical Sacrifice (2-H) (Leoric's) (RT'd)"
      ]
    }
  ]
}
```

`sources` records which sheet rows fed the preset — useful for the curation editor (Project B) and for debugging.

### Tier computation

To guarantee our tier letters match what players see on `pd2.madebykontra.com`, `src/lib/kontra/tiering.ts` **ports the kontra repo's open-source tiering logic** (`src/data/tiering.ts` + the handicap handling — handicap level is parsed from the `(H Lvl N)` suffix). Re-deriving independently risks silent divergence from the authoritative viewer.

**First implementation task:** confirm the `JakubKontra/pd2-dh-tierlist` repo's licence permits porting with attribution (the repo is public; the project already follows an attribution practice with `coleestrin/pd2-tools`). If the licence does not permit it, fall back to re-deriving from the cutoff legend plus a documented handicap rule, and accept that edge-case tiers may differ slightly from the viewer.

### Merged variants

Builds marked with the same `mergeInto` value collapse into one preset. The merged preset's `tier` is the **highest tier among its source rows**. Its `skills` is taken from the merged group (identical by construction — that is why they merge). `sources` lists every contributing row.

### UI

`BuildPreset` gains `tier: Tier`, `className: string`, `id: string`, `sources: string[]`. `BUILD_PRESETS` is loaded from `kontra-builds.json`.

In `FilterForm`, each preset button gets a tier square flush against its left edge — no gap, one button:

```
┌──────┬─────────────────────┐
│  S+  │ Blessed Hammer      │
└──────┴─────────────────────┘
```

Square background colour by tier band: S-tiers gold, A green, B blue, C/D amber, F grey. Presets render sorted by tier, best first, within the selected class. `isPresetActive` and `PRESET_MIN_LEVEL` behaviour is unchanged — clicking still populates the skill filter from `skills`.

Builds in the sheet that have no mapping entry yet are simply omitted from `kontra-builds.json` (and flagged by the script). The intent is full curation, so this is a transitional state only.

## Testing

Unit tests, consistent with the existing parity-test discipline:

- `parseSheet.ts` — CSV with quoted fields, trailing whitespace, the embedded legend rows; build rows extracted correctly.
- `tiering.ts` — known normalized-MPM values land in the expected tier against the legend; handicap suffix parsed; spot-checked against the live kontra viewer for a handful of builds.
- Snapshot join — a build with a mapping entry produces a preset; an unmapped build is reported, not silently dropped; `mergeInto` collapses a group and picks the highest tier.
- `buildPresets.ts` — `isPresetActive` still matches order-independently with the new shape.

## Verification

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- `npx tsx scripts/build-kontra-snapshot.ts` produces a `kontra-builds.json` covering all 7 classes with no unexpected unmapped builds.
- Live check after deploy: preset buttons show tier squares, sorted by tier, and clicking still drives the filter.

## Follow-up — Project B (separate design doc)

A secured on-site curation editor for `data/kontra-build-skills.json`:

- A PIN-gated `/curate` subpage with an Excel-like editable table.
- A class filter (a convenience view — one shared PIN unlocks the whole editor).
- Save goes through a Vercel serverless function that verifies the PIN server-side and commits the mapping file to the GitHub repo (every edit a revertible commit; repo stays source of truth).
- Requires a GitHub token and PIN configured as Vercel environment variables by the repo owner.

Project B builds on the `data/kontra-build-skills.json` format defined here and will be brainstormed and specced on its own once Project A ships.
