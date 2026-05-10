import { describe, it, expect } from "vitest";
import { slotFromItemName, slotFromRawItem } from "./slot";

describe("slotFromItemName", () => {
  it("maps Heart of the Oak to weapon", () => {
    expect(slotFromItemName("Heart of the Oak")).toBe("weapon");
  });
  it("maps Crown of Ages to helm", () => {
    expect(slotFromItemName("Harlequin Crest")).toBe("helm");
  });
  it("maps Raven Frost to ring", () => {
    expect(slotFromItemName("Raven Frost")).toBe("ring");
  });
  it("returns null for unknown items", () => {
    expect(slotFromItemName("Totally Made Up Item Name")).toBeNull();
  });

  // Regressions from the Reddit launch — commenter D ("helmets showing as
  // weapons"). These items were previously mis-mapped in data/item-slots.json.
  // The file is now regenerated from snapshot.json via build-item-slots.ts.
  describe("regressions — items previously mis-mapped (Reddit feedback, sprint 2.1)", () => {
    it("Halaberd's Reign is a unique Primal Helm (was: weapon)", () => {
      expect(slotFromItemName("Halaberd's Reign")).toBe("helm");
    });
    it("Immortal King's Will is the IK set helm (was: armor)", () => {
      expect(slotFromItemName("Immortal King's Will")).toBe("helm");
    });
    it("Immortal King's Pillar is the IK set boots (was: weapon)", () => {
      expect(slotFromItemName("Immortal King's Pillar")).toBe("boots");
    });
    it("Soul Drainer is a unique glove (was: weapon)", () => {
      expect(slotFromItemName("Soul Drainer")).toBe("gloves");
    });
    it("Sigon's Guard is the Sigon's set shield (was: gloves)", () => {
      expect(slotFromItemName("Sigon's Guard")).toBe("offhand");
    });
    it("Spirit runeword majority-equipped as shield (was: weapon)", () => {
      expect(slotFromItemName("Spirit")).toBe("offhand");
    });
    it("The Grandfather is a unique sword (dual-wield in off-hand still = weapon)", () => {
      expect(slotFromItemName("The Grandfather")).toBe("weapon");
    });
    it("Medusa's Gaze is a unique shield", () => {
      expect(slotFromItemName("Medusa's Gaze")).toBe("offhand");
    });
  });
});

describe("slotFromRawItem", () => {
  it("merges left_finger and right_finger into ring", () => {
    expect(
      slotFromRawItem({ location: { zone: "Equipped", equipment: "Left Ring" } }),
    ).toBe("ring");
    expect(
      slotFromRawItem({ location: { zone: "Equipped", equipment: "Right Ring" } }),
    ).toBe("ring");
  });
  it("returns null for inventory", () => {
    expect(slotFromRawItem({ location: { zone: "Equipped", equipment: "" } })).toBeNull();
  });
  it("returns null for unknown location", () => {
    expect(
      slotFromRawItem({ location: { zone: "Equipped", equipment: "weird_unknown" } }),
    ).toBeNull();
  });

  // Regression from the Reddit launch — commenter F ("some of my gear slots
  // are equipped with charms"). The pd2.tools API leaves location.equipment
  // populated with phantom gear-slot names on items sitting in inventory.
  // Without gating on zone, inventory charms were classified into gear slots.
  it("returns null for inventory items with phantom equipment field (sprint 2.1 bug 3)", () => {
    // Real example pulled from snapshot.json — a Small Charm of Vita sitting
    // in a Barb's inventory with equipment "Helm" still set.
    expect(
      slotFromRawItem({
        location: { zone: "Stored", equipment: "Helm" },
      }),
    ).toBeNull();
    expect(
      slotFromRawItem({
        location: { zone: "Stored", equipment: "Left Ring" },
      }),
    ).toBeNull();
    expect(
      slotFromRawItem({
        location: { zone: "Stored", equipment: "Right Hand" },
      }),
    ).toBeNull();
  });
});
