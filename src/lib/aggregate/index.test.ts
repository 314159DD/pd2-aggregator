import { describe, it, expect } from "vitest";
import { aggregateClientSide } from "./index";
import type { Character } from "../types";
import type { ModDictionary } from "./types";

describe("aggregateClientSide", () => {
  it("returns poolSize equal to filtered chars length", async () => {
    const { default: snap } = await import("../../../data/snapshot.json");
    const { filterCharacters } = await import("../filter");
    const { default: dict } = await import("../../../data/mod-dictionary.json");

    const chars = (snap as { characters: Character[] }).characters;
    const paladins = filterCharacters(chars, { className: "Paladin", skills: [] });

    const result = aggregateClientSide(paladins, dict as ModDictionary);

    expect(result.poolSize).toBe(paladins.length);
    expect(result.poolSize).toBeGreaterThan(0);
  }, 30_000);

  it("returns non-empty affixModsBySlot for Paladin pool", async () => {
    const { default: snap } = await import("../../../data/snapshot.json");
    const { filterCharacters } = await import("../filter");
    const { default: dict } = await import("../../../data/mod-dictionary.json");

    const chars = (snap as { characters: Character[] }).characters;
    const paladins = filterCharacters(chars, { className: "Paladin", skills: [] });

    const result = aggregateClientSide(paladins, dict as ModDictionary);

    // Should have at least one slot with mods
    const slots = Object.keys(result.affixModsBySlot);
    expect(slots.length).toBeGreaterThan(0);

    // Ring slot should be populated
    const ring = result.affixModsBySlot.ring ?? [];
    expect(ring.length).toBeGreaterThan(0);
    expect(ring[0].count).toBeGreaterThan(0);

    console.info(
      `[facade smoke] poolSize=${result.poolSize}, ` +
      `ring top mod: ${ring[0]?.modName ?? "none"}, n=${ring[0]?.count ?? 0}`,
    );
  }, 30_000);

  it("returns non-zero charms aggregate for Paladin pool", async () => {
    const { default: snap } = await import("../../../data/snapshot.json");
    const { filterCharacters } = await import("../filter");
    const { default: dict } = await import("../../../data/mod-dictionary.json");

    const chars = (snap as { characters: Character[] }).characters;
    const paladins = filterCharacters(chars, { className: "Paladin", skills: [] });

    const result = aggregateClientSide(paladins, dict as ModDictionary);

    expect(result.charms.avgCount).toBeGreaterThan(0);
  }, 30_000);

  it("returns poolSize 0 and empty aggregates for empty pool", () => {
    const result = aggregateClientSide([], {});
    expect(result.poolSize).toBe(0);
    expect(Object.keys(result.affixModsBySlot)).toHaveLength(0);
    expect(result.charms.avgCount).toBe(0);
    expect(result.avgStats).toHaveLength(0);
  });

  it("returns non-empty avgStats for Paladin pool with FCR > 0", async () => {
    const { default: snap } = await import("../../../data/snapshot.json");
    const { filterCharacters } = await import("../filter");
    const { default: dict } = await import("../../../data/mod-dictionary.json");

    type Snap = { characters: import("../types").Character[] };
    type Dict = import("./types").ModDictionary;

    const chars = (snap as Snap).characters;
    const paladins = filterCharacters(chars, { className: "Paladin", skills: [] });

    const result = aggregateClientSide(paladins, dict as Dict);

    expect(result.avgStats.length).toBeGreaterThan(0);

    // FCR should be a common Paladin stat
    const fcr = result.avgStats.find((s) => s.modName === "item_fastercastrate");
    expect(fcr).toBeDefined();
    expect(fcr!.avgValue).toBeGreaterThan(0);
    expect(fcr!.pctOfChars).toBeGreaterThan(0);
    expect(fcr!.pctOfChars).toBeLessThanOrEqual(1);

    console.info(
      `[avgStats smoke] FCR avg=${fcr?.avgValue.toFixed(1)}, ` +
      `pctOfChars=${((fcr?.pctOfChars ?? 0) * 100).toFixed(0)}%`,
    );
  }, 30_000);
});
