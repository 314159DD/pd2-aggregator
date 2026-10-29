import { describe, expect, it } from "vitest";
import { DEFAULT_META_STATE, metaApiParams, parseMetaState, serializeMetaState } from "./state";

const parse = (q: string) => parseMetaState(new URLSearchParams(q));

describe("parseMetaState", () => {
  it("parses an old shared link", () => {
    expect(
      parse('className=Paladin&skills=[{"name":"Blessed Hammer","minLevel":20}]&gameMode=hardcore&minLevel=85&mode=guide&char='),
    ).toEqual({
      ...DEFAULT_META_STATE,
      className: "Paladin",
      gameMode: "hardcore",
      minLevel: 85,
      mode: "guide",
      char: "",
      skills: [{ name: "Blessed Hammer", minLevel: 20 }],
    });
  });

  it("normalises hostile values", () => {
    expect(parse("minLevel=60").minLevel).toBe(80);
    expect(parse("minLevel=abc").minLevel).toBe(80);
    expect(parse("minLevel=120").minLevel).toBe(99);
    expect(parse("skills=notjson").skills).toEqual([]);
    expect(parse('skills=[{"name":1}]').skills).toEqual([]);
    expect(parse("className=Wizard").className).toBe("Paladin");
    expect(parse("mode=foo").mode).toBe("guide");
    expect(parse("gameMode=HARDCORE").gameMode).toBe("hardcore");
    expect(parse("char=%20%20Foo%20Bar%20").char).toBe("Foo Bar");
    expect(parse(`char=${"x".repeat(80)}`).char).toHaveLength(50);
  });

  it("clamps skill levels and drops bad entries", () => {
    expect(parse('skills=[{"name":"A","minLevel":0},{"name":"","minLevel":5},{"name":"B","minLevel":200},{"name":"C","minLevel":1.5}]').skills).toEqual([
      { name: "A", minLevel: 1 },
      { name: "B", minLevel: 99 },
    ]);
  });

  it("returns defaults for empty params", () => {
    expect(parse("")).toEqual(DEFAULT_META_STATE);
  });
});

describe("serializeMetaState", () => {
  it("round-trips a full diff state", () => {
    const s = {
      season: 14,
      gameMode: "hardcore" as const,
      className: "Sorceress",
      minLevel: 90,
      skills: [{ name: "Blizzard", minLevel: 20 }],
      mode: "diff" as const,
      char: "Foo",
    };
    expect(parseMetaState(serializeMetaState(s))).toEqual(s);
  });

  it("omits char and mode in guide mode", () => {
    const p = serializeMetaState({ ...DEFAULT_META_STATE, char: "Foo" });
    expect(p.has("char")).toBe(false);
    expect(p.has("mode")).toBe(false);
    expect(p.get("gameMode")).toBe("softcore");
    expect(p.get("className")).toBe("Paladin");
  });
});

describe("metaApiParams", () => {
  it("uses the server param names", () => {
    const p = metaApiParams(DEFAULT_META_STATE);
    expect(p.get("classes")).toBe("Paladin");
    expect(p.get("gameMode")).toBe("softcore");
    expect(p.get("minLevel")).toBe("80");
    expect(p.has("season")).toBe(false);
    expect(p.has("skills")).toBe(false);
  });
});
