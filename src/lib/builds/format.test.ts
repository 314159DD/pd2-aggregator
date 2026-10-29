import { describe, expect, it } from "vitest";
import { formatAgo, formatCount, formatHr, formatPct } from "./format";

describe("format", () => {
  it("formatHr", () => {
    expect(formatHr(null)).toBe("n/a");
    expect(formatHr(0.6)).toBe("0.60");
    expect(formatHr(10.43)).toBe("10.4");
    expect(formatHr(123.4)).toBe("123");
  });
  it("formatPct", () => {
    expect(formatPct(9.43)).toBe("9.4%");
    expect(formatPct(12.2)).toBe("12%");
    expect(formatPct(0)).toBe("0%");
  });
  it("formatCount", () => expect(formatCount(12293)).toBe("12,293"));
  it("formatAgo", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(formatAgo("2026-10-29T11:57:00Z", now)).toBe("3m ago");
    expect(formatAgo("2026-10-29T10:00:00Z", now)).toBe("2h ago");
    expect(formatAgo("2026-10-25T12:00:00Z", now)).toBe("4d ago");
  });
});
