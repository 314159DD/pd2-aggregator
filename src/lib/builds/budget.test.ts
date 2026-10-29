import { describe, expect, it } from "vitest";
import { budgetIndex, GEAR_BUDGET_STOPS } from "./budget";

describe("budgetIndex", () => {
  it("maps null to Any (last)", () => expect(budgetIndex(null)).toBe(13));
  it("rounds up to the next stop", () => {
    expect(budgetIndex(4)).toBe(6);
    expect(budgetIndex(0)).toBe(0);
    expect(budgetIndex(50)).toBe(12);
    expect(budgetIndex(80)).toBe(13);
    expect(GEAR_BUDGET_STOPS[13]).toBeNull();
  });
});
