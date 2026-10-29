import { describe, expect, it } from "vitest";
import { classIconUrl, itemArtUrl, skillIconUrl } from "./item-art";

describe("itemArtUrl", () => {
  it("special cases", () => {
    expect(itemArtUrl({ name: "Annihilus", invCode: "cm1" })).toBe("/equipment_icons/anni.png");
    expect(itemArtUrl({ name: "Hellfire Torch", invCode: "cm2" })).toBe("/equipment_icons/torch.png");
    expect(itemArtUrl({ name: "Gheed's Fortune", invCode: "cm3" })).toBe("/equipment_icons/lcha.png");
  });
  it("charms by base type", () => {
    expect(itemArtUrl({ name: "Some Charm", invCode: "x", baseType: "Small Charm" })).toBe("/equipment_icons/scha.png");
    expect(itemArtUrl({ name: "Some Charm", invCode: "x", baseType: "Medium Charm" })).toBe("/equipment_icons/mcha.png");
  });
  it("bundled images", () =>
    expect(itemArtUrl({ name: "Harlequin Crest", invCode: "uap" })).toBe("/equipment_icons/Harlequin_Crest.png"));
  it("remote fallback and null", () => {
    expect(itemArtUrl({ name: "Some Unique", invCode: "ghm" })).toBe("https://projectdiablo2.com/image/items/invghm.png");
    expect(itemArtUrl({ name: "Some Unique", invCode: null })).toBeNull();
  });
  it("skill and class icons", () => {
    expect(skillIconUrl("Fist of the Heavens")).toBe("/icons/Fist_of_the_Heavens.png");
    expect(classIconUrl("Paladin")).toBe("/classes/Paladin.webp");
  });
});
