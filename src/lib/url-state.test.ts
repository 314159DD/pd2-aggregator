import { describe, it, expect } from "vitest";
import { uiStateToParams, paramsToUiState, DEFAULT_UI_STATE } from "./url-state";

describe("url-state round-trip", () => {
  it("preserves all fields through to-and-from", () => {
    const orig = {
      filter: { gameMode: "hardcore" as const, className: "Paladin", minLevel: 85 },
      mode: "guide" as const,
      diffName: "",
      skills: [{ name: "Holy Bolt", minLevel: 20 }],
    };
    const round = paramsToUiState(uiStateToParams(orig));
    expect(round).toEqual(orig);
  });

  it("falls back to defaults on missing params", () => {
    const out = paramsToUiState(new URLSearchParams());
    expect(out).toEqual(DEFAULT_UI_STATE);
  });

  it("handles malformed skills JSON without throwing", () => {
    const p = new URLSearchParams();
    p.set("skills", "not json");
    const out = paramsToUiState(p);
    expect(out.skills).toEqual([]);
  });

  it("preserves diff mode + char name", () => {
    const orig = {
      filter: { gameMode: "softcore" as const, className: "Sorceress", minLevel: 90 },
      mode: "diff" as const,
      diffName: "Fotzenknecht",
      skills: [],
    };
    const round = paramsToUiState(uiStateToParams(orig));
    expect(round).toEqual(orig);
  });
});
