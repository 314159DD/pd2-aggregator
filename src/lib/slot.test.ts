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
});

describe("slotFromRawItem", () => {
  it("merges left_finger and right_finger into ring", () => {
    expect(slotFromRawItem({ location: { equipment: "Left Ring" } })).toBe("ring");
    expect(slotFromRawItem({ location: { equipment: "Right Ring" } })).toBe("ring");
  });
  it("returns null for inventory", () => {
    expect(slotFromRawItem({ location: { equipment: "" } })).toBeNull();
  });
  it("returns null for unknown location", () => {
    expect(slotFromRawItem({ location: { equipment: "weird_unknown" } })).toBeNull();
  });
});
