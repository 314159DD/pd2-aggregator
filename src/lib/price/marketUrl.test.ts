import { describe, it, expect } from "vitest";
import { buildMarketUrl } from "./marketUrl";

describe("buildMarketUrl", () => {
  it("builds a unique-item URL using unique.id", () => {
    const url = buildMarketUrl(
      { type: "Unique", uniqueId: 247, medianHr: 0.5, low: 0.3, high: 1, sampleCount: 50 },
      "Stone of Jordan",
    );
    expect(url).toBe(
      "https://www.projectdiablo2.com/market?item.unique.id=247",
    );
  });

  it("builds a runeword URL using runeword.key", () => {
    const url = buildMarketUrl(
      { type: "Runeword", runewordKey: "Runeword62", medianHr: 2, low: 1.5, high: 3.5, sampleCount: 50 },
      "Insight",
    );
    expect(url).toBe(
      "https://www.projectdiablo2.com/market?item.is_runeword=true&item.runeword.key=Runeword62",
    );
  });

  it("builds a set URL using item.name + Set quality", () => {
    const url = buildMarketUrl(
      { type: "Set", medianHr: 3, low: 2, high: 5, sampleCount: 50 },
      "Tal Rasha's Lidless Eye",
    );
    expect(url).toBe(
      "https://www.projectdiablo2.com/market?item.quality.name=Set&item.name=Tal+Rasha%27s+Lidless+Eye",
    );
  });

  it("throws when a Unique entry is missing uniqueId", () => {
    expect(() =>
      buildMarketUrl(
        { type: "Unique", medianHr: 0.5, low: 0.3, high: 1, sampleCount: 50 },
        "Stone of Jordan",
      ),
    ).toThrow(/missing uniqueId/);
  });

  it("throws when a Runeword entry is missing runewordKey", () => {
    expect(() =>
      buildMarketUrl(
        { type: "Runeword", medianHr: 2, low: 1.5, high: 3.5, sampleCount: 50 },
        "Insight",
      ),
    ).toThrow(/missing runewordKey/);
  });
});
