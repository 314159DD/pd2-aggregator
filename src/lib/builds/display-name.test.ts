import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("masks profane names after the first character", () => expect(displayName("Fuckface")).toBe("F*******"));
  it("leaves clean names", () => expect(displayName("MC-MEEKS")).toBe("MC-MEEKS"));
});
