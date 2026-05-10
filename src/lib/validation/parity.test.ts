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

describe("server-aggregate parity per canonical build", () => {
  for (const f of FIXTURES) {
    describe(f._meta.build, () => {
      // ── Sanity: fixture is non-empty ──────────────────────────────────────
      // Catches a fixture refresh that wrote empty arrays (e.g., pd2.tools
      // outage during refresh). Without this, the remaining tests would
      // either silent-return or vacuously pass.
      it("fixture is non-empty (sanity check)", () => {
        expect(
          f.itemUsage.length,
          `${f._meta.build}: itemUsage is empty — fixture may be stale`,
        ).toBeGreaterThan(0);
        expect(
          f.skillUsage.length,
          `${f._meta.build}: skillUsage is empty — fixture may be stale`,
        ).toBeGreaterThan(0);
      });

      // ── Test 1: totalSample consistency across endpoints ──────────────────
      // The server reports the same cohort size on every stats endpoint for
      // the same filter. If item-usage's totalSample disagrees with
      // skill-usage's, the server's filter semantics changed upstream.
      it("totalSample agrees between itemUsage and skillUsage", () => {
        expect(f.skillUsage[0].totalSample).toBe(f.itemUsage[0].totalSample);
      });

      // ── Test 2: item-slot coverage ≥ 95% ──────────────────────────────────
      // Every named item the API returns SHOULD have a slot mapping in
      // data/item-slots.json. If not, it's silently dropped from the UI
      // (this is the Sprint 2.1.2 bug shape — 32% drop on Cold Arrow Amazon).
      it(`item-slot coverage ≥ ${(COVERAGE_FLOOR * 100).toFixed(0)}%`, () => {
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
              `${f._meta.build}: "${item.itemName}" is in shaped output's ${slot} bucket but slotFromItemName returned ${JSON.stringify(slotFromItemName(item.itemName))} (null = unknown to slot map)`,
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
            ).toBe(apiRow!.pct);
          }
        }
      });
    });
  }
});
