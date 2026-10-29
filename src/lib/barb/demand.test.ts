import { describe, expect, it } from "vitest";
import { absorption, coveredDays, type MarketDemand } from "./demand";
import { GOLD_DEFAULTS, computeGold } from "./gold";

const NOW = new Date("2026-11-12T00:00:00Z");
const item = { name: "Zakarum Orb", openListings: 3, openQty: 150, goneListings: 2, goneQty: 100, droppedQty: 40, medianHoursListed: 5 };
const data = (since: string, days = 7): MarketDemand => ({ trackingSince: since, days, items: [item] });
const calc = computeGold(GOLD_DEFAULTS);
const z = calc.routes[0];

describe("coveredDays", () => {
  it("is the window once tracking is older than it", () => {
    expect(coveredDays(data("2026-10-29T00:00:00Z"), NOW)).toBe(7);
  });
  it("is the tracking age when younger", () => {
    expect(coveredDays(data("2026-11-10T00:00:00Z"), NOW)).toBe(2);
  });
  it("never reaches zero", () => {
    expect(coveredDays(data("2026-11-12T00:00:00Z"), NOW)).toBeGreaterThan(0);
    expect(coveredDays({ trackingSince: null, days: 7, items: [] }, NOW)).toBeGreaterThan(0);
  });
});

describe("absorption", () => {
  it("scales a full week as is and derives stacks and farming hours", () => {
    const a = absorption(item, z, 50, data("2026-10-29T00:00:00Z"), calc, NOW);
    expect(a.reliable).toBe(true);
    expect(a.orbsPerWeek).toBe(140);
    expect(a.stacksPerWeek).toBe(2.8);
    const stacksPerHour = calc.gold / z.stackGold;
    expect(a.farmHours).toBeCloseTo(2.8 / stacksPerHour, 10);
    expect(a.wssPerWeek).toBeCloseTo(2.8 * z.wss, 10);
  });
  it("scales up young data and flags it unreliable", () => {
    const a = absorption(item, z, 50, data("2026-11-10T00:00:00Z"), calc, NOW);
    expect(a.reliable).toBe(false);
    expect(a.orbsPerWeek).toBe(490);
  });
  it("returns null farm hours without gold income", () => {
    const a = absorption(item, z, 50, data("2026-10-29T00:00:00Z"), { gold: 0 }, NOW);
    expect(a.farmHours).toBeNull();
  });
});
