import { describe, it, expect } from "vitest";
import { buildMarketUrl } from "./marketUrl";

describe("buildMarketUrl", () => {
  it("builds a unique URL using unique.id when available", () => {
    expect(
      buildMarketUrl({ itemType: "Unique", name: "Stone of Jordan", uniqueId: 247 }),
    ).toBe("https://www.projectdiablo2.com/market?item.unique.id=247");
  });

  it("falls back to a name search for uniques without an id", () => {
    expect(
      buildMarketUrl({ itemType: "Unique", name: "Harlequin Crest" }),
    ).toBe(
      "https://www.projectdiablo2.com/market?item.quality.name=Unique&item.name=Harlequin+Crest",
    );
  });

  it("builds a runeword URL using runeword.key when available", () => {
    expect(
      buildMarketUrl({ itemType: "Runeword", name: "Insight", runewordKey: "Runeword62" }),
    ).toBe(
      "https://www.projectdiablo2.com/market?item.is_runeword=true&item.runeword.key=Runeword62",
    );
  });

  it("falls back to a name search for runewords without a key", () => {
    expect(
      buildMarketUrl({ itemType: "Runeword", name: "Insight" }),
    ).toBe(
      "https://www.projectdiablo2.com/market?item.is_runeword=true&item.name=Insight",
    );
  });

  it("builds a set URL from name + Set quality", () => {
    expect(
      buildMarketUrl({ itemType: "Set", name: "Tal Rasha's Lidless Eye" }),
    ).toBe(
      "https://www.projectdiablo2.com/market?item.quality.name=Set&item.name=Tal+Rasha%27s+Lidless+Eye",
    );
  });

  it("itemType is case-insensitive", () => {
    expect(
      buildMarketUrl({ itemType: "set", name: "Tal Rasha's Lidless Eye" }),
    ).toBe(
      "https://www.projectdiablo2.com/market?item.quality.name=Set&item.name=Tal+Rasha%27s+Lidless+Eye",
    );
  });
});
