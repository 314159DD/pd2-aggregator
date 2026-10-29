import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("masks profane names after the first character", () => expect(displayName("FuckFace")).toBe("F*******"));
  it("leaves clean names", () => expect(displayName("MC-MEEKS")).toBe("MC-MEEKS"));
  it.each(["Nobody", "Assassin", "Classic", "Japaladin", "Grasshopper", "Passion", "Peacock", "Hancock", "Bassist"])(
    "does not mask %s",
    (n) => expect(displayName(n)).toBe(n),
  );
  it.each(["FuckYou", "fuck_you", "ShitSorc", "BigAssPally"])("masks %s", (n) =>
    expect(displayName(n)).toBe(n[0] + "*".repeat(n.length - 1)),
  );
});
