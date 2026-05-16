import { describe, it, expect } from "vitest";
import { parsePriceHr, median, formatPrice } from "./parse";

describe("parsePriceHr", () => {
  it("parses plain numeric strings", () => {
    expect(parsePriceHr("12")).toBe(12);
    expect(parsePriceHr("0.5")).toBe(0.5);
  });
  it("parses leading-dot fractions", () => {
    expect(parsePriceHr(".50")).toBe(0.5);
    expect(parsePriceHr(".25")).toBe(0.25);
  });
  it("returns null for invalid, zero, or negative prices", () => {
    expect(parsePriceHr("")).toBeNull();
    expect(parsePriceHr("0")).toBeNull();
    expect(parsePriceHr("-1")).toBeNull();
    expect(parsePriceHr("abc")).toBeNull();
    expect(parsePriceHr("1abc")).toBeNull();
    expect(parsePriceHr(undefined)).toBeNull();
  });
  it("accepts an optional 'HR' suffix (any case)", () => {
    expect(parsePriceHr("1 HR")).toBe(1);
    expect(parsePriceHr("0.5 hr")).toBe(0.5);
    expect(parsePriceHr("2.5HR")).toBe(2.5);
    expect(parsePriceHr("  3 Hr  ")).toBe(3);
  });
  it("accepts European-style comma decimals", () => {
    expect(parsePriceHr("2,75")).toBe(2.75);
    expect(parsePriceHr("0,5 hr")).toBe(0.5);
  });
  it("rejects multi-currency or noise strings", () => {
    expect(parsePriceHr("1 hr / 30 wss")).toBeNull();
    expect(parsePriceHr("45wss")).toBeNull();
    expect(parsePriceHr("ist / 0.15hr")).toBeNull();
  });
});

describe("median", () => {
  it("returns the middle value for odd-length arrays", () => {
    expect(median([1, 2, 3])).toBe(2);
  });
  it("averages the two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns NaN for empty arrays", () => {
    expect(median([])).toBeNaN();
  });
  it("handles unsorted input", () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });
});

describe("formatPrice", () => {
  it("renders whole HR without decimals", () => {
    expect(formatPrice(12)).toBe("12 HR");
    expect(formatPrice(1)).toBe("1 HR");
  });
  it("renders sub-1 HR with a tilde + 1 decimal", () => {
    expect(formatPrice(0.5)).toBe("~0.5 HR");
    expect(formatPrice(0.25)).toBe("~0.3 HR");
  });
  it("renders non-integer >1 HR with 1 decimal", () => {
    expect(formatPrice(2.5)).toBe("2.5 HR");
  });
});
