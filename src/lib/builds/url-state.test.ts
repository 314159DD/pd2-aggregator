import { describe, expect, it } from "vitest";
import { DEFAULT_META_STATE } from "@/lib/meta/state";
import {
  DEFAULT_BUILDS_STATE as D,
  buildsHrefFromMeta,
  clearFilters,
  metaHref,
  parseBuildsState,
  serializeBuildsState,
  setBudget,
  setLevel,
  setSort,
  toApiParams,
  toggleClass,
  toggleItem,
  toggleMercItem,
  toggleMercType,
  toggleSkill,
  type BuildsState,
} from "./url-state";

describe("parseBuildsState", () => {
  it("normalises hostile params", () => {
    const s = parseBuildsState(new URLSearchParams("classes=Paladin,Wizard&minLevel=83&page=abc&maxGearHr=-1&sort=foo&dir=up"));
    expect(s.classes).toEqual(["Paladin"]);
    expect(s.minLevel).toBe(80);
    expect(s.page).toBe(1);
    expect(s.maxGearHr).toBeNull();
    expect(s.sort).toBe("level");
    expect(s.dir).toBe("desc");
  });
  it("snaps minLevel down and handles bad skills", () => {
    expect(parseBuildsState(new URLSearchParams("minLevel=97")).minLevel).toBe(95);
    expect(parseBuildsState(new URLSearchParams("minLevel=12")).minLevel).toBe(80);
    expect(parseBuildsState(new URLSearchParams("skills=notjson")).skills).toEqual([]);
  });
});

describe("serializeBuildsState", () => {
  it("omits defaults", () => expect(serializeBuildsState(D).toString()).toBe(""));
  it("round-trips a full state", () => {
    const full: BuildsState = {
      season: 14,
      gameMode: "hardcore",
      minLevel: 90,
      classes: ["Paladin", "Druid"],
      items: ["Enigma"],
      skills: [{ name: "Fist of the Heavens", minLevel: 20 }],
      mercTypes: ["Act 2 Defensive"],
      mercItems: ["Insight"],
      maxGearHr: 7.5,
      sort: "gear",
      dir: "asc",
      page: 3,
    };
    expect(parseBuildsState(serializeBuildsState(full))).toEqual(full);
  });
});

describe("toApiParams", () => {
  it("uses server names", () => {
    const p = toApiParams({ ...D, season: 14, classes: ["Paladin"], maxGearHr: 5 });
    expect(p.get("season")).toBe("14");
    expect(p.get("maxLevel")).toBe("99");
    expect(p.get("classes")).toBe("Paladin");
    expect(p.get("maxGearHr")).toBe("5");
    expect(p.get("gameMode")).toBe("softcore");
  });
});

describe("reducers", () => {
  it("toggleSkill twice returns to empty", () => {
    const once = toggleSkill(D, "Smite");
    expect(once.skills).toEqual([{ name: "Smite", minLevel: 20 }]);
    expect(toggleSkill(once, "Smite").skills).toEqual([]);
  });
  it("every reducer resets page", () => {
    const s = { ...D, page: 4 };
    for (const r of [
      toggleClass(s, "Druid"),
      toggleItem(s, "x"),
      toggleMercType(s, "x"),
      toggleMercItem(s, "x"),
      toggleSkill(s, "x"),
      setLevel(s, 90),
      setBudget(s, 2),
      setSort(s, "life"),
      clearFilters(s),
    ])
      expect(r.page).toBe(1);
  });
  it("setSort flips on same column and starts desc on a new one", () => {
    expect(setSort(D, "level").dir).toBe("asc");
    const g = setSort({ ...D, dir: "asc" }, "gear");
    expect(g.sort).toBe("gear");
    expect(g.dir).toBe("desc");
  });
  it("clearFilters keeps scope, level and sort", () => {
    const s = clearFilters({ ...D, gameMode: "hardcore", season: 3, minLevel: 90, sort: "life", classes: ["Druid"], maxGearHr: 3 });
    expect(s).toMatchObject({ gameMode: "hardcore", season: 3, minLevel: 90, sort: "life", classes: [], maxGearHr: null });
  });
});

describe("metaHref", () => {
  it("carries class and encoded skills", () => {
    const skills = [{ name: "Fist of the Heavens", minLevel: 20 }];
    const h = metaHref({ ...D, classes: ["Paladin"], skills });
    expect(h).toContain("className=Paladin");
    expect(new URLSearchParams(h.slice(2)).get("skills")).toBe(JSON.stringify(skills));
    expect(h.startsWith("/?gameMode=softcore&className=Paladin")).toBe(true);
  });
});

describe("buildsHrefFromMeta", () => {
  it("carries mode, class, skills and snaps minLevel down to a preset", () => {
    const h = buildsHrefFromMeta({
      ...DEFAULT_META_STATE,
      gameMode: "hardcore",
      className: "Paladin",
      minLevel: 87,
      skills: [{ name: "Fist of the Heavens", minLevel: 20 }],
    });
    expect(h.startsWith("/builds?")).toBe(true);
    expect(h).toContain("gameMode=hardcore");
    expect(h).toContain("classes=Paladin");
    expect(h).toContain("minLevel=85");
    expect(new URLSearchParams(h.split("?")[1]).get("skills")).toBe(JSON.stringify([{ name: "Fist of the Heavens", minLevel: 20 }]));
  });
});
