import { describe, expect, it } from "vitest";
import { GOLD_DEFAULTS, computeGold, shortNum } from "./gold";

describe("computeGold", () => {
  it("prices each route in gold per WSS", () => {
    const r = computeGold(GOLD_DEFAULTS);
    const gpw = Object.fromEntries(r.routes.map((x) => [x.id, Math.round(x.gpw)]));
    expect(gpw).toEqual({ z: 599_040, h: 670_720, f: 714_286 });
    expect(r.best.id).toBe("z");
  });

  it("turns the default farm into gold and WSS per hour", () => {
    const r = computeGold(GOLD_DEFAULTS);
    expect(r.runs).toBeCloseTo(108);
    expect(r.gold).toBeCloseTo(162_000_000);
    expect(r.wss).toBeCloseTo(270.43, 1);
  });

  it("rescales gold per run when GF moves away from the measured value", () => {
    const r = computeGold({ ...GOLD_DEFAULTS, gf: 1516 });
    expect(r.gfMul).toBeCloseTo(1616 / 3132);
    expect(r.lo).toBeCloseTo(1_000_000 * (1616 / 3132));
  });

  it("follows the roll toggle", () => {
    expect(computeGold({ ...GOLD_DEFAULTS, roll: "low" }).gold).toBeCloseTo(108_000_000);
    expect(computeGold({ ...GOLD_DEFAULTS, roll: "high" }).gold).toBeCloseTo(216_000_000);
  });
});

describe("shortNum", () => {
  it("abbreviates", () => {
    expect(shortNum(162_000_000)).toBe("162.0M");
    expect(shortNum(5_000_000)).toBe("5.00M");
    expect(shortNum(479_232)).toBe("479k");
  });
});
