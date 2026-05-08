import { describe, it, expect } from "vitest";
import { shapeBuildSheet } from "./buildSheet";

describe("shapeBuildSheet", () => {
  it("assembles top skills, level histogram for active gameMode, top merc type", () => {
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

  it("uses the softcore distribution when gameMode is softcore", () => {
    const out = shapeBuildSheet({
      skills: [],
      levelDist: {
        hardcore: [{ level: 99, count: 100 }],
        softcore: [{ level: 99, count: 5 }],
      },
      mercTypes: [],
      mercItems: [],
      gameMode: "softcore",
    });
    expect(out.levelDistribution[0].count).toBe(5);
  });

  it("buckets merc items by slot via item-name lookup, top 5 per slot", () => {
    const out = shapeBuildSheet({
      skills: [],
      levelDist: { hardcore: [], softcore: [] },
      mercTypes: [],
      mercItems: [
        { item: "Andariel's Visage", itemType: "Unique", numOccurrences: 60, totalSample: 100, pct: 60 },
        { item: "Heart of the Oak", itemType: "Runeword", numOccurrences: 40, totalSample: 100, pct: 40 },
      ],
      gameMode: "hardcore",
    });
    // Andariel's Visage is a helm, Heart of the Oak is a weapon.
    // Both should land in their own slot buckets.
    expect(out.mercenary.topItemsBySlot.helm?.[0]?.itemName).toBe("Andariel's Visage");
    expect(out.mercenary.topItemsBySlot.weapon?.[0]?.itemName).toBe("Heart of the Oak");
  });
});
