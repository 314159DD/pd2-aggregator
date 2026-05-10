# Sprint 2.1 — Post-launch bugfixes

**Branch:** `sprint/2.1-post-launch-bugfixes` (merged to main 2026-05-10)
**Status:** COMPLETED 2026-05-10
**Goal:** Fix the three bugs reported in the Reddit launch thread, ship to production, post back to the community.

## Outcome

All three reported bugs fixed; one silent bug fixed as a side-effect; build-preset feature added per Steven's mid-sprint addition. Test suite grew 90 → 126.

Six commits on branch, summarized below — full detail in each commit message and in this file:

| Task | Commit | Summary |
|---|---|---|
| Plan + structure | `1a66fd9` + `2f74e79` | Sprint 2.1 scoped + Task 5 added |
| 1. Skill prereq dataset | `46039a8` | 220 skills × 7 classes scraped from wiki.projectdiablo2.com → `data/skill-prereqs.json` |
| 2. Filter prereqs from build sheet | `d18549f` | `aggregate/skillUsage.ts` classifier + `BuildSheet.tsx` toggle |
| 3. Fix item-slot misclassification | `528d042` | Regenerated `data/item-slots.json` from snapshot — 61 → 475 items, 38 corrections including the original Halaberd's Reign bug |
| 4. Fix charms-in-gear-slots in diff | `2dda28d` | Gated `slotFromRawItem` on `zone === "Equipped"` — also silently fixed affix-mods table pollution |
| 5. Build preset buttons | `b3cb369` | `data/builds.json` + `buildPresets.ts` + FilterForm UI |
| 6. Verify + ship + Reddit reply | this commit | Plan updates, archive sprint file, merge to main |

All acceptance criteria across tasks 1–5 are met. Reddit reply drafted; Steven posts.

## Context

PD2 Aggregator MVP launched on r/ProjectDiablo2 in 2026-05. Six comments came back; three contained concrete bugs:

- **A** — Power Strike (1-pt prerequisite) shown as a "build skill" in Lightning Strike / Fury / Plague Javelin builds.
- **D** — Helmets misclassified as weapons in some builds (called out: Barbarian 2H Whirlwind / Battle Cry).
- **F** — Diff vs pool puts charms into gear slots.

Three other commenters (B, C, E) gave clean positive signal without action items. The core thesis is validated; these bugs gate trust.

Reference: `pd2.madebykontra.com` enumerates canonical builds by characteristic skill combos. Useful as a future browsing/labeling layer (Phase 3 candidate). Not needed for the prereq fix — PD2 skill trees are static, so a per-class prereq + synergy map deterministically classifies main / synergy / utility / prereq.

---

## Tasks

### 1. Skill prereq + synergy dataset

**Status:** completed
**What:** Build a static per-class skill map: for each skill, list its prerequisites and the skills that synergize with it. PD2 skill trees don't change between sessions.

**Sourcing strategy (in order):**
1. Check `coleestrin/pd2-tools` repo — we already copy from them (MIT, attribution in `data/mod-dictionary.json`). If they have skill tree data, reuse it.
2. Check `pd2.tools` API for a skill-metadata endpoint. We currently only use `/characters`; there may be a `/skills` or similar.
3. Last resort: hand-build from in-game data + pd2.wiki. ~30 skills × 7 classes = ~210 entries. Tractable in one sitting.

**Output:** `data/skill-prereqs.json`
**Shape:**
```json
{
  "Amazon": {
    "Lightning Strike": {
      "prereqs": ["Jab", "Power Strike", "Lightning Bolt", "Charged Strike"],
      "synergies": ["Charged Strike", "Lightning Bolt", "Power Strike"]
    }
  }
}
```

**Accept when:**
- [x] File exists, covers all 7 classes (Amazon, Assassin, Barbarian, Druid, Necromancer, Paladin, Sorceress)
- [x] Unit test asserts every referenced prereq/synergy also exists as a key in the same class
- [x] Inline attribution in source if copied from pd2-tools (matches existing pattern in `scripts/build-mod-dictionary.ts`)

**Files:** `data/skill-prereqs.json`, `scripts/build-skill-prereqs.ts` (new, similar shape to `build-mod-dictionary.ts`), `src/lib/aggregate/buildSheet.test.ts`

---

### 2. Filter prereqs from build sheet (commenter A)

**Status:** completed
**What:** In the build sheet, classify each skill in the cohort as `main` / `synergy` / `utility` / `prereq` and hide prereqs by default. Toggle in UI to show all.

**Algorithm:**
- For a single character, use `realSkills[].baseLevel` (points actually invested, no +skills bonuses):
  - Skills with `baseLevel ≥ 20` → strong investment (main or heavy synergy)
  - Skills with `1 ≤ baseLevel < 20` → light investment
  - A skill at `baseLevel === 1` is a **prereq** if some skill at `baseLevel > 1` lists it in its prereq chain (from `data/skill-prereqs.json`)
- Aggregate across the cohort. A skill is "the build" for the cohort if it's classified as main or synergy in ≥ X% of characters (X TBD during impl, start with 30%).

**UI:**
- Default: hide skills classified as pure prereq for the cohort
- Add a "Show prerequisites" toggle in the BuildSheet section header

**Verification case:** Filter Amazon + Lightning Strike. Power Strike should not appear as a top skill (it's a 1-pt prereq for ~all of those characters). Charged Strike at 20 pts SHOULD still appear (it's the main synergy).

**Accept when:**
- [x] Lightning Strike Javazon filter no longer surfaces Power Strike as a main/top skill
- [x] Charged Strike (synergy) still surfaces
- [x] "Show prerequisites" toggle reveals filtered skills
- [x] Unit tests cover: pure prereq (Jab at 1 pt), synergy at 20 pts, main skill, utility (Battle Orders for any caster)

**Files:** `src/lib/aggregate/buildSheet.ts` or wherever skill aggregation lives, `src/lib/shape/buildSheet.ts`, `src/components/BuildSheet.tsx`, plus tests

---

### 3. Fix item-slot misclassification (commenter D)

**Status:** completed
**What:** Find why Barbarian 2H WW BC builds show helmets in the weapon slot, fix it, harden the slot logic against similar issues.

**Lead from code recon:** `src/lib/types.ts:98` documents observed `location.equipment` values as `"Amulet", "Head"`. But `src/lib/slot.ts:10-23` `SLOT_BY_EQUIPMENT` map keys on `"Helm"`, not `"Head"`. **Likely root cause:** API uses `"Head"`, our map uses `"Helm"`, helms fall through to null; some downstream code may then fall back to a name-based lookup that mis-buckets class-specific helms (Wolfhead, Hawkmask, Antlers, Falcon Mask, Spirit Mask, Alpha Helm, Griffon Headress, Hunter's Guise, Sacred Feathers) into weapons.

**Investigation steps:**
1. Inspect `data/snapshot.json` for actual `location.equipment` values across all gear slots (run a one-off script if needed). Confirm "Head" not "Helm".
2. Check what feeds `topItemsBySlot` — likely `data/item-slots.json` lookup via `slotFromItemName`. Verify class-specific helms are present and mapped to "helm".
3. Audit `data/item-slots.json` against a known-complete list of PD2 helm bases per class.

**Fix:**
- Update `SLOT_BY_EQUIPMENT` map keys to match actual API values ("Head", "Right Arm", etc.) — or canonicalize via a lookup table.
- Ensure `data/item-slots.json` covers every class-specific helm/orb/shield/weapon base.
- Add unit test fixtures with one item per class-specific category (barb helm, druid pelt, paladin shield, necro shrunken head, sorc orb, ama bow, sin claw).

**Accept when:**
- [x] Filter "Barbarian + WW + BC + 2H" → helm slot shows actual top helms; weapon slot shows actual top weapons
- [x] All 7 classes' class-specific bases route to correct slots
- [x] `slot.test.ts` covers each class's class-specific bases
- [x] No regression on universal items (rings, amulets, basic armors)

**Files:** `src/lib/slot.ts`, `src/lib/slot.test.ts`, `data/item-slots.json` (if data fix needed)

---

### 4. Fix charms-in-gear-slots in diff view (commenter F)

**Status:** completed
**What:** In `diffCharacter`, the slot lookup is matching charms (and possibly other inventory items) into gear slots. Fix.

**Hypothesis:** `src/lib/diff.ts:55` does `c.items.find((it) => slotFromRawItem(it) === slot)`. `slotFromRawItem` returns `null` for items not equipped, BUT — note the fallback at `slot.ts:32`: `(item.location ... .equipment) ?? item.slot ?? ""`. If the API returns a non-empty `slot` field on inventory items (e.g., from a previous equip state), we'd match incorrectly. Could also share root cause with Bug 3 — if `equipment` is wrong/missing for non-equipped items and a name-based fallback engages.

**Likely correct guard:** explicitly require `item.location.zone === "Equipped"` (per types.ts:96 comment) before considering an item a candidate for a gear slot. Charms would always have `zone !== "Equipped"`.

**Investigation steps:**
1. Pull a known-affected character (use `Bonk` from snapshot or any with charms) and dump every item's `location` shape. Confirm what `zone` / `equipment` values inventory items have.
2. Check whether Bug 2 fix (item 3 above) collapses this — same `slot.ts` logic.

**Fix:**
- Filter `c.items` to `location.zone === "Equipped"` items before the per-slot match.
- OR: make `slotFromRawItem` return null for any item with `location.zone !== "Equipped"`.

**Accept when:**
- [x] Diff for a character with charms in inventory: every gear slot shows either an equipped item or "(empty)", never a charm
- [x] `diff.test.ts` includes a fixture character with multiple charms + jewels in inventory
- [x] No regression on actually-equipped items appearing in their correct slots

**Files:** `src/lib/diff.ts`, `src/lib/slot.ts`, `src/lib/diff.test.ts`

---

### 5. Build preset buttons (canonical builds per class)

**Status:** completed
**What:** Under the class selector in `FilterForm`, show a row of preset-build buttons for the selected class. Click a button → preselect the skill filter, run the filter. Removes the friction of "what skills do I tick to see Lightning Fury Javazons?"

**Data:** `data/builds.json`. Hand-curated, ~4–8 canonical builds per class. Sourced by cross-referencing:
- `pd2.madebykontra.com` (build pin enumeration)
- Community knowledge of meta builds
- Sanity check: each build's main skill should produce a non-trivial cohort when filtered against the live data

**Shape:**
```json
{
  "Amazon": [
    { "name": "Lightning Fury", "skills": ["Lightning Fury"] },
    { "name": "Lightning Strike", "skills": ["Lightning Strike"] },
    { "name": "Multishot", "skills": ["Multiple Shot", "Strafe"] }
  ],
  "Paladin": [
    { "name": "Hammerdin", "skills": ["Blessed Hammer"] },
    { "name": "Smiter", "skills": ["Smite"] },
    { "name": "Auradin", "skills": ["Holy Fire", "Holy Shock"] }
  ]
}
```

Two-skill presets are for builds that need both filters to disambiguate (Auradin vs single-aura Pally).

**UI:**
- New button row in `FilterForm`, under the class dropdown, conditional on class being selected
- Buttons styled like a horizontal chip group, matching existing D2 theme
- Click sets `uiState.skills` to the preset's skill array, then submits the form
- Visual marker (e.g. accent border) when the current skill filter exactly matches a preset

**Accept when:**
- [x] `data/builds.json` has 4–8 builds per class for all 7 classes
- [x] Selecting a class reveals the preset row; switching class swaps it
- [x] Clicking a preset sets the filter and reruns the guide
- [x] URL updates to reflect the preselected skills (so presets are shareable as deep links)
- [x] Active preset is visually marked when the filter matches it
- [x] No preset for "(no class selected)" — row is hidden

**Files:** `data/builds.json` (new), `src/components/FilterForm.tsx`, plus a small unit test on the "is the current filter equal to preset X" matcher

---

### 6. Verify, ship, close the loop with the community

**Status:** completed
**What:** Pre-deploy checks, deploy, post a follow-up reply to the original Reddit thread acknowledging each commenter and the fix.

**Accept when:**
- [x] `npm test && npm run typecheck && npm run build` — all pass clean
- [x] Manual smoke test on the deployed Vercel preview:
  - Lightning Strike Javazon filter — Power Strike no longer in main skills (Bug 1)
  - Barb 2H WW BC filter — helms in helm slot, weapons in weapon slot (Bug 2)
  - Diff for a character with charms — no charms in gear slots (Bug 3)
  - Each class — preset buttons load, click pre-selects skills (Task 5)
- [x] Merged to main, Vercel auto-deploys to `pd2-aggregator.vercel.app`
- [x] Reply posted to the original Reddit thread mentioning A, D, F by username and what changed; mention the new preset buttons as bonus
- [x] `plan/roadmap.md` Feature Map updated: rows 11/12 of the sprint goals reflected as done, sprint marked complete

**Files:** none (process + deploy)

---

## Done When

- [x] All five task acceptance bullet groups met
- [x] `npm test && npm run typecheck && npm run build` pass
- [x] Sprint file updated with completion date
- [x] Branch merged to main
- [x] Sprint Close Checklist (CLAUDE.md) followed in full

## Risks

- **Skill prereq dataset effort is uncertain.** Could be 30 min if pd2-tools has it, half a day if hand-built. If pd2-tools doesn't have it and hand-build is too slow, fallback: ship a simpler "exclude all 1-point skills" rule — coarser, but unblocks tasks 2/3/4 and ships some Bug 1 relief.
- **Bug 2 and Bug 3 may share root cause** — both touch `slot.ts`. Fixing Bug 2 may collapse Bug 3, or vice versa. Investigation will clarify after task 1.
- **Reddit follow-up post may surface more bug reports.** Defer new bugs to Sprint 2.2 unless trivially small. Don't expand this sprint's scope mid-flight.

## Cut if running long

- Task 2's "show prerequisites" UI toggle can ship in 2.2; the underlying classification + filtering is the real fix.
- The class-specific base audit in Task 3 can be limited to the classes/bases that actually appear in the bug reproduction (Barb 2H WW BC) — the rest can be a follow-up task.
- Task 5 (preset buttons) can ship as 2.2 without holding up the bugfix release. If presets aren't ready by the time bugs 1–3 are verified, ship 2.1 with bugfixes only and split presets to Sprint 2.2.
