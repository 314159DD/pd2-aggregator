import { describe, it, expect } from "vitest";
import itemSlots from "../../../data/item-slots.json";
import type { ItemUsageRow, SkillUsageRow } from "../api";

import amazonLightningFury from "./fixtures/amazon-lightning-fury.json";
import assassinLightningTrapsin from "./fixtures/assassin-lightning-trapsin.json";
import barbarianWhirlwind from "./fixtures/barbarian-whirlwind.json";
import druidWindTornado from "./fixtures/druid-wind-tornado.json";
import necromancerBoneSpear from "./fixtures/necromancer-bone-spear.json";
import paladinHammerdin from "./fixtures/paladin-hammerdin.json";
import sorceressBlizzard from "./fixtures/sorceress-blizzard.json";

type MetaTopItem = { itemName: string; itemType: string; count: number; pct: number };
type Fixture = {
  _meta: { build: string; fetchedAt: string; filter: unknown; skills: unknown; api?: string; season?: number };
  itemUsage: ItemUsageRow[];
  skillUsage: SkillUsageRow[];
  meta?: { poolSize: number; topItemsBySlot: Record<string, MetaTopItem[]> };
};

const FIXTURES: Fixture[] = [
  amazonLightningFury,
  assassinLightningTrapsin,
  barbarianWhirlwind,
  druidWindTornado,
  necromancerBoneSpear,
  paladinHammerdin,
  sorceressBlizzard,
] as unknown as Fixture[];

const SLOTS = itemSlots as Record<string, string>;
const COVERAGE_FLOOR = 0.95;
// Unique charms have no equipment slot by design, so they are not slot items.
const UNIQUE_CHARM_NAMES = new Set(["Hellfire Torch", "Annihilus", "Gheed's Fortune"]);

describe("parity of captured API responses per canonical build", () => {
  for (const f of FIXTURES) {
    describe(f._meta.build, () => {
      it("itemUsage and skillUsage are non-empty", () => {
        expect(f.itemUsage.length, `${f._meta.build}: itemUsage empty, fixture may be stale`).toBeGreaterThan(0);
        expect(f.skillUsage.length, `${f._meta.build}: skillUsage empty, fixture may be stale`).toBeGreaterThan(0);
      });

      it("totalSample agrees between itemUsage and skillUsage", () => {
        expect(f.skillUsage[0].totalSample).toBe(f.itemUsage[0].totalSample);
      });

      it(`item-slot coverage >= ${COVERAGE_FLOOR * 100}%`, () => {
        const slotItems = f.itemUsage.filter((r) => !UNIQUE_CHARM_NAMES.has(r.item));
        const missing = slotItems.filter((r) => !SLOTS[r.item]);
        const coverage = (slotItems.length - missing.length) / slotItems.length;
        expect(
          coverage,
          `${f._meta.build}: missing examples: ${missing.slice(0, 10).map((r) => `${r.itemType}: ${r.item}`).join(", ")}`,
        ).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
      });

      it("meta key is present once the fixture was captured from our API", () => {
        if (f._meta.api) expect(f.meta, `${f._meta.build}: _meta.api set but meta missing`).toBeDefined();
      });

      it.skipIf(!f.meta)("meta.poolSize equals itemUsage totalSample", () => {
        expect(f.meta!.poolSize).toBe(f.itemUsage[0].totalSample);
      });

      it.skipIf(!f.meta)("meta top items exist in itemUsage with identical pct and count", () => {
        expect(Object.values(f.meta!.topItemsBySlot).flat().length, `${f._meta.build}: no top items`).toBeGreaterThan(0);
        const byName = new Map(f.itemUsage.map((r) => [r.item, r]));
        for (const [slot, items] of Object.entries(f.meta!.topItemsBySlot)) {
          for (const entry of items) {
            const row = byName.get(entry.itemName);
            expect(row, `${f._meta.build}/${slot}: "${entry.itemName}" invented`).toBeDefined();
            expect(entry.pct, `${slot}/${entry.itemName} pct`).toBe(row!.pct);
            expect(entry.count, `${slot}/${entry.itemName} count`).toBe(row!.numOccurrences);
          }
        }
      });

      it.skipIf(!f.meta)("meta top items sit in the slot item-slots.json gives them", () => {
        for (const [slot, items] of Object.entries(f.meta!.topItemsBySlot)) {
          for (const entry of items) {
            expect(SLOTS[entry.itemName], `${f._meta.build}: "${entry.itemName}" in ${slot}`).toBe(slot);
          }
        }
      });
    });
  }
});
