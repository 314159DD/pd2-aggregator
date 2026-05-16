import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { computePriceEntry } from "./build-price-snapshot";

describe("computePriceEntry", () => {
  it("computes median + low + high from a real API page", async () => {
    const raw = await readFile(
      join(process.cwd(), "scripts/fixtures/market-listing-uniques.json"),
      "utf8",
    );
    const page = JSON.parse(raw) as { data: { price: string; item: { corrupted?: boolean } }[] };
    const entry = computePriceEntry(page.data, { type: "Unique", uniqueId: 276 });
    expect(entry).not.toBeNull();
    if (entry === null) return;
    expect(entry.sampleCount).toBeGreaterThan(0);
    expect(entry.medianHr).toBeGreaterThan(0);
    expect(entry.low).toBeLessThanOrEqual(entry.medianHr);
    expect(entry.high).toBeGreaterThanOrEqual(entry.medianHr);
  });

  it("returns null when no parseable prices remain", () => {
    const entry = computePriceEntry(
      [{ price: "0", item: {} }, { price: "abc", item: {} }],
      { type: "Unique", uniqueId: 1 },
    );
    expect(entry).toBeNull();
  });

  it("drops corrupted listings", () => {
    const entry = computePriceEntry(
      [
        { price: "1", item: { corrupted: true } },
        { price: "2", item: { corrupted: false } },
      ],
      { type: "Unique", uniqueId: 1 },
    );
    expect(entry).not.toBeNull();
    expect(entry!.sampleCount).toBe(1);
    expect(entry!.medianHr).toBe(2);
  });
});
