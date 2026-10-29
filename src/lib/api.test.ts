import { describe, it, expect } from "vitest";
import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getLevelDistribution,
  getCharactersPage,
  getCharactersByAccount,
} from "./api";

// Live API holds a small season-14 pool, so use a broad softcore filter.
const SC_PALADIN = { gameMode: "softcore" as const, className: "Paladin" };

describe("api (smoke)", () => {
  it("getItemUsage returns rows with totalSample > 0", async () => {
    const rows = await getItemUsage(SC_PALADIN);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].totalSample).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("item");
    expect(rows[0]).toHaveProperty("pct");
  }, 15000);

  it("getSkillUsage returns rows", async () => {
    const rows = await getSkillUsage(SC_PALADIN);
    expect(rows.length).toBeGreaterThan(0);
  }, 15000);

  it("getMercTypeUsage returns rows", async () => {
    const rows = await getMercTypeUsage(SC_PALADIN);
    expect(rows.length).toBeGreaterThan(0);
  }, 15000);

  it("getLevelDistribution returns hardcore + softcore arrays", async () => {
    const d = await getLevelDistribution({ gameMode: "hardcore", className: "Paladin" });
    expect(Array.isArray(d.hardcore)).toBe(true);
    expect(Array.isArray(d.softcore)).toBe(true);
  }, 15000);

  it("getCharactersPage page=1 returns raw chars", async () => {
    const p = await getCharactersPage({ gameMode: "softcore" }, 1);
    expect(p.total).toBeGreaterThan(0);
    expect(Array.isArray(p.characters)).toBe(true);
  }, 15000);

  it("getCharactersByAccount returns null for non-existent account", async () => {
    const r = await getCharactersByAccount("__definitely_not_a_real_account__zzzzzz");
    expect(r).toBeNull();
  }, 15000);
});
