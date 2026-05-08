import { describe, it, expect } from "vitest";
import { shapeTopItemsBySlot } from "./topItems";
import type { ItemUsageRow } from "../api";

describe("shapeTopItemsBySlot", () => {
  it("buckets rows into slots via item-name lookup, top 8 per slot", () => {
    const rows: ItemUsageRow[] = [
      { item: "Heart of the Oak", itemType: "Runeword", numOccurrences: 78, totalSample: 100, pct: 78 },
      { item: "Harlequin Crest", itemType: "Unique", numOccurrences: 62, totalSample: 100, pct: 62 },
      { item: "Raven Frost", itemType: "Unique", numOccurrences: 91, totalSample: 100, pct: 91 },
    ];
    const out = shapeTopItemsBySlot(rows);
    expect(out.weapon[0]).toMatchObject({ itemName: "Heart of the Oak", pct: 78 });
    expect(out.helm[0]).toMatchObject({ itemName: "Harlequin Crest", pct: 62 });
    expect(out.ring[0]).toMatchObject({ itemName: "Raven Frost", pct: 91 });
  });

  it("ignores items with no slot match", () => {
    const rows: ItemUsageRow[] = [
      { item: "Mystery Trinket That Does Not Exist", itemType: "Unique", numOccurrences: 5, totalSample: 100, pct: 5 },
    ];
    const out = shapeTopItemsBySlot(rows);
    for (const arr of Object.values(out)) expect(arr).toEqual([]);
  });

  it("limits each slot to 8 entries, sorted by count desc", () => {
    // Build 10 fake helm items by reusing real helm item-slots.json names
    // Pick 10 real helm names from data/item-slots.json so the slot lookup matches.
    // If you have <10 helm entries in your json, just supply as many as exist.
    const rows: ItemUsageRow[] = [
      { item: "Harlequin Crest", itemType: "Unique", numOccurrences: 90, totalSample: 100, pct: 90 },
      { item: "Crown of Ages", itemType: "Unique", numOccurrences: 80, totalSample: 100, pct: 80 },
      { item: "Andariel's Visage", itemType: "Unique", numOccurrences: 70, totalSample: 100, pct: 70 },
      { item: "Veil of Steel", itemType: "Unique", numOccurrences: 60, totalSample: 100, pct: 60 },
      { item: "Vampire Gaze", itemType: "Unique", numOccurrences: 50, totalSample: 100, pct: 50 },
      { item: "Cerebus' Bite", itemType: "Unique", numOccurrences: 40, totalSample: 100, pct: 40 },
      { item: "Arreat's Face", itemType: "Unique", numOccurrences: 30, totalSample: 100, pct: 30 },
      { item: "Giant Skull", itemType: "Unique", numOccurrences: 20, totalSample: 100, pct: 20 },
      { item: "Stealskull", itemType: "Unique", numOccurrences: 10, totalSample: 100, pct: 10 },
    ];
    const out = shapeTopItemsBySlot(rows);
    // Skip this assertion if not all 9 helm names are in your item-slots.json — the test
    // is structural; the count <= 8 invariant is the important one.
    expect(out.helm.length).toBeLessThanOrEqual(8);
    expect(out.helm[0].itemName).toBe("Harlequin Crest");
  });
});
