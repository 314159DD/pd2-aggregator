import { afterEach, describe, expect, it, vi } from "vitest";
import { getMeta, getMetaDiff } from "./api";
import { DEFAULT_META_STATE } from "./state";

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const f = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("meta api", () => {
  it("getMeta calls /meta with the cohort", async () => {
    const f = stub(200, { poolSize: 1 });
    await getMeta(DEFAULT_META_STATE);
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url.startsWith("https://api.pd2meta.info/api/v1/meta?")).toBe(true);
    expect(url).toContain("classes=Paladin");
  });

  it("getMetaDiff returns null on 404", async () => {
    stub(404, {});
    expect(await getMetaDiff(DEFAULT_META_STATE, "Nobody")).toBeNull();
  });

  it("getMetaDiff returns the diff and encodes the name", async () => {
    const f = stub(200, { diff: { characterName: "A B" } });
    expect(await getMetaDiff(DEFAULT_META_STATE, "A B")).toEqual({ characterName: "A B" });
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/meta/diff?");
    expect(url).toContain("char=A+B");
  });
});
